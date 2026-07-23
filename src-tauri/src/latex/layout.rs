//! Parameterized LaTeX layout generation.
//!
//! Every visual knob of the resume (font sizes, margins, spacing, accent color)
//! lives in [`LayoutConfig`]. The preamble derived from it is emitted between
//! two marker comments so the frontend can splice a new block into an existing
//! source without touching the user's manual body edits — see
//! [`patch_layout_block`]. `src/lib/latexLayout.ts` mirrors
//! [`generate_layout_block`] byte-for-byte; keep the two in sync.

use serde::{Deserialize, Serialize};

pub const LAYOUT_BEGIN: &str =
    "% === LAYOUT:BEGIN (auto-generated - edits inside are overwritten by layout controls) ===";
pub const LAYOUT_END: &str = "% === LAYOUT:END ===";

/// All user-adjustable visual parameters of the resume document.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct LayoutConfig {
    pub body_font_pt: f32,
    pub bullet_font_pt: f32,
    pub section_font_pt: f32,
    pub subsection_font_pt: f32,
    pub name_font_pt: f32,
    pub margin_h_in: f32,
    pub margin_v_in: f32,
    pub bullet_indent_pt: f32,
    pub item_sep_pt: f32,
    pub experience_gap_pt: f32,
    pub section_gap_pt: f32,
    pub line_spacing: f32,
    pub accent_rgb: [u8; 3],
    pub heading_sans: bool,
    pub section_rule: bool,
    pub header_rule: bool,
    pub target_pages: usize,
}

impl Default for LayoutConfig {
    /// Classic Maroon at a 1-page density.
    fn default() -> Self {
        LayoutConfig {
            body_font_pt: 11.0,
            bullet_font_pt: 11.0,
            section_font_pt: 14.0,
            subsection_font_pt: 12.0,
            name_font_pt: 24.0,
            margin_h_in: 1.0,
            margin_v_in: 1.0,
            bullet_indent_pt: 18.0,
            item_sep_pt: 0.0,
            experience_gap_pt: 3.0,
            section_gap_pt: 4.0,
            line_spacing: 1.0,
            accent_rgb: [128, 0, 0],
            heading_sans: false,
            section_rule: false,
            header_rule: false,
            target_pages: 1,
        }
    }
}

/// A named section of the resume mapping to one or more experience categories.
/// One `SectionDef` with several categories renders them merged under a single
/// heading; document order follows the `Vec<SectionDef>` order.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SectionDef {
    pub id: String,
    pub heading: String,
    pub categories: Vec<String>,
}

/// A named layout preset shown in the template dropdown.
#[derive(Debug, Clone, Serialize)]
pub struct LayoutPreset {
    pub name: String,
    pub config: LayoutConfig,
}

/// The built-in presets (the former hardcoded templates).
pub fn get_presets() -> Vec<LayoutPreset> {
    let classic = LayoutConfig::default();

    let modern = LayoutConfig {
        accent_rgb: [0, 80, 160],
        heading_sans: true,
        ..LayoutConfig::default()
    };

    let minimal = LayoutConfig {
        body_font_pt: 10.0,
        bullet_font_pt: 10.0,
        section_font_pt: 12.0,
        subsection_font_pt: 10.0,
        name_font_pt: 20.0,
        accent_rgb: [0, 0, 0],
        ..LayoutConfig::default()
    };

    let executive = LayoutConfig {
        section_font_pt: 15.0,
        name_font_pt: 26.0,
        margin_h_in: 0.9,
        margin_v_in: 0.8,
        accent_rgb: [15, 45, 90],
        section_rule: true,
        header_rule: true,
        ..LayoutConfig::default()
    };

    let compact = LayoutConfig {
        body_font_pt: 10.0,
        bullet_font_pt: 9.5,
        section_font_pt: 12.5,
        subsection_font_pt: 10.5,
        name_font_pt: 20.0,
        margin_h_in: 0.6,
        margin_v_in: 0.5,
        section_gap_pt: 3.0,
        experience_gap_pt: 2.5,
        accent_rgb: [0, 110, 110],
        heading_sans: true,
        section_rule: true,
        ..LayoutConfig::default()
    };

    let amber = LayoutConfig {
        name_font_pt: 22.0,
        line_spacing: 1.05,
        accent_rgb: [150, 90, 20],
        header_rule: true,
        ..LayoutConfig::default()
    };

    vec![
        LayoutPreset { name: "Classic Maroon".to_string(), config: classic },
        LayoutPreset { name: "Modern Blue".to_string(), config: modern },
        LayoutPreset { name: "Minimalist Black".to_string(), config: minimal },
        LayoutPreset { name: "Executive Navy".to_string(), config: executive },
        LayoutPreset { name: "Compact Teal".to_string(), config: compact },
        LayoutPreset { name: "Amber Slate".to_string(), config: amber },
    ]
}

