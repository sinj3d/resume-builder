use super::{compile_latex, download, layout, template};
use crate::db::DbState;
use std::collections::{HashMap, HashSet};
use tauri::{AppHandle, State};

/// Saves raw PDF bytes to the given absolute file path.
/// Called by the frontend after obtaining a path from the native save dialog.
#[tauri::command]
pub fn save_pdf(path: String, data: Vec<u8>) -> Result<(), String> {
    std::fs::write(&path, &data).map_err(|e| format!("Failed to save PDF: {}", e))
}

#[tauri::command]
pub async fn check_or_download_tectonic(app: AppHandle) -> Result<(), String> {
    download::ensure_tectonic_binary(&app).await.map(|_| ())
}

/// Returns the built-in layout presets (name + full LayoutConfig each).
#[tauri::command]
pub fn get_layout_presets() -> Result<Vec<layout::LayoutPreset>, String> {
    Ok(layout::get_presets())
}

/// Returns a fresh document skeleton for the default preset (placeholders included).
#[tauri::command]
pub fn get_default_template() -> Result<String, String> {
    Ok(layout::generate_document(&layout::LayoutConfig::default()))
}

/// Serializes compiles: concurrent Tectonic processes contend over the shared
/// bundle cache (and a first-run binary download could race itself), which
/// surfaces as compile failures with empty output.
static COMPILE_LOCK: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

#[tauri::command]
pub async fn compile_tex(source: String, app: AppHandle) -> Result<Vec<u8>, String> {
    let _guard = COMPILE_LOCK.lock().await;
    let binary_path = download::ensure_tectonic_binary(&app).await?;
    compile_latex(&source, &binary_path)
}

/// Returns the normalized category names present in a given archetype's
/// experiences, ordered by the default section order (then alphabetically).
/// This is the raw material the section composer arranges into sections.
#[tauri::command]
pub fn get_archetype_categories(
    archetype_id: i64,
    state: State<'_, DbState>,
) -> Result<Vec<String>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare(
            "SELECT DISTINCT e.category
             FROM experiences e
             JOIN archetype_experiences ae ON e.id = ae.experience_id
             WHERE ae.archetype_id = ?1",
        )
        .map_err(|e| e.to_string())?;

    let raw_categories: Vec<String> = stmt
        .query_map([archetype_id], |row| row.get(0))
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    let unique: HashSet<String> = raw_categories
        .iter()
        .map(|c| template::normalize_category(c))
        .collect();

    let default_order = template::default_section_order();
    let mut normalized: Vec<String> = unique.into_iter().collect();
    normalized.sort_by_key(|h| {
        (
            default_order
                .iter()
                .position(|&d| d == h.as_str())
                .unwrap_or(usize::MAX),
            h.clone(),
        )
    });

    Ok(normalized)
}

/// Sort key for an entry's end date: greater = more recent. "Present" sorts
/// first; unparseable dates sort last but keep their original (created_at)
/// relative order because the sort is stable.
fn date_sort_key(end: &Option<String>) -> i64 {
    const MONTHS: [&str; 12] = [
        "jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec",
    ];

    let Some(raw) = end else { return 0 };
    let s = raw.trim().to_lowercase();
    if s.is_empty() {
        return 0;
    }
    if s == "present" || s == "current" || s == "now" {
        return i64::MAX;
    }

    // "YYYY-MM" (the native month-input format), optionally "YYYY-MM-DD"
    let parts: Vec<&str> = s.split('-').collect();
    if let Ok(year) = parts[0].parse::<i64>() {
        if (1900..=3000).contains(&year) {
            let month = parts
                .get(1)
                .and_then(|m| m.parse::<i64>().ok())
                .filter(|m| (1..=12).contains(m))
                .unwrap_or(6);
            return year * 12 + month;
        }
    }

    // "Jan 2020" / "January 2020" style from imported resumes
    let words: Vec<&str> = s.split_whitespace().collect();
    if words.len() == 2 {
        if let Ok(year) = words[1].parse::<i64>() {
            if (1900..=3000).contains(&year) {
                let month = MONTHS
                    .iter()
                    .position(|m| words[0].starts_with(m))
                    .map(|p| p as i64 + 1)
                    .unwrap_or(6);
                return year * 12 + month;
            }
        }
    }

    // Bare "2020"
    if let Ok(year) = s.parse::<i64>() {
        if (1900..=3000).contains(&year) {
            return year * 12 + 6;
        }
    }

    0
}

