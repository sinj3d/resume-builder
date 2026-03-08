use futures_util::StreamExt;
use reqwest::Client;
use std::fs;
use std::io::{self, Cursor};
use std::path::PathBuf;
use tauri::AppHandle;
use tauri::Manager;
use zip::ZipArchive;

const TECTONIC_RELEASE_URL_WINDOWS: &str = "https://github.com/tectonic-typesetting/tectonic/releases/download/tectonic%400.15.0/tectonic-0.15.0-x86_64-pc-windows-msvc.zip";

/// Ensures that the `tectonic.exe` binary is available in the app's local data directory.
/// If it does not exist, it downloads and extracts the binary.
pub async fn ensure_tectonic_binary(app_handle: &AppHandle) -> Result<PathBuf, String> {
    let app_data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to resolve app data dir: {}", e))?;

    let bin_dir = app_data_dir.join("bin");
    if !bin_dir.exists() {
        fs::create_dir_all(&bin_dir).map_err(|e| format!("Failed to create bin dir: {}", e))?;
    }

    let tectonic_path = bin_dir.join(if cfg!(windows) {
        "tectonic.exe"
    } else {
        "tectonic"
    });

    if tectonic_path.exists() {
        return Ok(tectonic_path);
    }

    // Only downloading windows binary locally.
    if !cfg!(windows) {
        return Err("Only Windows automatically downloading is currently supported in this prototype.".to_string());
    }

    // Download Phase
    let client = Client::new();
    let res = client
        .get(TECTONIC_RELEASE_URL_WINDOWS)
        .send()
        .await
        .map_err(|e| format!("Failed to fetch tectonic release: {}", e))?;

    if !res.status().is_success() {
        return Err(format!("Failed to download tectonic: HTTP {}", res.status()));
    }

    let mut zip_bytes = Vec::new();
    let mut stream = res.bytes_stream();

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("Error downloading chunk: {}", e))?;
        zip_bytes.extend_from_slice(&chunk);
    }

    // Extraction Phase
    let reader = Cursor::new(zip_bytes);
    let mut archive = ZipArchive::new(reader).map_err(|e| format!("Failed to read zip archive: {}", e))?;

    for i in 0..archive.len() {
        let mut file = archive.by_index(i).map_err(|e| format!("Failed to read file in zip: {}", e))?;
        let outpath = match file.enclosed_name() {
            Some(path) => path.to_owned(),
            None => continue,
        };

        if file.name().ends_with('/') {
            continue;
        }

        // We only care about tectonic.exe
        if outpath.file_name().and_then(|name| name.to_str()) == Some("tectonic.exe") {
            let mut outfile = fs::File::create(&tectonic_path)
                .map_err(|e| format!("Failed to create tectonic_path: {}", e))?;
            io::copy(&mut file, &mut outfile)
                .map_err(|e| format!("Failed to extract tectonic.exe: {}", e))?;
            break;
        }
    }

    if tectonic_path.exists() {
        Ok(tectonic_path)
    } else {
        Err("tectonic.exe not found inside the downloaded archive.".to_string())
    }
}
