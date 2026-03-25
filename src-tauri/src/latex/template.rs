pub const CLASSIC_MAROON_TEMPLATE: &str = r#"
\documentclass[11pt]{article}

\usepackage[margin=1in]{geometry}
\usepackage{titlesec}
\usepackage{enumitem}
\usepackage{xcolor}
\usepackage{parskip}
\pagestyle{empty}

\definecolor{accent}{RGB}{128, 0, 0}

% Section formatting
\titleformat{\section}
  {\normalfont\Large\bfseries\color{accent}}
  {}{0pt}{}
\titleformat{\subsection}
  {\normalfont\large\bfseries}
  {}{0pt}{}

% {INJECT_SPACING}

\begin{document}

% {INJECT_BIO_HEADER}

% {INJECT_SKILLS_HERE}

% {INJECT_SECTIONS}

\end{document}
"#;

pub const MODERN_BLUE_TEMPLATE: &str = r#"
\documentclass[11pt]{article}

\usepackage[margin=1in]{geometry}
\usepackage{titlesec}
\usepackage{enumitem}
\usepackage{xcolor}
\usepackage{parskip}
\pagestyle{empty}

\definecolor{accent}{RGB}{0, 80, 160}

% Section formatting
\titleformat{\section}
  {\normalfont\Large\sffamily\color{accent}}
  {}{0pt}{}
\titleformat{\subsection}
  {\normalfont\large\sffamily\bfseries}
  {}{0pt}{}

% {INJECT_SPACING}

\begin{document}

% {INJECT_BIO_HEADER}

% {INJECT_SKILLS_HERE}

% {INJECT_SECTIONS}

\end{document}
"#;

pub const MINIMALIST_BLACK_TEMPLATE: &str = r#"
\documentclass[10pt]{article}

\usepackage[margin=1in]{geometry}
\usepackage{titlesec}
\usepackage{enumitem}
\usepackage{xcolor}
\usepackage{parskip}
\pagestyle{empty}

\definecolor{accent}{RGB}{0, 0, 0}

% Section formatting
\titleformat{\section}
  {\normalfont\large\bfseries\color{accent}}
  {}{0pt}{}
\titleformat{\subsection}
  {\normalfont\normalsize\bfseries}
  {}{0pt}{}

% {INJECT_SPACING}

\begin{document}

% {INJECT_BIO_HEADER}

% {INJECT_SKILLS_HERE}

% {INJECT_SECTIONS}

\end{document}
"#;

pub fn get_template(idx: usize) -> Option<&'static str> {
    match idx {
        0 => Some(CLASSIC_MAROON_TEMPLATE),
        1 => Some(MODERN_BLUE_TEMPLATE),
        2 => Some(MINIMALIST_BLACK_TEMPLATE),
        _ => None,
    }
}

pub fn get_template_names() -> Vec<&'static str> {
    vec!["Classic Maroon", "Modern Blue", "Minimalist Black"]
}

/// Returns the base font size (in pt) for the given template index.
/// Classic Maroon and Modern Blue default to 11pt, Minimalist Black to 10pt.
pub fn get_base_font_pt(idx: usize) -> f32 {
    match idx {
        2 => 10.0,
        _ => 11.0,
    }
}

/// Map a raw DB category string to a canonical section heading.
pub fn normalize_category(raw: &str) -> String {
    match raw.trim().to_lowercase().as_str() {
        "work" | "professional experience" | "job" | "employment" => {
            "Professional Experience".to_string()
        }
        "education" | "school" | "academic" => "Education".to_string(),
        "project" | "projects" => "Projects".to_string(),
        "leadership" => "Leadership".to_string(),
        "volunteer" | "volunteering" | "volunteer experience" => "Volunteer Experience".to_string(),
        other => {
            // Title-case each word
            other
                .split_whitespace()
                .map(|w| {
                    let mut c = w.chars();
                    match c.next() {
                        None => String::new(),
                        Some(f) => f.to_uppercase().to_string() + c.as_str(),
                    }
                })
                .collect::<Vec<_>>()
                .join(" ")
        }
    }
}

/// Default section ordering used when the user hasn't customised it.
pub fn default_section_order() -> Vec<&'static str> {
    vec![
        "Education",
        "Professional Experience",
        "Projects",
        "Leadership",
        "Volunteer Experience",
    ]
}

