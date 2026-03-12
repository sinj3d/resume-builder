pub const CLASSIC_MAROON_TEMPLATE: &str = r#"
\documentclass[11pt]{article}

\usepackage[margin=1in]{geometry}
\usepackage{titlesec}
\usepackage{enumitem}
\usepackage{xcolor}

\definecolor{accent}{RGB}{128, 0, 0}

% Section formatting
\titleformat{\section}
  {\normalfont\Large\bfseries\color{accent}}
  {}[]

\begin{document}

% {INJECT_BIO_HEADER}

\section*{Professional Experience}

\begin{itemize}[leftmargin=*, noitemsep]
% {INJECT_BULLETS_HERE}
\end{itemize}

\end{document}
"#;

pub const MODERN_BLUE_TEMPLATE: &str = r#"
\documentclass[11pt]{article}

\usepackage[margin=1in]{geometry}
\usepackage{titlesec}
\usepackage{enumitem}
\usepackage{xcolor}

\definecolor{accent}{RGB}{0, 80, 160}

% Section formatting
\titleformat{\section}
  {\normalfont\Large\sffamily\color{accent}}
  {}[]

\begin{document}

% {INJECT_BIO_HEADER}

\section*{Professional Experience}

\begin{itemize}[leftmargin=*, noitemsep]
% {INJECT_BULLETS_HERE}
\end{itemize}

\end{document}
"#;

pub const MINIMALIST_BLACK_TEMPLATE: &str = r#"
\documentclass[10pt]{article}

\usepackage[margin=1in]{geometry}
\usepackage{titlesec}
\usepackage{enumitem}
\usepackage{xcolor}

\definecolor{accent}{RGB}{0, 0, 0}

% Section formatting
\titleformat{\section}
  {\normalfont\large\bfseries\color{accent}}
  {}[]

\begin{document}

% {INJECT_BIO_HEADER}

\section*{Professional Experience}

\begin{itemize}[leftmargin=*, itemsep=2pt]
% {INJECT_BULLETS_HERE}
\end{itemize}

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

pub fn inject_bullets(template: &str, bullets: &[String]) -> String {
    let mut itemized = String::new();
    for bullet in bullets {
        itemized.push_str(&format!("\\item {}\n", bullet));
    }

    template.replace("% {INJECT_BULLETS_HERE}", &itemized)
}

pub fn inject_bio_header(template: &str, name: &str, details: &[String]) -> String {
    let mut header = String::from("\\begin{center}\n");
    if !name.is_empty() {
        header.push_str(&format!("    {{\\huge \\textbf{{{}}}}} \\\\\n    \\vspace{{2pt}}\n", name));
    }
    
    // Join the details with a dot
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
    fn test_inject_bullets() {
        let template = "Start\n% {INJECT_BULLETS_HERE}\nEnd";
        let bullets = vec!["Implemented feature A.".to_string(), "Fixed bug B.".to_string()];
        
        let result = inject_bullets(template, &bullets);
        let expected = "Start\n\\item Implemented feature A.\n\\item Fixed bug B.\n\nEnd";
        
        assert_eq!(result, expected);
    }

    #[test]
    fn test_get_template() {
        assert!(get_template(0).unwrap().contains("128, 0, 0"));
        assert!(get_template(1).unwrap().contains("0, 80, 160"));
    }
}
