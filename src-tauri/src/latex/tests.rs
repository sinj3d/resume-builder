#[cfg(test)]
mod tests {
    use crate::latex::{compile_latex, template};
    use std::fs;
    use tokio::runtime::Runtime;

    // Use a helper function because we need an AppHandle to call ensure_tectonic_binary
    // During tests we don't naturally have a full Tauri AppHandle, so we'll 
    // mock the download logic if the binary isn't in test_app_data/bin.
    async fn get_test_binary_path() -> std::path::PathBuf {
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

    #[test]
    fn test_compile_latex_success() {
        let rt = Runtime::new().unwrap();
        rt.block_on(async {
            let binary_path = get_test_binary_path().await;
            
            let tex = template::inject_bullets(template::CLASSIC_MAROON_TEMPLATE, &["Dummy item".into()]);
            
            let pdf_bytes = compile_latex(&tex, &binary_path).expect("Compilation must succeed");
            assert!(!pdf_bytes.is_empty(), "Resulting PDF bytes should not be empty");
            assert_eq!(&pdf_bytes[0..4], b"%PDF", "Output must contain the PDF magic number");
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
    fn test_template_injection_compilation() {
        let rt = Runtime::new().unwrap();
        rt.block_on(async {
            let binary_path = get_test_binary_path().await;
            
            let tmpl = template::get_template(0).unwrap();
            let bullets = vec![
                "First bullet point test.".to_string(),
                "Second bullet point test.".to_string(),
            ];
            
            let injected_source = template::inject_bullets(tmpl, &bullets);
            assert!(injected_source.contains("\\item First bullet point test."));
            
            let pdf_bytes = compile_latex(&injected_source, &binary_path)
                .expect("Template compilation must succeed");
                
            assert!(!pdf_bytes.is_empty());
        });
    }
}
