use super::{compile_latex, download, template};
use crate::db::DbState;
use tauri::{AppHandle, State};

#[tauri::command]
pub async fn check_or_download_tectonic(app: AppHandle) -> Result<(), String> {
    download::ensure_tectonic_binary(&app).await.map(|_| ())
}

#[tauri::command]
pub fn get_templates() -> Result<Vec<String>, String> {
    Ok(template::get_template_names().iter().map(|&s| s.to_string()).collect())
}

#[tauri::command]
pub async fn compile_tex(source: String, app: AppHandle) -> Result<Vec<u8>, String> {
    let binary_path = download::ensure_tectonic_binary(&app).await?;
    compile_latex(&source, &binary_path)
}

#[tauri::command]
pub async fn inject_and_compile(
    bullet_ids: Vec<i64>,
    template_idx: usize,
    app: AppHandle,
    state: State<'_, DbState>,
) -> Result<Vec<u8>, String> {
    // We cannot hold the generic mutex across an await point easily, so we access db synchronously first.
    let bullets = {
        let conn = state.0.lock().map_err(|e| e.to_string())?;
        let mut blts = Vec::new();

        for id in bullet_ids {
            let mut stmt = conn
                .prepare("SELECT content FROM bullet_points WHERE id = ?1")
                .map_err(|e| format!("DB error: {}", e))?;
            
            let mut rows = stmt.query([id])
                .map_err(|e| format!("DB query error: {}", e))?;

            if let Some(row) = rows.next().map_err(|e| format!("Row error: {}", e))? {
                let content: String = row.get(0).map_err(|e| format!("Column error: {}", e))?;
                blts.push(content);
            } else {
                return Err(format!("Bullet ID {} not found", id));
            }
        }
        blts
    };

    let tmpl = template::get_template(template_idx)
        .ok_or_else(|| format!("Invalid template index: {}", template_idx))?;

    let injected = template::inject_bullets(tmpl, &bullets);
    
    let binary_path = download::ensure_tectonic_binary(&app).await?;
    compile_latex(&injected, &binary_path)
}

