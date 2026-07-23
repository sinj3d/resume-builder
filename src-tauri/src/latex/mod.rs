pub mod commands;
pub mod download;
pub mod layout;
pub mod template;

use std::env;
use std::fs;
use std::path::Path;
use std::process::Command;

/// Compiles a LaTeX string into a PDF byte array via the downloaded tectonic binary.
pub fn compile_latex(tex_source: &str, binary_path: &Path) -> std::result::Result<Vec<u8>, String> {
    // A document whose body is only comments — most commonly a template whose
    // `% {INJECT_*}` placeholders were never filled in — typesets zero pages.
    // Tectonic can then produce no `.xdv`, and xdvipdfmx dies with an opaque
    // "cannot open resume.xdv". Catch it up front so every compile path (auto,
    // manual, PDF tab, download) surfaces a clear next step instead of a raw
    // engine dump.
    if let Some(msg) = empty_document_error(tex_source) {
        return Err(msg);
    }

    // Each compile gets its own directory under the OS temp dir so we don't
    // pollute the binary's workspace. Sweep any orphans a previous run left
    // behind first, then run, then remove our own — win or lose.
    let temp_root = env::temp_dir();
    purge_stale_compile_dirs(&temp_root);

    let unique_id = uuid::Uuid::new_v4().to_string();
    let temp_dir = temp_root.join(format!("resume-builder-compile-{}", unique_id));

    let result = compile_in_dir(tex_source, binary_path, &temp_dir);

    // Best-effort cleanup so compile dirs don't accumulate across runs.
    let _ = fs::remove_dir_all(&temp_dir);

    result
}

/// Runs tectonic on `tex_source` inside `temp_dir`, returning the PDF bytes.
/// The caller owns `temp_dir`'s lifecycle (creation is done here; cleanup is
/// the caller's responsibility so it happens on both success and failure).
fn compile_in_dir(
    tex_source: &str,
    binary_path: &Path,
    temp_dir: &Path,
) -> std::result::Result<Vec<u8>, String> {
    if !temp_dir.exists() {
        fs::create_dir_all(temp_dir).map_err(|e| format!("Failed to create temp dir: {}", e))?;
    }

    let tex_file_path = temp_dir.join("resume.tex");
    fs::write(&tex_file_path, tex_source)
        .map_err(|e| format!("Failed to write temp .tex file: {}", e))?;

    // Invoke binary: tectonic.exe resume.tex --outdir <temp_dir>
    let mut command = Command::new(binary_path);
    command.arg(&tex_file_path).arg("--outdir").arg(temp_dir);

    // Prevent a console window from flashing up on every compile.
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        command.creation_flags(CREATE_NO_WINDOW);
    }

    let output = command
        .output()
        .map_err(|e| format!("Failed to execute tectonic binary at {:?}: {}", binary_path, e))?;

    if !output.status.success() {
        let stdout_str = String::from_utf8_lossy(&output.stdout);
        let stderr_str = String::from_utf8_lossy(&output.stderr);
        return Err(format!(
            "Tectonic reported a LaTeX error during compilation ({}).\nStdout:\n{}\nStderr:\n{}",
            output.status, stdout_str, stderr_str
        ));
    }

    // The output should be resume.pdf
    let pdf_path = temp_dir.join("resume.pdf");
    let pdf_bytes = fs::read(&pdf_path)
        .map_err(|e| format!("Failed to read generated PDF: {}", e))?;

    Ok(pdf_bytes)
}

/// Best-effort removal of `resume-builder-compile-*` directories left behind by
/// earlier runs (e.g. a crash, or an older build before cleanup existed). Only
/// directories older than an hour are touched, so an in-flight compile — even a
/// concurrent one under test — is never disturbed.
fn purge_stale_compile_dirs(root: &Path) {
    const STALE_AFTER_SECS: u64 = 3600;

    let Ok(entries) = fs::read_dir(root) else {
        return;
    };
    let now = std::time::SystemTime::now();

    for entry in entries.flatten() {
        let path = entry.path();
        let is_ours = path
            .file_name()
            .and_then(|n| n.to_str())
            .is_some_and(|n| n.starts_with("resume-builder-compile-"));
        if !is_ours {
            continue;
        }

        let stale = entry
            .metadata()
            .and_then(|m| m.modified())
            .ok()
            .and_then(|modified| now.duration_since(modified).ok())
            .is_some_and(|age| age.as_secs() > STALE_AFTER_SECS);
        if stale {
            let _ = fs::remove_dir_all(&path);
        }
    }
}

/// Returns a user-facing error when `tex_source` has no typesettable content
/// between `\begin{document}` and `\end{document}` — so tectonic would emit an
/// empty document and fail at the xdvipdfmx stage with an opaque error.
///
/// Returns `None` when the body has real content, or when there's no
/// `\begin{document}` at all (then we let tectonic report whatever is actually
/// wrong rather than guessing).
fn empty_document_error(tex_source: &str) -> Option<String> {
    let after_begin = tex_source.split_once("\\begin{document}")?.1;
    let body = match after_begin.split_once("\\end{document}") {
        Some((body, _)) => body,
        None => after_begin,
    };

    let has_content = body
        .lines()
        .any(|line| !strip_tex_comment(line).trim().is_empty());
    if has_content {
        return None;
    }

    if tex_source.contains("% {INJECT_") {
        Some(
            "This template still contains its % {INJECT_...} placeholders, so there is \
             nothing to typeset. Click \"Inject to editor\" to fill in your resume content \
             before compiling."
                .to_string(),
        )
    } else {
        Some(
            "The document has no content between \\begin{document} and \\end{document}, so \
             there is nothing to compile. Add some content (or click \"Inject to editor\") first."
                .to_string(),
        )
    }
}

/// Strip a trailing LaTeX comment (an unescaped `%` through end of line) from
/// `line`. An escaped `\%` is literal content and is kept.
fn strip_tex_comment(line: &str) -> &str {
    let bytes = line.as_bytes();
    for (i, &b) in bytes.iter().enumerate() {
        if b == b'%' {
            // An even number of preceding backslashes leaves the `%` a real
            // comment start; an odd number means it's an escaped literal `\%`.
            let backslashes = bytes[..i].iter().rev().take_while(|&&c| c == b'\\').count();
            if backslashes % 2 == 0 {
                return &line[..i];
            }
        }
    }
    line
}

#[cfg(test)]
mod tests;