/// Injects bio, skills, and experiences into a document generated from the
/// given layout, then returns the ready-to-compile LaTeX source string.
///
/// # Parameters
/// * `archetype_id` – Which archetype's tagged items to pull
/// * `layout`       – Full visual configuration (fonts, margins, spacing, color)
/// * `sections`     – Ordered section definitions (heading + categories each).
///                    Categories not covered by any definition are appended as
///                    their own sections so nothing silently disappears.
#[tauri::command]
pub fn inject_template(
    archetype_id: i64,
    layout: layout::LayoutConfig,
    sections: Option<Vec<layout::SectionDef>>,
    state: State<'_, DbState>,
) -> Result<String, String> {
    let (bio, skills, grouped_experiences) = {
        let conn = state.0.lock().map_err(|e| e.to_string())?;

        // 1. Fetch bio
        let bio: crate::db::models::Bio = conn
            .query_row(
                "SELECT name, email, phone, location, linkedin, github, website FROM bio WHERE id = 1",
                [],
                |row| {
                    Ok(crate::db::models::Bio {
                        name: row.get(0).ok(),
                        email: row.get(1).ok(),
                        phone: row.get(2).ok(),
                        location: row.get(3).ok(),
                        linkedin: row.get(4).ok(),
                        github: row.get(5).ok(),
                        website: row.get(6).ok(),
                    })
                },
            )
            .unwrap_or(crate::db::models::Bio {
                name: None,
                email: None,
                phone: None,
                location: None,
                linkedin: None,
                github: None,
                website: None,
            });

        // 2. Fetch tagged skills grouped by category
        let mut skill_stmt = conn
            .prepare(
                "SELECT s.category, s.name
                 FROM skills s
                 JOIN archetype_skills as_k ON s.id = as_k.skill_id
                 WHERE as_k.archetype_id = ?1
                 ORDER BY s.category ASC, s.name ASC",
            )
            .map_err(|e| e.to_string())?;

        let mut skills_by_cat: HashMap<String, Vec<String>> = HashMap::new();
        let skill_rows = skill_stmt
            .query_map([archetype_id], |row| {
                let cat: String = row.get(0)?;
                let name: String = row.get(1)?;
                Ok((cat, name))
            })
            .map_err(|e| e.to_string())?;

        for r in skill_rows.filter_map(|x| x.ok()) {
            skills_by_cat.entry(r.0).or_default().push(r.1);
        }
        let mut grouped_skills: Vec<(String, Vec<String>)> = skills_by_cat.into_iter().collect();
        grouped_skills.sort_by(|a, b| a.0.cmp(&b.0));

        // 3. Fetch experiences (with any education details), grouped by
        //    normalised category
        let mut exp_stmt = conn
            .prepare(
                "SELECT e.id, e.title, e.org, e.start_date, e.end_date, e.category,
                        ed.experience_id, ed.degree, ed.gpa, ed.coursework, ed.honors
                 FROM experiences e
                 JOIN archetype_experiences ae ON e.id = ae.experience_id
                 LEFT JOIN education_details ed ON ed.experience_id = e.id
                 WHERE ae.archetype_id = ?1
                 ORDER BY e.created_at DESC",
            )
            .map_err(|e| e.to_string())?;

        struct ExpRow {
            id: i64,
            title: String,
            org: Option<String>,
            start: Option<String>,
            end: Option<String>,
            category: String,
            education: Option<crate::db::models::EducationDetails>,
        }

        let exps_mapped = exp_stmt
            .query_map([archetype_id], |row| {
                let edu_id: Option<i64> = row.get(6)?;
                Ok(ExpRow {
                    id: row.get(0)?,
                    title: row.get(1)?,
                    org: row.get(2)?,
                    start: row.get(3)?,
                    end: row.get(4)?,
                    category: row.get(5)?,
                    education: edu_id.map(|experience_id| crate::db::models::EducationDetails {
                        experience_id,
                        degree: row.get(7).ok().flatten(),
                        gpa: row.get(8).ok().flatten(),
                        coursework: row.get(9).ok().flatten(),
                        honors: row.get(10).ok().flatten(),
                    }),
                })
            })
            .map_err(|e| e.to_string())?;

        // Build a map: normalised_category → Vec<(date_key, entry)>
        let mut category_map: HashMap<String, Vec<(i64, template::ResumeEntry)>> = HashMap::new();

        for exp in exps_mapped.filter_map(|x| x.ok()) {
            // Fetch bullets for this experience
            let mut b_stmt = conn
                .prepare(
                    "SELECT content FROM bullet_points WHERE experience_id = ?1 ORDER BY sort_order ASC",
                )
                .map_err(|e| e.to_string())?;
            let bullets: Vec<String> = b_stmt
                .query_map([exp.id], |r| r.get(0))
                .map_err(|e| e.to_string())?
                .filter_map(|x| x.ok())
                .collect();

            let heading = template::normalize_category(&exp.category);

            // Education-category entries render education-style (institution
            // headline) even before the user fills in the structured details.
            let education = if exp.education.is_some() {
                exp.education
            } else if heading == "Education" {
                Some(crate::db::models::EducationDetails {
                    experience_id: exp.id,
                    degree: None,
                    gpa: None,
                    coursework: None,
                    honors: None,
                })
            } else {
                None
            };

            let key = date_sort_key(&exp.end);
            category_map.entry(heading).or_default().push((
                key,
                template::ResumeEntry {
                    title: exp.title,
                    org: exp.org,
                    start: exp.start,
                    end: exp.end,
                    bullets,
                    education,
                },
            ));
        }

        // 4. Compose sections from the definitions; merged sections pool the
        //    entries of all their categories, sorted most-recent first.
        let defs = sections.unwrap_or_default();
        let mut groups: Vec<(String, Vec<template::ResumeEntry>)> = Vec::new();

        for def in &defs {
            let mut pooled: Vec<(i64, template::ResumeEntry)> = Vec::new();
            for cat in &def.categories {
                if let Some(entries) = category_map.remove(cat) {
                    pooled.extend(entries);
                }
            }
            if pooled.is_empty() {
                continue;
            }
            pooled.sort_by(|a, b| b.0.cmp(&a.0));
            groups.push((
                def.heading.clone(),
                pooled.into_iter().map(|(_, e)| e).collect(),
            ));
        }

        // 5. Reconciliation: categories not covered by any definition are
        //    appended as their own sections (default order, then alphabetical)
        //    so newly tagged or renamed categories never silently disappear.
        let default_order = template::default_section_order();
        let mut remainder: Vec<(String, Vec<(i64, template::ResumeEntry)>)> =
            category_map.into_iter().collect();
        remainder.sort_by_key(|(heading, _)| {
            (
                default_order
                    .iter()
                    .position(|&d| d == heading.as_str())
                    .unwrap_or(usize::MAX),
                heading.clone(),
            )
        });
        for (heading, mut entries) in remainder {
            entries.sort_by(|a, b| b.0.cmp(&a.0));
            groups.push((heading, entries.into_iter().map(|(_, e)| e).collect()));
        }

        (bio, grouped_skills, groups)
    };

    if grouped_experiences.is_empty() {
        return Err(
            "No experiences are tagged to this archetype. Tag experiences (not just bullets) \
             on the Archetypes page, otherwise the resume will have no sections."
                .to_string(),
        );
    }

    // 6. Generate the document from the layout config and inject content.
    let mut injected = layout::generate_document(&layout);

    let mut details = Vec::new();
    if let Some(l) = &bio.location { if !l.is_empty() { details.push(l.clone()); } }
    if let Some(e) = &bio.email   { if !e.is_empty() { details.push(e.clone()); } }
    if let Some(p) = &bio.phone   { if !p.is_empty() { details.push(p.clone()); } }
    if let Some(lk) = &bio.linkedin { if !lk.is_empty() { details.push(lk.clone()); } }
    if let Some(gh) = &bio.github { if !gh.is_empty() { details.push(gh.clone()); } }
    if let Some(w) = &bio.website { if !w.is_empty() { details.push(w.clone()); } }

    let name_str = bio.name.unwrap_or_default();
    injected = template::inject_bio_header(&injected, &name_str, &details);

    injected = template::inject_skills_section(&injected, &skills);

    injected = template::inject_sections_by_category(&injected, &grouped_experiences);

    Ok(injected)
}

#[cfg(test)]
mod tests {
    use super::date_sort_key;

    #[test]
    fn test_date_sort_key_ordering() {
        let present = date_sort_key(&Some("Present".to_string()));
        let recent = date_sort_key(&Some("2024-06".to_string()));
        let older = date_sort_key(&Some("Jan 2020".to_string()));
        let bare_year = date_sort_key(&Some("2019".to_string()));
        let unknown = date_sort_key(&Some("someday".to_string()));
        let none = date_sort_key(&None);

        assert!(present > recent);
        assert!(recent > older);
        assert!(older > bare_year);
        assert_eq!(unknown, 0);
        assert_eq!(none, 0);
    }

    #[test]
    fn test_date_sort_key_month_parsing() {
        assert_eq!(date_sort_key(&Some("2024-06".to_string())), 2024 * 12 + 6);
        assert_eq!(date_sort_key(&Some("Jan 2024".to_string())), 2024 * 12 + 1);
        assert_eq!(date_sort_key(&Some("December 2024".to_string())), 2024 * 12 + 12);
    }
}
