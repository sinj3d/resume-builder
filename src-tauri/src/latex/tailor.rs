//! Job-description-driven selection of resume content.
//!
//! Hybrid retrieval (`crate::rag::retrieval`) ranks the user's bullets against a
//! pasted job description; this module turns that ranking into an actual resume:
//! experiences ordered by relevance, bullets trimmed to the strongest ones, and
//! the whole thing cut off once the estimated height reaches the layout's
//! `target_pages`.
//!
//! The page estimate is deliberately approximate — Tectonic is the only source
//! of truth for real pagination — but it is derived from the same
//! [`LayoutConfig`] knobs the document is generated from (see
//! [`super::layout::generate_layout_block`]), so it tracks font, margin, and
//! spacing changes instead of guessing at a fixed bullet count.

use std::collections::{HashMap, HashSet};

use serde::{Deserialize, Serialize};

use super::layout::LayoutConfig;
use super::template::{ResumeEntry, SectionGroup};
use crate::db::models::Bio;

/// US Letter — the geometry `generate_layout_block` assumes.
const PAGE_W_IN: f64 = 8.5;
const PAGE_H_IN: f64 = 11.0;
const PT_PER_IN: f64 = 72.0;

/// Average glyph advance as a fraction of the font size. 0.5em is the usual
/// rule of thumb for the serif/sans faces LaTeX defaults to; it only has to
/// hold on average, because it feeds a line-count estimate and nothing else.
const AVG_CHAR_EM: f64 = 0.5;

/// LaTeX's default baseline stretch: a line of `n`pt type occupies 1.2n pt.
const BASELINE: f64 = 1.2;

/// How many bullets one experience may keep before the budget even matters.
/// Tailoring is supposed to sharpen an entry, not dump its whole history.
pub const DEFAULT_MAX_BULLETS: usize = 6;

/// A non-education entry needs at least this many bullets to be worth the
/// space its header costs.
const MIN_BULLETS: usize = 1;

/// Top-k handed to hybrid retrieval. The real ceiling is much lower — the two
/// arms contribute `ARM_POOL` candidates each — so this just means "give me
/// every fused candidate" and lets the page budget do the cutting.
pub const RETRIEVAL_TOP_K: i64 = 500;

/// What the frontend sends to tailor a resume to a specific posting.
#[derive(Debug, Clone, Default, Deserialize)]
pub struct TailorSpec {
    /// The pasted job description, used verbatim as the retrieval query.
    pub job_description: String,
    /// Cap on bullets kept under one experience. Defaults to
    /// [`DEFAULT_MAX_BULLETS`].
    #[serde(default)]
    pub max_bullets_per_entry: Option<usize>,
    /// Experiences the user switched off. Never included, but still reported
    /// so they can be switched back on.
    #[serde(default)]
    pub excluded_experience_ids: Vec<i64>,
    /// Experiences the user switched on explicitly. Admitted ahead of the
    /// retrieval ranking, so checking one that "didn't fit" makes room for it
    /// by pushing out a weaker match.
    #[serde(default)]
    pub pinned_experience_ids: Vec<i64>,
}

impl TailorSpec {
    fn max_bullets(&self) -> usize {
        self.max_bullets_per_entry
            .unwrap_or(DEFAULT_MAX_BULLETS)
            .max(1)
    }
}

/// One experience retrieval considered, and what became of it. Drives the
/// include/exclude list in the UI.
#[derive(Debug, Clone, Serialize)]
pub struct TailoredExperience {
    pub experience_id: i64,
    pub title: String,
    pub org: Option<String>,
    /// The section this entry lands in.
    pub heading: String,
    /// Bullets under this experience that matched the posting.
    pub matched_bullets: usize,
    pub kept_bullets: usize,
    /// In the resume as it stands.
    pub kept: bool,
    /// Matched the posting, but the page budget had no room left.
    pub dropped_for_space: bool,
    /// Switched off by the user.
    pub excluded: bool,
    /// Switched on by the user, so it outranks the retrieval order.
    pub pinned: bool,
}

