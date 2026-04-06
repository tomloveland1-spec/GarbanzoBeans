use std::sync::Mutex;

pub mod commands;
pub mod db;
pub mod error;
pub mod migrations;

pub use error::AppError;

/// Tauri managed state — single SQLite connection behind a mutex.
/// Commands access this via `State<DbState>`.
pub struct DbState(pub Mutex<rusqlite::Connection>);

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            use tauri::Manager;

            // Resolve the app local data directory (pre-onboarding placeholder location).
            // Story 1.5 (Onboarding) will update this to the user-selected folder.
            let data_dir = app
                .path()
                .app_local_data_dir()
                .map_err(|e| Box::new(AppError {
                    code: "PATH_ERROR".to_string(),
                    message: format!("Failed to resolve app data dir: {}", e),
                }) as Box<dyn std::error::Error>)?;

            std::fs::create_dir_all(&data_dir)?;

            let db_path = data_dir.join("garbanzobeans.db");
            let conn = db::init_database(&db_path)?;

            app.manage(DbState(Mutex::new(conn)));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_db_status,
            commands::get_settings,
            commands::upsert_settings,
            commands::init_data_folder,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