/// Recommended spacing values for a page-count target. Selecting a page count
/// in the UI seeds `section_gap_pt`, `experience_gap_pt`, and `item_sep_pt`
/// with these; the sliders fine-tune from there.
/// Canonical reference for the TS mirror (`src/lib/latexLayout.ts`), which is
/// the runtime consumer; kept here under test to catch drift.
#[allow(dead_code)]
pub fn spacing_seed(target_pages: usize) -> (f32, f32, f32) {
    match target_pages {
        1 => (4.0, 3.0, 0.0),
        2 => (10.0, 8.0, 1.0),
        _ => (16.0, 12.0, 2.0),
    }
}

/// Format a point value exactly like the TS mirror. The explicit round-then-
/// divide keeps exact ties (e.g. 4.5 * 0.5 = 2.25) deterministic across Rust
/// (`{:.1}` rounds ties to even) and JS (`toFixed` rounds ties up): all values
/// are non-negative, so `f64::round` (half away from zero) and `Math.round`
/// (half up) agree.
fn pt(x: f64) -> String {
    format!("{:.1}", (x * 10.0).round() / 10.0)
}

/// Format an inch value exactly like the TS mirror (see [`pt`]).
fn inches(x: f64) -> String {
    format!("{:.2}", (x * 100.0).round() / 100.0)
}

/// Generate the marker-delimited layout block (markers included).
pub fn generate_layout_block(cfg: &LayoutConfig) -> String {
    let body = cfg.body_font_pt as f64;
    let bullet = cfg.bullet_font_pt as f64;
    let section = cfg.section_font_pt as f64;
    let subsection = cfg.subsection_font_pt as f64;
    let name = cfg.name_font_pt as f64;
    let line = cfg.line_spacing as f64;
    let section_gap = cfg.section_gap_pt as f64;
    let exp_gap = cfg.experience_gap_pt as f64;
    let item_sep = cfg.item_sep_pt as f64;

    let sans = if cfg.heading_sans { "\\sffamily" } else { "" };
    let rule = if cfg.section_rule {
        "[\\color{accent}\\titlerule]"
    } else {
        ""
    };
    let header_divider = if cfg.header_rule {
        r"\vspace{4pt}\noindent{\color{accent}\rule{\textwidth}{0.6pt}}"
    } else {
        ""
    };

    format!(
        r"{begin}
\usepackage[hmargin={hmargin}in,vmargin={vmargin}in]{{geometry}}
\usepackage{{titlesec}}
\usepackage{{enumitem}}
\usepackage{{xcolor}}
\usepackage[hidelinks]{{hyperref}}
\pagestyle{{empty}}

\definecolor{{accent}}{{RGB}}{{{r}, {g}, {b}}}

\makeatletter
\renewcommand\normalsize{{\@setfontsize\normalsize{{{body}pt}}{{{body_baseline}pt}}}}
\makeatother

\setlength{{\parindent}}{{0pt}}
\setlength{{\parskip}}{{{parskip}pt}}

\titleformat{{\section}}
  {{\normalfont\fontsize{{{section}pt}}{{{section_baseline}pt}}\selectfont{sans}\bfseries\color{{accent}}}}
  {{}}{{0pt}}{{}}{rule}
\titleformat{{\subsection}}
  {{\normalfont\fontsize{{{subsection}pt}}{{{subsection_baseline}pt}}\selectfont{sans}\bfseries}}
  {{}}{{0pt}}{{}}

\titlespacing*{{\section}}{{0pt}}{{{section_before}pt}}{{{section_after}pt}}
\titlespacing*{{\subsection}}{{0pt}}{{{subsection_before}pt}}{{1.0pt}}

\newcommand{{\bulletsize}}{{\fontsize{{{bullet}pt}}{{{bullet_baseline}pt}}\selectfont}}
\setlist[itemize]{{leftmargin={indent}pt, itemsep={item_sep}pt, topsep=2.0pt, parsep=0.0pt, partopsep=0.0pt, before=\bulletsize}}

\newcommand{{\namesize}}{{\fontsize{{{name}pt}}{{{name_baseline}pt}}\selectfont}}
\newcommand{{\headerdivider}}{{{header_divider}}}
\newcommand{{\expvspace}}{{\vspace{{{exp_vspace}pt}}}}
{end}",
        begin = LAYOUT_BEGIN,
        end = LAYOUT_END,
        hmargin = inches(cfg.margin_h_in as f64),
        vmargin = inches(cfg.margin_v_in as f64),
        r = cfg.accent_rgb[0],
        g = cfg.accent_rgb[1],
        b = cfg.accent_rgb[2],
        body = pt(body),
        body_baseline = pt(body * 1.2 * line),
        parskip = pt(item_sep.max(1.0)),
        section = pt(section),
        section_baseline = pt(section * 1.2),
        subsection = pt(subsection),
        subsection_baseline = pt(subsection * 1.2),
        sans = sans,
        rule = rule,
        section_before = pt(section_gap),
        section_after = pt(section_gap * 0.6),
        subsection_before = pt(exp_gap),
        bullet = pt(bullet),
        bullet_baseline = pt(bullet * 1.2 * line),
        indent = pt(cfg.bullet_indent_pt as f64),
        item_sep = pt(item_sep),
        name = pt(name),
        name_baseline = pt(name * 1.2),
        header_divider = header_divider,
        exp_vspace = pt(exp_gap * 0.5),
    )
}