/// Inject spacing commands into the template's `% {INJECT_SPACING}` placeholder.
///
/// Returns `Err` if the required font size would drop below 9pt.
pub fn inject_spacing(
    template: &str,
    target_pages: usize,
    base_font_pt: f32,
) -> Result<String, String> {
    // As pages increase we open up spacing; we never shrink the actual font via
    // this function (the font size is set in the documentclass line). However,
    // if the user requests 1 page for content that realistically won't fit even
    // with tight spacing, the compiler would have needed to shrink below 9pt.
    // We approximate: 1-page tight at base_font_pt is fine; if base_font_pt
    // is already at or below 9pt AND target_pages==1 we warn but still proceed.
    // A proper overflow detection would require measuring content, which is not
    // feasible pre-compile. Instead we guard: base_font_pt - 2 < 9 means the
    // template's base is too small for aggressive tightening.
    let effective_font = base_font_pt - if target_pages == 1 { 1.0 } else { 0.0 };
    if effective_font < 9.0 {
        return Err(format!(
            "Spacing for {} page(s) would require a font size smaller than 9pt (estimated {:.1}pt). \
             Please choose a larger page count or use a different template.",
            target_pages, effective_font
        ));
    }

    let spacing = match target_pages {
        1 => {
            r"\titlespacing*{\section}{0pt}{4pt}{2pt}
\titlespacing*{\subsection}{0pt}{3pt}{1pt}
\setlength{\parskip}{1pt}
\setlength{\itemsep}{0pt}
\newcommand{\expvspace}{\vspace{3pt}}"
        }
        2 => {
            r"\titlespacing*{\section}{0pt}{10pt}{6pt}
\titlespacing*{\subsection}{0pt}{6pt}{3pt}
\setlength{\parskip}{3pt}
\setlength{\itemsep}{1pt}
\newcommand{\expvspace}{\vspace{8pt}}"
        }
        _ => {
            // 3+
            r"\titlespacing*{\section}{0pt}{16pt}{10pt}
\titlespacing*{\subsection}{0pt}{10pt}{5pt}
\setlength{\parskip}{5pt}
\setlength{\itemsep}{2pt}
\newcommand{\expvspace}{\vspace{12pt}}"
        }
    };

    Ok(template.replace("% {INJECT_SPACING}", spacing))
}

/// Inject grouped experience sections into `% {INJECT_SECTIONS}`.
///
/// `groups` is a slice of `(section_heading, entries)` already sorted in the
/// desired display order.
pub fn inject_sections_by_category(
    template: &str,
    groups: &[(String, Vec<(String, Option<String>, Option<String>, Option<String>, Vec<String>)>)],
) -> String {
    let mut output = String::new();

    for (heading, entries) in groups {
        if entries.is_empty() {
            continue;
        }

        output.push_str(&format!("\\section*{{{}}}\n", heading));

        for (title, org, start, end, bullets) in entries {
            let header = match org {
                Some(o) if !o.is_empty() => format!("{} -- {}", title, o),
                _ => title.clone(),
            };

            let date_str = match (start, end) {
                (Some(s), Some(e)) if !s.is_empty() && !e.is_empty() => {
                    format!("{} -- {}", s, e)
                }
                (Some(s), _) if !s.is_empty() => s.clone(),
                (_, Some(e)) if !e.is_empty() => e.clone(),
                _ => String::new(),
            };

            if date_str.is_empty() {
                output.push_str(&format!("\\subsection*{{{}}}\n", header));
            } else {
                output.push_str(&format!(
                    "\\subsection*{{{} \\hfill {}}}\n",
                    header, date_str
                ));
            }

            if !bullets.is_empty() {
                output.push_str("\\begin{itemize}[leftmargin=*, nosep]\n");
                for bullet in bullets {
                    output.push_str(&format!("\\item {}\n", bullet));
                }
                output.push_str("\\end{itemize}\n");
            }

            output.push_str("\\expvspace\n");
        }
    }

    template.replace("% {INJECT_SECTIONS}", &output)
}

pub fn inject_skills_section(template: &str, categories: &[(String, Vec<String>)]) -> String {
    if categories.is_empty() {
        return template.replace("% {INJECT_SKILLS_HERE}", "");
    }

    let mut section = String::from("\\section*{Skills}\n");
    for (category, skills) in categories {
        let joined = skills.join(", ");
        section.push_str(&format!("\\textbf{{{}:}} {} \\par\n", category, joined));
    }
    section.push_str("\\expvspace\n");

    template.replace("% {INJECT_SKILLS_HERE}", &section)
}

pub fn inject_bio_header(template: &str, name: &str, details: &[String]) -> String {
    let mut header = String::from("\\begin{center}\n");
    if !name.is_empty() {
        header.push_str(&format!(
            "    {{\\huge \\textbf{{{}}}}} \\\\\n    \\vspace{{2pt}}\n",
            name
        ));
    }

    let joined = details.join(" $\\cdot$ ");
    if !joined.is_empty() {
        header.push_str(&format!("    {} \\\\\n", joined));
    }
    header.push_str("\\end{center}\n\\vspace{10pt}");

    template.replace("% {INJECT_BIO_HEADER}", &header)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_normalize_category() {
        assert_eq!(normalize_category("Work"), "Professional Experience");
        assert_eq!(normalize_category("work"), "Professional Experience");
        assert_eq!(normalize_category("project"), "Projects");
        assert_eq!(normalize_category("education"), "Education");
        assert_eq!(normalize_category("My Custom Tag"), "My Custom Tag");
    }

    #[test]
    fn test_get_template() {
        assert!(get_template(0).unwrap().contains("128, 0, 0"));
        assert!(get_template(1).unwrap().contains("0, 80, 160"));
    }

    #[test]
    fn test_inject_spacing_1_page() {
        let tmpl = get_template(0).unwrap();
        let result = inject_spacing(tmpl, 1, 11.0).unwrap();
        assert!(result.contains("titlespacing*"));
        assert!(result.contains("expvspace"));
    }

    #[test]
    fn test_inject_spacing_error_below_9pt() {
        // A 9pt base font requesting 1 page triggers the guard
        let tmpl = get_template(0).unwrap();
        let result = inject_spacing(tmpl, 1, 9.0);
        assert!(result.is_err(), "Should error when effective font < 9pt");
    }
}