/// What tailoring did, surfaced in the UI so the cut is legible rather than
/// mysterious.
#[derive(Debug, Clone, Serialize)]
pub struct TailorReport {
    /// Bullets retrieval surfaced as relevant to the posting.
    pub matched_bullets: usize,
    /// Of those, how many fit the page budget.
    pub kept_bullets: usize,
    pub kept_entries: usize,
    /// Experiences that matched the posting but had to be cut for space.
    pub dropped_entries: usize,
    pub target_pages: usize,
    /// Estimated length of the result, in pages (fractional).
    pub estimated_pages: f64,
    /// True when at least one matching experience was dropped for space —
    /// i.e. the page target, not the posting, is what limited the resume.
    pub budget_exhausted: bool,
    /// Every experience in the running, best-first — including the ones cut
    /// for space and the ones the user switched off.
    pub experiences: Vec<TailoredExperience>,
}

/// Vertical-space estimates derived from a [`LayoutConfig`]. Every cost is in
/// points and mirrors what `generate_layout_block` emits for that knob.
struct Metrics<'a> {
    cfg: &'a LayoutConfig,
    /// Usable text width.
    text_width_pt: f64,
    /// Usable vertical space on a single page.
    page_pt: f64,
}

impl<'a> Metrics<'a> {
    fn new(cfg: &'a LayoutConfig) -> Self {
        Metrics {
            text_width_pt: ((PAGE_W_IN - 2.0 * cfg.margin_h_in as f64) * PT_PER_IN).max(PT_PER_IN),
            page_pt: ((PAGE_H_IN - 2.0 * cfg.margin_v_in as f64) * PT_PER_IN).max(PT_PER_IN),
            cfg,
        }
    }

    /// Total vertical space the resume may occupy.
    fn budget(&self) -> f64 {
        self.page_pt * self.cfg.target_pages.max(1) as f64
    }

    /// How many wrapped lines `chars` characters occupy at `font_pt` across
    /// `width_pt`.
    fn lines(&self, chars: usize, font_pt: f64, width_pt: f64) -> f64 {
        let per_line = (width_pt / (AVG_CHAR_EM * font_pt)).max(8.0);
        (chars as f64 / per_line).ceil().max(1.0)
    }

    /// Height of body text: `\normalsize`/`\bulletsize` baselines carry the
    /// user's line-spacing multiplier.
    fn body_block(&self, chars: usize, font_pt: f64, width_pt: f64) -> f64 {
        self.lines(chars, font_pt, width_pt) * font_pt * BASELINE * self.cfg.line_spacing as f64
    }

    /// Height of heading text: `\titleformat` fixes those baselines at 1.2n,
    /// independent of line spacing.
    fn head_block(&self, chars: usize, font_pt: f64, width_pt: f64) -> f64 {
        self.lines(chars, font_pt, width_pt) * font_pt * BASELINE
    }

    /// `\parskip`, which the layout block floors at 1pt.
    fn parskip(&self) -> f64 {
        (self.cfg.item_sep_pt as f64).max(1.0)
    }

    /// A `\section*{…}`: `\titlespacing` before and after, the type itself, and
    /// the optional accent rule.
    fn heading_cost(&self) -> f64 {
        let gap = self.cfg.section_gap_pt as f64;
        let rule = if self.cfg.section_rule { 4.0 } else { 0.0 };
        gap + self.cfg.section_font_pt as f64 * BASELINE + gap * 0.6 + rule
    }

