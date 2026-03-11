use std::env;
use std::fs;
use std::process::Command;

fn main() {
    let plain_text = r#"
        \documentclass{article}
        \begin{document}
        This is a plain text document test without any complex styling or macros.
        Just ensuring that tectonic.exe can successfully take a minimal string and output a valid PDF.
        \end{document}
    "#;

    let app_data_dir = env::current_dir().unwrap().join("test_app_data");
    let bin_dir = app_data_dir.join("bin");
    fs::create_dir_all(&bin_dir).unwrap();
    let binary_path = bin_dir.join("tectonic.exe");

    if !binary_path.exists() {
        println!("tectonic.exe not found at {:?}. Downloading...", binary_path);
        
        let rt = tokio::runtime::Runtime::new().unwrap();
        rt.block_on(async {
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
        });
        println!("Download complete.");
    } else {
        println!("Checking for tectonic binary at: {:?}", binary_path);
    }

    let temp_dir = env::temp_dir().join("resume-builder-test");
    fs::create_dir_all(&temp_dir).unwrap();
    let tex_file_path = temp_dir.join("test.tex");
    
    fs::write(&tex_file_path, plain_text).unwrap();

    println!("Compiling plain text LaTeX test document via CLI...");
    let output = Command::new(&binary_path)
        .arg(&tex_file_path)
        .arg("--outdir")
        .arg(&temp_dir)
        .output()
        .unwrap();

    if output.status.success() {
        let pdf_path = temp_dir.join("test.pdf");
        let pdf_data = fs::read(&pdf_path).unwrap();
        println!("Compilation successful. Resulting PDF is {} bytes.", pdf_data.len());
        
        let out_path = "target/plaintext_test_cli_output.pdf";
        fs::write(out_path, pdf_data).unwrap();
        println!("Wrote output PDF to {}", out_path);
        println!("Manual verification step completed successfully.");
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        eprintln!("Compilation failed: {}", stderr);
        std::process::exit(1);
    }
}
