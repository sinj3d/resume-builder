pub mod commands;
pub mod download;
pub mod template;

use std::env;
use std::fs;
use std::path::Path;
use std::process::Command;

/// Compiles a LaTeX string into a PDF byte array via the downloaded tectonic binary.
pub fn compile_latex(tex_source: &str, binary_path: &Path) -> std::result::Result<Vec<u8>, String> {
    // We write to the OS temporary directory so we don't pollute the binary's workspace.
    let unique_id = uuid::Uuid::new_v4().to_string();
    let temp_dir = env::temp_dir().join(format!("resume-builder-compile-{}", unique_id));
    
    if !temp_dir.exists() {
        fs::create_dir_all(&temp_dir).map_err(|e| format!("Failed to create temp dir: {}", e))?;
    }

    let tex_file_path = temp_dir.join("resume.tex");
    fs::write(&tex_file_path, tex_source)
        .map_err(|e| format!("Failed to write temp .tex file: {}", e))?;

    // Invoke binary: tectonic.exe resume.tex --outdir <temp_dir>
    let output = Command::new(binary_path)
        .arg(&tex_file_path)
        .arg("--outdir")
        .arg(&temp_dir)
        .output()
        .map_err(|e| format!("Failed to execute tectonic binary at {:?}: {}", binary_path, e))?;

    if !output.status.success() {
        let stdout_str = String::from_utf8_lossy(&output.stdout);
        let stderr_str = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Tectonic reported a LaTeX error during compilation.\nStdout:\n{}\nStderr:\n{}", stdout_str, stderr_str));
    }

    // The output should be resume.pdf
    let pdf_path = temp_dir.join("resume.pdf");
    let pdf_bytes = fs::read(&pdf_path)
        .map_err(|e| format!("Failed to read generated PDF: {}", e))?;

    Ok(pdf_bytes)
}

#[cfg(test)]
mod tests;