    /// The centered name/contact block plus its divider and trailing space.
    fn header_cost(&self, bio: &Bio) -> f64 {
        let mut h = 10.0; // trailing \vspace{10pt}
        if bio.name.as_deref().is_some_and(|n| !n.is_empty()) {
            h += self.cfg.name_font_pt as f64 * BASELINE + 2.0;
        }
        // Contact details join with " · " separators onto one wrapped line.
        let details: usize = [
            &bio.location,
            &bio.email,
            &bio.phone,
            &bio.linkedin,
            &bio.github,
            &bio.website,
        ]
        .iter()
        .filter_map(|f| f.as_deref())
        .filter(|s| !s.is_empty())
        .map(|s| s.chars().count() + 3)
        .sum();
        if details > 0 {
            h += self.body_block(details, self.cfg.body_font_pt as f64, self.text_width_pt);
        }
        if self.cfg.header_rule {
            h += 5.0;
        }
        h
    }

    /// The Skills section: one wrapped line per category.
    fn skills_cost(&self, skills: &[(String, Vec<String>)]) -> f64 {
        if skills.is_empty() {
            return 0.0;
        }
        let mut h = self.heading_cost();
        for (category, names) in skills {
            let chars = category.chars().count()
                + 2
                + names.iter().map(|n| n.chars().count() + 2).sum::<usize>();
            h += self.body_block(chars, self.cfg.body_font_pt as f64, self.text_width_pt)
                + self.parskip();
        }
        h + self.cfg.experience_gap_pt as f64 * 0.5 // \expvspace
    }

    /// One experience rendered with exactly `bullets` under it — see
    /// `template::render_entry` for the shape being measured.
    fn entry_cost(&self, entry: &ResumeEntry, bullets: &[&str]) -> f64 {
        let cfg = self.cfg;
        // \titlespacing* before the \subsection, then the headline itself.
        let mut h = cfg.experience_gap_pt as f64;

        let mut headline = entry.title.chars().count();
        if let Some(org) = entry.org.as_deref() {
            headline += org.chars().count() + 4; // " -- "
        }
        let dates = entry.start.as_deref().map_or(0, |s| s.chars().count())
            + entry.end.as_deref().map_or(0, |s| s.chars().count());
        if dates > 0 {
            headline += dates + 4;
        }
        h += self.head_block(headline, cfg.subsection_font_pt as f64, self.text_width_pt) + 1.0;

        if let Some(edu) = &entry.education {
            let body = cfg.body_font_pt as f64;
            // Degree and GPA share one line; coursework and honors get their own.
            let degree = edu.degree.as_deref().map_or(0, |s| s.trim().chars().count())
                + edu.gpa.as_deref().map_or(0, |s| s.trim().chars().count() + 8);
            for chars in [
                degree,
                edu.coursework
                    .as_deref()
                    .map_or(0, |s| s.trim().chars().count() + 21),
                edu.honors
                    .as_deref()
                    .map_or(0, |s| s.trim().chars().count() + 8),
            ] {
                if chars > 0 {
                    h += self.body_block(chars, body, self.text_width_pt) + self.parskip();
                }
            }
        }

        if !bullets.is_empty() {
            // itemize topsep, charged at both ends.
            h += 4.0;
            let width = (self.text_width_pt - cfg.bullet_indent_pt as f64).max(PT_PER_IN);
            for b in bullets {
                h += self.body_block(b.chars().count() + 2, cfg.bullet_font_pt as f64, width)
                    + cfg.item_sep_pt as f64;
            }
        }

        h + cfg.experience_gap_pt as f64 * 0.5 // \expvspace
    }
}

/// One entry in the running for inclusion, flattened out of the section groups.
struct Candidate {
    group: usize,
    entry: usize,
    experience_id: i64,
    /// Ids of this entry's matched bullets, best-first by retrieval score.
    ranked: Vec<i64>,
    relevance: f64,
    /// 2 = the user switched it on, 1 = education (on by default — a resume
    /// that drops the user's degree because the posting never mentions it
    /// reads as broken, not as tailored), 0 = ranked on relevance alone.
    priority: u8,
    /// Switched off by the user: still ranked, so the list doesn't reshuffle
    /// when it's toggled, but never admitted.
    excluded: bool,
}

