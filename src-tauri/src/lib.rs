mod db;
mod latex;
mod llm;
mod rag;
use db::DbState;
use llm::LlmState;
use rag::EmbeddingState;
use std::sync::Mutex;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            // ── Database ──
            let app_data_dir = app
                .path()
                .app_data_dir()
                .expect("failed to resolve app data dir");
            std::fs::create_dir_all(&app_data_dir)
                .expect("failed to create app data directory");

            let db_path = app_data_dir.join("resume_builder.db");
            let conn = db::init_db(
                db_path.to_str().expect("invalid db path"),
            )
            .expect("failed to initialize database");

            // ── LLM Settings ──
            let llm_settings = llm::load_settings(&conn);
            app.manage(LlmState(Mutex::new(llm_settings)));

            app.manage(DbState(Mutex::new(conn)));

            // ── Embedding Model ──
            let resource_dir = app
                .path()
                .resource_dir()
                .expect("failed to resolve resource dir");
            let model_dir = resource_dir.join("model");
            let model = rag::EmbeddingModel::load(&model_dir)
                .expect("failed to load embedding model");
            app.manage(EmbeddingState(Mutex::new(model)));

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Experience CRUD
            db::commands::create_experience,
            db::commands::list_experiences,
            db::commands::update_experience,
            db::commands::delete_experience,
            // Bullet point CRUD
            db::commands::create_bullet,
            db::commands::update_bullet,
            db::commands::delete_bullet,
            db::commands::list_bullets,
            // Archetype CRUD
            db::commands::create_archetype,
            db::commands::list_archetypes,
            db::commands::delete_archetype,
            // Archetype tagging
            db::commands::tag_bullet,
            db::commands::untag_bullet,
            db::commands::get_archetype_bullets,
            // RAG / Embeddings
            rag::commands::embed_bullet,
            rag::commands::embed_all_bullets,
            rag::commands::search_similar,
            // LLM / Cover Letter
            llm::commands::generate_cover_letter,
            llm::commands::get_llm_settings,
            llm::commands::update_llm_settings,
            llm::commands::extract_resume_pdf,
            // LaTeX
            latex::commands::check_or_download_tectonic,
            latex::commands::compile_tex,
            latex::commands::get_templates,
            latex::commands::inject_and_compile,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
