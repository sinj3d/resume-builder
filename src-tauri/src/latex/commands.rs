use super::{compile_latex, download, template};
use crate::db::DbState;
use std::collections::HashMap;
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

#[tauri::command]
pub fn get_templates() -> Result<Vec<String>, String> {
    Ok(template::get_template_names().iter().map(|&s| s.to_string()).collect())
}

#[tauri::command]
pub fn get_default_template() -> Result<String, String> {
    Ok(template::get_template(0).unwrap_or("").to_string())
}

#[tauri::command]
pub async fn compile_tex(source: String, app: AppHandle) -> Result<Vec<u8>, String> {
    let binary_path = download::ensure_tectonic_binary(&app).await?;
    compile_latex(&source, &binary_path)
}

/// Returns the list of canonical section headings present in a given archetype's experiences.
/// Used by the frontend to build the drag-and-drop ordering panel.
#[tauri::command]
pub fn get_archetype_sections(
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

    // Normalise, deduplicate, and sort by default order
    let default_order = template::default_section_order();
    let mut normalized: Vec<String> = raw_categories
        .iter()
        .map(|c| template::normalize_category(c))
        .collect();
    normalized.sort_by_key(|h| {
        default_order
            .iter()
            .position(|&d| d == h.as_str())
            .unwrap_or(usize::MAX)
    });
    normalized.dedup();

    Ok(normalized)
}

/// Injects bio, skills, and experiences into the chosen template, then returns
/// the ready-to-compile LaTeX source string.
///
/// # Parameters
/// * `archetype_id`  – Which archetype's tagged items to pull
/// * `template_idx`  – Template index (0 = Classic Maroon, 1 = Modern Blue, 2 = Minimalist Black)
/// * `target_pages`  – Desired page count for spacing calibration (1, 2, or 3)
/// * `section_order` – Ordered list of canonical section headings as the user arranged them
#[tauri::command]
pub fn inject_template(
    archetype_id: i64,
    template_idx: usize,
    target_pages: usize,
    section_order: Vec<String>,
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

        // 3. Fetch experiences WITH category, grouped by normalised section heading
        let mut exp_stmt = conn
            .prepare(
                "SELECT e.id, e.title, e.org, e.start_date, e.end_date, e.category
                 FROM experiences e
                 JOIN archetype_experiences ae ON e.id = ae.experience_id
                 WHERE ae.archetype_id = ?1
                 ORDER BY e.created_at DESC",
            )
            .map_err(|e| e.to_string())?;

        let exps_mapped = exp_stmt
            .query_map([archetype_id], |row| {
                let id: i64 = row.get(0)?;
                let title: String = row.get(1)?;
                let org: Option<String> = row.get(2)?;
                let start: Option<String> = row.get(3)?;
                let end: Option<String> = row.get(4)?;
                let category: String = row.get(5)?;
                Ok((id, title, org, start, end, category))
            })
            .map_err(|e| e.to_string())?;

        // Build a map: normalised_heading → Vec<entry>
        type Entry = (String, Option<String>, Option<String>, Option<String>, Vec<String>);
        let mut section_map: HashMap<String, Vec<Entry>> = HashMap::new();

        for exp_res in exps_mapped.filter_map(|x| x.ok()) {
            let (id, title, org, start, end, category) = exp_res;

            // Fetch bullets for this experience
            let mut b_stmt = conn
                .prepare(
                    "SELECT content FROM bullet_points WHERE experience_id = ?1 ORDER BY sort_order ASC",
                )
                .unwrap();
            let bullets: Vec<String> = b_stmt
                .query_map([id], |r| r.get(0))
                .unwrap()
                .filter_map(|x| x.ok())
                .collect();

            let heading = template::normalize_category(&category);
            section_map
                .entry(heading)
                .or_default()
                .push((title, org, start, end, bullets));
        }

        // Sort sections by user-provided order, unknown categories go to the end (alpha)
        let default_order = template::default_section_order();
        let effective_order: Vec<String> = if section_order.is_empty() {
            default_order.iter().map(|s| s.to_string()).collect()
        } else {
            section_order.clone()
        };

        let mut known: Vec<(String, Vec<Entry>)> = Vec::new();
        let mut unknown: Vec<(String, Vec<Entry>)> = Vec::new();

        // Respect user ordering first
        for heading in &effective_order {
            if let Some(entries) = section_map.remove(heading) {
                known.push((heading.clone(), entries));
            }
        }
        // Any remaining (custom / not in order list) — alphabetical
        let mut remainder: Vec<_> = section_map.into_iter().collect();
        remainder.sort_by(|a, b| a.0.cmp(&b.0));
        unknown.extend(remainder);

        let grouped_experiences = [known, unknown].concat();

        (bio, grouped_skills, grouped_experiences)
    };

    let tmpl = template::get_template(template_idx)
        .ok_or_else(|| format!("Invalid template index: {}", template_idx))?;

    let base_font_pt = template::get_base_font_pt(template_idx);

    // Inject spacing first (validates font size)
    let effective_pages = target_pages.max(1);
    let mut injected = template::inject_spacing(tmpl, effective_pages, base_font_pt)?;

    // Inject bio
    let mut details = Vec::new();
    if let Some(l) = &bio.location { if !l.is_empty() { details.push(l.clone()); } }
    if let Some(e) = &bio.email   { if !e.is_empty() { details.push(e.clone()); } }
    if let Some(p) = &bio.phone   { if !p.is_empty() { details.push(p.clone()); } }
    if let Some(lk) = &bio.linkedin { if !lk.is_empty() { details.push(lk.clone()); } }
    if let Some(gh) = &bio.github { if !gh.is_empty() { details.push(gh.clone()); } }
    if let Some(w) = &bio.website { if !w.is_empty() { details.push(w.clone()); } }

    let name_str = bio.name.unwrap_or_default();
    injected = template::inject_bio_header(&injected, &name_str, &details);

    // Inject skills
    injected = template::inject_skills_section(&injected, &skills);

    // Inject grouped experience sections
    injected = template::inject_sections_by_category(&injected, &grouped_experiences);

    Ok(injected)
}