/// Keep the experiences and bullets that best answer the posting and still fit
/// `layout.target_pages`.
///
/// `scores` maps bullet id → fused retrieval score; bullets absent from it
/// didn't match the posting at all. Entries are admitted best-first, trimmed
/// bullet-by-bullet until they fit, and dropped once the budget can't hold even
/// their header. Whatever survives is returned in the caller's original section
/// and date order — tailoring decides *what* appears, not *where*.
///
/// `spec`'s excluded/pinned lists let the user override the ranking per
/// experience; both are reflected back in the report so the UI can render the
/// resulting state without re-deriving it.
pub fn select_within_budget(
    bio: &Bio,
    skills: &[(String, Vec<String>)],
    groups: Vec<SectionGroup>,
    scores: &HashMap<i64, f64>,
    layout: &LayoutConfig,
    spec: &TailorSpec,
) -> (Vec<SectionGroup>, TailorReport) {
    let m = Metrics::new(layout);
    let budget = m.budget();
    let mut spent = m.header_cost(bio) + m.skills_cost(skills);

    let excluded_ids: HashSet<i64> = spec.excluded_experience_ids.iter().copied().collect();
    let pinned_ids: HashSet<i64> = spec.pinned_experience_ids.iter().copied().collect();
    let max_bullets = spec.max_bullets();

    // ── Rank every entry the posting touched (plus anything switched on) ──
    let mut matched_bullets = 0usize;
    let mut candidates: Vec<Candidate> = Vec::new();
    for (gi, group) in groups.iter().enumerate() {
        for (ei, entry) in group.entries.iter().enumerate() {
            let mut ranked: Vec<(i64, f64)> = entry
                .bullet_ids
                .iter()
                .filter_map(|id| scores.get(id).map(|s| (*id, *s)))
                .collect();
            matched_bullets += ranked.len();

            let priority = if pinned_ids.contains(&entry.experience_id) {
                2
            } else if entry.education.is_some() {
                1
            } else {
                0
            };
            if ranked.is_empty() && priority == 0 {
                continue;
            }
            ranked.sort_by(|a, b| {
                b.1.partial_cmp(&a.1)
                    .unwrap_or(std::cmp::Ordering::Equal)
                    .then(a.0.cmp(&b.0))
            });
            candidates.push(Candidate {
                group: gi,
                entry: ei,
                experience_id: entry.experience_id,
                relevance: ranked.first().map_or(0.0, |(_, s)| *s),
                ranked: ranked.into_iter().map(|(id, _)| id).collect(),
                priority,
                excluded: excluded_ids.contains(&entry.experience_id),
            });
        }
    }

    // Switched-on first, then education, then most relevant; ties fall back to
    // document order so the same inputs always produce the same resume.
    candidates.sort_by(|a, b| {
        b.priority
            .cmp(&a.priority)
            .then_with(|| {
                b.relevance
                    .partial_cmp(&a.relevance)
                    .unwrap_or(std::cmp::Ordering::Equal)
            })
            .then((a.group, a.entry).cmp(&(b.group, b.entry)))
    });

    // ── Admit best-first until the page budget runs out ──
    let mut charged_headings: HashSet<usize> = HashSet::new();
    let mut kept: HashMap<(usize, usize), HashSet<i64>> = HashMap::new();
    let mut dropped: HashSet<(usize, usize)> = HashSet::new();
    let mut kept_bullets = 0usize;
    let mut budget_exhausted = false;

    for cand in &candidates {
        if cand.excluded {
            continue;
        }
        let entry = &groups[cand.group].entries[cand.entry];
        let heading = if charged_headings.contains(&cand.group) {
            0.0
        } else {
            m.heading_cost()
        };
        // Education and user-picked entries stand on their own; everything else
        // earns its header only by carrying at least one bullet.
        let floor = if cand.priority > 0 { 0 } else { MIN_BULLETS };

        // Shed the weakest bullet until the entry fits, or until there's
        // nothing left worth keeping.
        let mut take = cand.ranked.len().min(max_bullets);
        let admitted = loop {
            let texts = bullet_texts(entry, &cand.ranked[..take]);
            let cost = heading + m.entry_cost(entry, &texts);
            if spent + cost <= budget {
                break Some((take, cost));
            }
            if take <= floor {
                break None;
            }
            take -= 1;
        };

        match admitted {
            Some((take, cost)) => {
                spent += cost;
                charged_headings.insert(cand.group);
                kept_bullets += take;
                kept.insert(
                    (cand.group, cand.entry),
                    cand.ranked[..take].iter().copied().collect(),
                );
            }
            None => {
                dropped.insert((cand.group, cand.entry));
                budget_exhausted = true;
            }
        }
    }

    // ── Report every experience in the running, in ranked order ──
    let experiences: Vec<TailoredExperience> = candidates
        .iter()
        .map(|cand| {
            let key = (cand.group, cand.entry);
            let entry = &groups[cand.group].entries[cand.entry];
            TailoredExperience {
                experience_id: cand.experience_id,
                title: entry.title.clone(),
                org: entry.org.clone(),
                heading: groups[cand.group].heading.clone(),
                matched_bullets: cand.ranked.len(),
                kept_bullets: kept.get(&key).map_or(0, |ids| ids.len()),
                kept: kept.contains_key(&key),
                dropped_for_space: dropped.contains(&key),
                excluded: cand.excluded,
                pinned: cand.priority == 2,
            }
        })
        .collect();
    let dropped_entries = dropped.len();

    // ── Rebuild in document order, keeping only what was admitted ──
    let mut out: Vec<SectionGroup> = Vec::new();
    for (gi, group) in groups.into_iter().enumerate() {
        let mut entries: Vec<ResumeEntry> = Vec::new();
        for (ei, mut entry) in group.entries.into_iter().enumerate() {
            let Some(ids) = kept.get(&(gi, ei)) else {
                continue;
            };
            let bullets = std::mem::take(&mut entry.bullets);
            let bullet_ids = std::mem::take(&mut entry.bullet_ids);
            for (content, id) in bullets.into_iter().zip(bullet_ids) {
                if ids.contains(&id) {
                    entry.bullets.push(content);
                    entry.bullet_ids.push(id);
                }
            }
            entries.push(entry);
        }
        if !entries.is_empty() {
            out.push(SectionGroup {
                heading: group.heading,
                entries,
            });
        }
    }

    let report = TailorReport {
        matched_bullets,
        kept_bullets,
        kept_entries: kept.len(),
        dropped_entries,
        target_pages: layout.target_pages.max(1),
        estimated_pages: spent / m.page_pt,
        budget_exhausted,
        experiences,
    };
    (out, report)
}

