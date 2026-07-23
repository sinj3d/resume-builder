#[cfg(test)]
mod tests {
    use crate::latex::{compile_latex, layout, template};
    use std::fs;
    use tokio::runtime::Runtime;

    // Use a helper function because we need an AppHandle to call ensure_tectonic_binary
    // During tests we don't naturally have a full Tauri AppHandle, so we'll
    // mock the download logic if the binary isn't in test_app_data/bin.
    async fn get_test_binary_path() -> std::path::PathBuf {
        // Tests run in parallel; serialize the check-and-download so they
        // don't clobber the same tectonic.exe (os error 32 on Windows).
        static DOWNLOAD_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());
        let _guard = DOWNLOAD_LOCK.lock().unwrap();

        let app_data_dir = std::env::current_dir().unwrap().join("test_app_data");
        let bin_dir = app_data_dir.join("bin");
        let binary_path = bin_dir.join("tectonic.exe");

        if !binary_path.exists() {
            fs::create_dir_all(&bin_dir).unwrap();
            let res = reqwest::get("https://github.com/tectonic-typesetting/tectonic/releases/download/tectonic%400.15.0/tectonic-0.15.0-x86_64-pc-windows-msvc.zip").await.unwrap();
            let bytes = res.bytes().await.unwrap();

            let reader = std::io::Cursor::new(bytes);
            let mut archive = zip::ZipArchive::new(reader).unwrap();
            for i in 0..archive.len() {
                let mut file = archive.by_index(i).unwrap();
                if let Some(name) = file.enclosed_name() {
                    if name.file_name().and_then(|n| n.to_str()) == Some("tectonic.exe") {
                        let mut outfile = fs::File::create(&binary_path).unwrap();
                        std::io::copy(&mut file, &mut outfile).unwrap();
                        break;
                    }
                }
            }
        }
        binary_path
    }

    /// Build a fully injected document through the real pipeline, mirroring
    /// what `inject_template` does with DB data.
    fn build_test_doc() -> String {
        let doc = layout::generate_document(&layout::LayoutConfig::default());
        let injected = template::inject_bio_header(
            &doc,
            "Jane Doe",
            &["Springfield".to_string(), "jane@example.com".to_string()],
        );
        let injected = template::inject_skills_section(
            &injected,
            &[("Languages".to_string(), vec!["Rust".to_string(), "C#".to_string()])],
        );
        template::inject_sections_by_category(
            &injected,
            &[
                template::SectionGroup {
                    heading: "Professional Experience".to_string(),
                    entries: vec![template::ResumeEntry {
                        title: "Software Engineer".to_string(),
                        org: Some("Acme R&D".to_string()),
                        start: Some("Jan 2020".to_string()),
                        end: Some("Present".to_string()),
                        bullets: vec!["Cut costs by 50% using snake_case tools".to_string()],
                        education: None,
                    }],
                },
                template::SectionGroup {
                    heading: "Education".to_string(),
                    entries: vec![template::ResumeEntry {
                        title: "B.S. Computer Science".to_string(),
                        org: Some("State University".to_string()),
                        start: Some("2022".to_string()),
                        end: Some("2026".to_string()),
                        bullets: vec![],
                        education: Some(crate::db::models::EducationDetails {
                            experience_id: 1,
                            degree: Some("B.S. Computer Science".to_string()),
                            gpa: Some("3.87/4.0".to_string()),
                            coursework: Some("Algorithms, OS".to_string()),
                            honors: Some("Dean's List".to_string()),
                        }),
                    }],
                },
            ],
        )
    }

    #[test]
    fn test_compile_latex_success() {
        let rt = Runtime::new().unwrap();
        rt.block_on(async {
            let binary_path = get_test_binary_path().await;

            let tex = build_test_doc();

            let pdf_bytes = compile_latex(&tex, &binary_path).expect("Compilation must succeed");
            assert!(!pdf_bytes.is_empty(), "Resulting PDF bytes should not be empty");
            assert_eq!(&pdf_bytes[0..4], b"%PDF", "Output must contain the PDF magic number");
        });
    }

    #[test]
    fn test_compile_all_presets_and_flags() {
        let rt = Runtime::new().unwrap();
        rt.block_on(async {
            let binary_path = get_test_binary_path().await;

            let mut configs: Vec<layout::LayoutConfig> =
                layout::get_presets().into_iter().map(|p| p.config).collect();
            // Exercise the section rule + sans headings + stretched line
            // spacing branch of the generator too.
            configs.push(layout::LayoutConfig {
                section_rule: true,
                heading_sans: true,
                line_spacing: 1.15,
                experience_gap_pt: 4.5,
                ..layout::LayoutConfig::default()
            });

            for cfg in configs {
                let doc = layout::generate_document(&cfg);
                let doc = template::inject_bio_header(&doc, "Jane Doe", &[]);
                let doc = template::inject_skills_section(&doc, &[]);
                let doc = template::inject_sections_by_category(
                    &doc,
                    &[template::SectionGroup {
                        heading: "Projects".to_string(),
                        entries: vec![template::ResumeEntry {
                            title: "Thing".to_string(),
                            org: None,
                            start: None,
                            end: None,
                            bullets: vec!["Did the thing".to_string()],
                            education: None,
                        }],
                    }],
                );
                compile_latex(&doc, &binary_path)
                    .unwrap_or_else(|e| panic!("Preset must compile. Error: {}", e));
            }
        });
    }

    #[test]
    fn test_compile_latex_error() {
        let rt = Runtime::new().unwrap();
        rt.block_on(async {
            let binary_path = get_test_binary_path().await;

            let tex = "\\documentclass{garbageclass}\n\\begin{document}\nUnclosed group{ \n\\end{document}";

            let result = compile_latex(&tex, &binary_path);
            assert!(result.is_err(), "Compilation with invalid macro must fail");
        });
    }

    #[test]
    fn test_compile_rejects_uninjected_template() {
        // The default skeleton still carries its `% {INJECT_*}` placeholders, so
        // its body is empty. This must fail fast with an actionable message
        // *before* tectonic runs — hence the bogus binary path never being hit.
        let tex = layout::generate_document(&layout::LayoutConfig::default());
        let err = compile_latex(&tex, std::path::Path::new("nonexistent-tectonic"))
            .expect_err("an un-injected template must be rejected");
        assert!(err.contains("Inject to editor"), "unexpected error: {err}");
    }

    #[test]
    fn test_compile_rejects_empty_body() {
        // A body of only whitespace and comments would typeset zero pages.
        let tex = "\\documentclass{article}\n\\begin{document}\n   \n% just a comment\n\\end{document}";
        let err = compile_latex(tex, std::path::Path::new("nonexistent-tectonic"))
            .expect_err("an empty document body must be rejected");
        assert!(err.contains("nothing to compile"), "unexpected error: {err}");
    }

    #[test]
    fn test_template_injection_compilation() {
        let rt = Runtime::new().unwrap();
        rt.block_on(async {
            let binary_path = get_test_binary_path().await;

            let injected_source = build_test_doc();

            // Section heading and escaped user content must be present.
            assert!(injected_source.contains("\\section*{Professional Experience}"));
            assert!(injected_source.contains("Acme R\\&D"));
            assert!(injected_source.contains("50\\%"));
            assert!(injected_source.contains("snake\\_case"));
            // No placeholders may survive injection.
            assert!(!injected_source.contains("% {INJECT_"));

            let pdf_bytes = compile_latex(&injected_source, &binary_path)
                .expect("Template compilation must succeed");

            assert!(!pdf_bytes.is_empty());
        });
    }
}