/// Generate a complete document skeleton: layout block plus the standard
/// injection placeholders.
pub fn generate_document(cfg: &LayoutConfig) -> String {
    format!(
        "\\documentclass[10pt]{{article}}\n{}\n\n\\begin{{document}}\n\n% {{INJECT_BIO_HEADER}}\n\n% {{INJECT_SKILLS_HERE}}\n\n% {{INJECT_SECTIONS}}\n\n\\end{{document}}\n",
        generate_layout_block(cfg)
    )
}

/// Replace the marker-delimited layout block in `source` with one generated
/// from `cfg`. Everything outside the markers (including manual edits) is
/// preserved untouched.
/// Canonical reference for the TS mirror (`src/lib/latexLayout.ts`), which is
/// the runtime consumer; kept here under test to catch drift.
#[allow(dead_code)]
pub fn patch_layout_block(source: &str, cfg: &LayoutConfig) -> Result<String, String> {
    let begin = source.find(LAYOUT_BEGIN).ok_or_else(|| {
        "Layout markers not found in the document. Re-inject to restore layout controls."
            .to_string()
    })?;
    let end = source.find(LAYOUT_END).ok_or_else(|| {
        "Layout end marker not found in the document. Re-inject to restore layout controls."
            .to_string()
    })?;
    if end < begin {
        return Err("Layout markers are out of order. Re-inject to restore layout controls.".to_string());
    }

    let after_end = end + LAYOUT_END.len();
    Ok(format!(
        "{}{}{}",
        &source[..begin],
        generate_layout_block(cfg),
        &source[after_end..]
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_generate_document_contains_placeholders_and_markers() {
        let doc = generate_document(&LayoutConfig::default());
        assert!(doc.contains(LAYOUT_BEGIN));
        assert!(doc.contains(LAYOUT_END));
        assert!(doc.contains("% {INJECT_BIO_HEADER}"));
        assert!(doc.contains("% {INJECT_SKILLS_HERE}"));
        assert!(doc.contains("% {INJECT_SECTIONS}"));
        assert!(doc.contains("\\documentclass[10pt]{article}"));
    }

    /// Slider values chosen to hit rounding edge cases (exact .25/.75 ties in
    /// the derived spacing math) plus both boolean flags.
    fn stress_config() -> LayoutConfig {
        LayoutConfig {
            body_font_pt: 10.5,
            bullet_font_pt: 9.5,
            section_font_pt: 16.5,
            subsection_font_pt: 11.5,
            name_font_pt: 27.0,
            margin_h_in: 0.85,
            margin_v_in: 0.6,
            bullet_indent_pt: 22.0,
            item_sep_pt: 1.5,
            experience_gap_pt: 4.5,
            section_gap_pt: 13.5,
            line_spacing: 1.15,
            accent_rgb: [10, 200, 30],
            heading_sans: true,
            section_rule: true,
            header_rule: true,
            target_pages: 2,
        }
    }

    #[test]
    #[ignore] // one-off fixture generator: cargo test dump_fixture -- --ignored
    fn dump_fixture() {
        std::fs::write(
            concat!(env!("CARGO_MANIFEST_DIR"), "/src/latex/fixtures/default_layout_block.tex"),
            generate_layout_block(&LayoutConfig::default()),
        )
        .unwrap();
        std::fs::write(
            concat!(env!("CARGO_MANIFEST_DIR"), "/src/latex/fixtures/stress_layout_block.tex"),
            generate_layout_block(&stress_config()),
        )
        .unwrap();
    }

    #[test]
    fn test_default_layout_block_matches_fixture() {
        // The fixtures are the contract between this generator and its TS
        // mirror (src/lib/latexLayout.ts). If this test fails after an
        // intentional change, regenerate the fixtures (dump_fixture) AND
        // update the mirror.
        let block = generate_layout_block(&LayoutConfig::default());
        let fixture = include_str!("fixtures/default_layout_block.tex");
        assert_eq!(block, fixture.replace("\r\n", "\n").trim_end_matches('\n'));
    }

    #[test]
    fn test_stress_layout_block_matches_fixture() {
        let block = generate_layout_block(&stress_config());
        let fixture = include_str!("fixtures/stress_layout_block.tex");
        assert_eq!(block, fixture.replace("\r\n", "\n").trim_end_matches('\n'));
    }

    #[test]
    fn test_default_layout_block_values() {
        let block = generate_layout_block(&LayoutConfig::default());
        assert!(block.contains("hmargin=1.00in,vmargin=1.00in"));
        assert!(block.contains("\\usepackage[hidelinks]{hyperref}"));
        assert!(block.contains("\\definecolor{accent}{RGB}{128, 0, 0}"));
        assert!(block.contains("\\@setfontsize\\normalsize{11.0pt}{13.2pt}"));
        assert!(block.contains("\\fontsize{14.0pt}{16.8pt}\\selectfont\\bfseries\\color{accent}"));
        assert!(block.contains("\\titlespacing*{\\section}{0pt}{4.0pt}{2.4pt}"));
        assert!(block.contains("leftmargin=18.0pt, itemsep=0.0pt"));
        assert!(block.contains("\\newcommand{\\expvspace}{\\vspace{1.5pt}}"));
        // No sans, no rule in the default preset.
        assert!(!block.contains("\\sffamily"));
        assert!(!block.contains("\\titlerule"));
    }

    #[test]
    fn test_flags_emit_sans_and_rule() {
        let cfg = LayoutConfig {
            heading_sans: true,
            section_rule: true,
            ..LayoutConfig::default()
        };
        let block = generate_layout_block(&cfg);
        assert!(block.contains("\\sffamily"));
        assert!(block.contains("[\\color{accent}\\titlerule]"));
    }

    #[test]
    fn test_patch_layout_block_idempotent_and_preserves_body() {
        let cfg = LayoutConfig::default();
        let doc = generate_document(&cfg);
        // Simulate a manual body edit outside the markers.
        let doc = doc.replace("% {INJECT_SECTIONS}", "\\section*{Hand Written}");

        let new_cfg = LayoutConfig {
            margin_h_in: 0.5,
            ..LayoutConfig::default()
        };
        let patched = patch_layout_block(&doc, &new_cfg).unwrap();
        assert!(patched.contains("hmargin=0.50in"));
        assert!(patched.contains("\\section*{Hand Written}"), "manual edits must survive");

        let patched_twice = patch_layout_block(&patched, &new_cfg).unwrap();
        assert_eq!(patched, patched_twice, "patching must be idempotent");
    }

    #[test]
    fn test_patch_layout_block_missing_markers() {
        let result = patch_layout_block("\\documentclass{article}", &LayoutConfig::default());
        assert!(result.is_err());
    }

    #[test]
    fn test_presets() {
        let presets = get_presets();
        assert_eq!(presets.len(), 6);
        assert_eq!(presets[0].name, "Classic Maroon");
        assert_eq!(presets[1].config.accent_rgb, [0, 80, 160]);
        assert!(presets[1].config.heading_sans);
        assert_eq!(presets[2].config.body_font_pt, 10.0);
        assert!(presets[3].config.header_rule && presets[3].config.section_rule);
    }

    #[test]
    fn test_header_rule_emission() {
        let cfg = LayoutConfig { header_rule: true, ..LayoutConfig::default() };
        let block = generate_layout_block(&cfg);
        assert!(block.contains("\\newcommand{\\headerdivider}{\\vspace{4pt}\\noindent{\\color{accent}\\rule{\\textwidth}{0.6pt}}}"));

        let off = generate_layout_block(&LayoutConfig::default());
        assert!(off.contains("\\newcommand{\\headerdivider}{}"));
    }

    #[test]
    fn test_spacing_seed() {
        assert_eq!(spacing_seed(1), (4.0, 3.0, 0.0));
        assert_eq!(spacing_seed(2), (10.0, 8.0, 1.0));
        assert_eq!(spacing_seed(3), (16.0, 12.0, 2.0));
    }
}