/// The contents of `ids` within `entry`, in the entry's own display order.
/// `bullets` and `bullet_ids` are parallel by construction (see
/// `latex::commands::assemble_resume_data`).
fn bullet_texts<'a>(entry: &'a ResumeEntry, ids: &[i64]) -> Vec<&'a str> {
    entry
        .bullets
        .iter()
        .zip(entry.bullet_ids.iter())
        .filter(|(_, id)| ids.contains(id))
        .map(|(content, _)| content.as_str())
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn layout(target_pages: usize) -> LayoutConfig {
        LayoutConfig {
            target_pages,
            ..LayoutConfig::default()
        }
    }

    fn bio() -> Bio {
        Bio {
            name: Some("Jane Doe".into()),
            email: Some("jane@example.com".into()),
            phone: None,
            location: None,
            linkedin: None,
            github: None,
            website: None,
        }
    }

    /// Retrieval defaults, with an explicit bullet cap.
    fn spec(max_bullets: usize) -> TailorSpec {
        TailorSpec {
            max_bullets_per_entry: Some(max_bullets),
            ..TailorSpec::default()
        }
    }

    /// An experience with `n` bullets whose ids start at `first_id`. The
    /// experience itself is keyed on `first_id` too, so tests can address it.
    fn entry(title: &str, first_id: i64, n: usize) -> ResumeEntry {
        ResumeEntry {
            experience_id: first_id,
            title: title.to_string(),
            org: Some("Acme".into()),
            start: Some("2024".into()),
            end: Some("2025".into()),
            bullets: (0..n)
                .map(|i| format!("Delivered measurable outcome number {} for the team", i))
                .collect(),
            bullet_ids: (0..n as i64).map(|i| first_id + i).collect(),
            education: None,
            link: None,
        }
    }

    fn group(heading: &str, entries: Vec<ResumeEntry>) -> SectionGroup {
        SectionGroup {
            heading: heading.to_string(),
            entries,
        }
    }

    /// Descending scores so bullet id `n` ranks ahead of `n + 1`.
    fn scores(ids: &[i64]) -> HashMap<i64, f64> {
        ids.iter()
            .enumerate()
            .map(|(i, id)| (*id, 1.0 / (i + 1) as f64))
            .collect()
    }

    #[test]
    fn test_unmatched_experiences_are_dropped() {
        let groups = vec![group(
            "Professional Experience",
            vec![entry("Matched", 1, 3), entry("Unmatched", 10, 3)],
        )];
        // Only the first entry's bullets came back from retrieval.
        let (out, report) = select_within_budget(
            &bio(),
            &[],
            groups,
            &scores(&[1, 2, 3]),
            &layout(2),
            &spec(DEFAULT_MAX_BULLETS),
        );

        assert_eq!(out.len(), 1);
        assert_eq!(out[0].entries.len(), 1, "unmatched experience is dropped");
        assert_eq!(out[0].entries[0].title, "Matched");
        assert_eq!(report.matched_bullets, 3);
        assert_eq!(report.kept_bullets, 3);
        assert_eq!(report.dropped_entries, 0);
        assert!(!report.budget_exhausted);
    }

    #[test]
    fn test_bullets_capped_per_entry_and_kept_in_display_order() {
        let groups = vec![group("Projects", vec![entry("Big", 1, 9)])];
        // Reverse the ranking: the last bullet is the strongest match.
        let ranked: Vec<i64> = (1..=9).rev().collect();
        let (out, report) = select_within_budget(
            &bio(),
            &[],
            groups,
            &scores(&ranked),
            &layout(3),
            &spec(3),
        );

        let kept = &out[0].entries[0];
        assert_eq!(kept.bullets.len(), 3, "capped at max_bullets");
        assert_eq!(
            kept.bullet_ids,
            vec![7, 8, 9],
            "top-3 scorers, restored to the entry's own order"
        );
        assert_eq!(report.kept_bullets, 3);
    }

    #[test]
    fn test_one_page_target_cuts_more_than_three() {
        let make = || {
            vec![group(
                "Professional Experience",
                (0..8)
                    .map(|i| entry(&format!("Role {}", i), i * 10 + 1, 6))
                    .collect(),
            )]
        };
        let all: Vec<i64> = (0..8).flat_map(|i| (0..6).map(move |b| i * 10 + 1 + b)).collect();

        let (one, r1) =
            select_within_budget(&bio(), &[], make(), &scores(&all), &layout(1), &spec(DEFAULT_MAX_BULLETS));
        let (three, r3) =
            select_within_budget(&bio(), &[], make(), &scores(&all), &layout(3), &spec(DEFAULT_MAX_BULLETS));

        let count = |gs: &[SectionGroup]| gs.iter().map(|g| g.entries.len()).sum::<usize>();
        assert!(
            count(&one) < count(&three),
            "1-page target must admit fewer experiences than 3 pages ({} vs {})",
            count(&one),
            count(&three)
        );
        assert!(r1.budget_exhausted, "8 dense experiences cannot fit one page");
        assert!(r1.estimated_pages <= 1.0 + f64::EPSILON, "stayed inside the budget");
        assert!(r3.estimated_pages <= 3.0 + f64::EPSILON);
        assert!(r1.dropped_entries > 0 && r1.dropped_entries > r3.dropped_entries);
    }

    #[test]
    fn test_most_relevant_experience_survives_the_cut() {
        // The strongest match sits last in document order; it must still be the
        // one that makes a tight one-page budget.
        let groups = vec![group(
            "Professional Experience",
            (0..6)
                .map(|i| entry(&format!("Role {}", i), i * 10 + 1, 6))
                .collect(),
        )];
        let winner = 51; // first bullet of "Role 5"
        let mut s: HashMap<i64, f64> = HashMap::new();
        s.insert(winner, 10.0);
        for i in 0..6 {
            for b in 0..6 {
                s.entry(i * 10 + 1 + b).or_insert(0.01);
            }
        }

        let (out, _) = select_within_budget(&bio(), &[], groups, &s, &layout(1), &spec(DEFAULT_MAX_BULLETS));
        let titles: Vec<&str> = out[0].entries.iter().map(|e| e.title.as_str()).collect();
        assert!(titles.contains(&"Role 5"), "top match kept, got {:?}", titles);
    }

    #[test]
    fn test_education_is_pinned_even_without_a_match() {
        let mut edu = entry("B.S. Computer Science", 100, 0);
        edu.education = Some(crate::db::models::EducationDetails {
            experience_id: 1,
            degree: Some("B.S. Computer Science".into()),
            gpa: Some("3.9".into()),
            coursework: None,
            honors: None,
        });
        let groups = vec![
            group("Education", vec![edu]),
            group("Professional Experience", vec![entry("Role", 1, 4)]),
        ];

        let (out, _) = select_within_budget(
            &bio(),
            &[],
            groups,
            &scores(&[1, 2, 3, 4]),
            &layout(1),
            &spec(DEFAULT_MAX_BULLETS),
        );
        assert_eq!(out[0].heading, "Education");
        assert_eq!(out[0].entries.len(), 1, "education survives with no matches");
    }

    #[test]
    fn test_skills_and_header_consume_budget() {
        let groups = || vec![group("Projects", vec![entry("Role", 1, 6)])];
        let many_skills: Vec<(String, Vec<String>)> = (0..14)
            .map(|i| {
                (
                    format!("Category {}", i),
                    (0..8).map(|j| format!("Skill {}-{}", i, j)).collect(),
                )
            })
            .collect();

        let (_, bare) = select_within_budget(
            &bio(),
            &[],
            groups(),
            &scores(&[1, 2, 3, 4, 5, 6]),
            &layout(1),
            &spec(DEFAULT_MAX_BULLETS),
        );
        let (_, crowded) = select_within_budget(
            &bio(),
            &many_skills,
            groups(),
            &scores(&[1, 2, 3, 4, 5, 6]),
            &layout(1),
            &spec(DEFAULT_MAX_BULLETS),
        );

        assert!(
            crowded.estimated_pages > bare.estimated_pages,
            "a long skills block has to count against the page budget"
        );
        assert!(crowded.kept_bullets <= bare.kept_bullets);
    }

    #[test]
    fn test_tighter_layout_fits_more() {
        let make = || {
            vec![group(
                "Professional Experience",
                (0..6)
                    .map(|i| entry(&format!("Role {}", i), i * 10 + 1, 6))
                    .collect(),
            )]
        };
        let all: Vec<i64> = (0..6).flat_map(|i| (0..6).map(move |b| i * 10 + 1 + b)).collect();

        let roomy = LayoutConfig {
            body_font_pt: 12.0,
            bullet_font_pt: 12.0,
            margin_h_in: 1.25,
            margin_v_in: 1.25,
            ..layout(1)
        };
        let tight = LayoutConfig {
            body_font_pt: 9.0,
            bullet_font_pt: 9.0,
            margin_h_in: 0.5,
            margin_v_in: 0.5,
            ..layout(1)
        };

        let (_, r_roomy) =
            select_within_budget(&bio(), &[], make(), &scores(&all), &roomy, &spec(DEFAULT_MAX_BULLETS));
        let (_, r_tight) =
            select_within_budget(&bio(), &[], make(), &scores(&all), &tight, &spec(DEFAULT_MAX_BULLETS));

        assert!(
            r_tight.kept_bullets > r_roomy.kept_bullets,
            "smaller type and margins must fit more content on one page ({} vs {})",
            r_tight.kept_bullets,
            r_roomy.kept_bullets
        );
    }

    #[test]
    fn test_excluded_experience_is_dropped_but_still_reported() {
        let groups = || {
            vec![group(
                "Professional Experience",
                vec![entry("Kept", 1, 3), entry("Switched off", 10, 3)],
            )]
        };
        let all = scores(&[1, 2, 3, 10, 11, 12]);

        let (out, report) = select_within_budget(
            &bio(),
            &[],
            groups(),
            &all,
            &layout(2),
            &TailorSpec { excluded_experience_ids: vec![10], ..spec(DEFAULT_MAX_BULLETS) },
        );

        let titles: Vec<&str> = out[0].entries.iter().map(|e| e.title.as_str()).collect();
        assert_eq!(titles, vec!["Kept"]);

        // Still listed, so the UI can offer it back.
        let off = report
            .experiences
            .iter()
            .find(|e| e.experience_id == 10)
            .expect("an excluded experience stays in the report");
        assert!(off.excluded && !off.kept);
        assert_eq!(off.matched_bullets, 3, "it did match — the user opted out");
        assert!(!off.dropped_for_space, "excluded is not a space problem");
        assert_eq!(report.kept_entries, 1);
    }

    #[test]
    fn test_switching_one_on_pushes_a_weaker_match_out() {
        // Eight dense experiences against a one-page target: relevance alone
        // leaves some of them out.
        let groups = || {
            vec![group(
                "Professional Experience",
                (0..8)
                    .map(|i| entry(&format!("Role {}", i), i * 10 + 1, 6))
                    .collect(),
            )]
        };
        let all: Vec<i64> = (0..8).flat_map(|i| (0..6).map(move |b| i * 10 + 1 + b)).collect();

        let (_, before) = select_within_budget(
            &bio(), &[], groups(), &scores(&all), &layout(1), &spec(DEFAULT_MAX_BULLETS),
        );
        let underdog = before
            .experiences
            .iter()
            .find(|e| e.dropped_for_space)
            .expect("a one-page target must cut something here")
            .experience_id;

        let (after, report) = select_within_budget(
            &bio(),
            &[],
            groups(),
            &scores(&all),
            &layout(1),
            &TailorSpec { pinned_experience_ids: vec![underdog], ..spec(DEFAULT_MAX_BULLETS) },
        );

        let pinned = report
            .experiences
            .iter()
            .find(|e| e.experience_id == underdog)
            .unwrap();
        assert!(pinned.pinned, "reported as user-picked");
        assert!(pinned.kept, "switching it on forces it in past the ranking");
        assert!(
            after.iter().flat_map(|g| &g.entries).any(|e| e.experience_id == underdog),
            "and it really is in the rendered resume"
        );
        assert!(report.experiences.first().unwrap().pinned, "ranked first");
        // Something else had to give: the page target still holds.
        assert!(report.dropped_entries > 0);
        assert!(report.estimated_pages <= 1.0 + f64::EPSILON);
    }

    #[test]
    fn test_empty_scores_yield_an_empty_resume() {
        let groups = vec![group("Projects", vec![entry("Role", 1, 3)])];
        let (out, report) = select_within_budget(
            &bio(),
            &[],
            groups,
            &HashMap::new(),
            &layout(1),
            &spec(DEFAULT_MAX_BULLETS),
        );
        assert!(out.is_empty());
        assert_eq!(report.matched_bullets, 0);
        assert_eq!(report.kept_entries, 0);
        assert!(!report.budget_exhausted, "nothing matched — not a space problem");
    }
}
