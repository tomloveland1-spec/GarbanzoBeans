use std::sync::Mutex;

pub mod commands;
pub mod db;
pub mod error;
pub mod migrations;
pub mod sentinel;

pub use error::AppError;

/// Tauri managed state — single SQLite connection behind a mutex.
/// Commands access this via `State<DbState>`.
pub struct DbState(pub Mutex<rusqlite::Connection>);

/// Whether this instance is in read-only mode (another instance holds the sentinel lock).
pub struct ReadOnlyState(pub Mutex<bool>);

/// The user-configured data folder path, stored for use in the close handler.
pub struct DataFolderState(pub Mutex<Option<String>>);

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            use tauri::Manager;
            use rusqlite::OptionalExtension;

            // Resolve the app local data directory (pre-onboarding placeholder location).
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

            // Sentinel detection: check if another instance owns the data folder lock.
            // Must run before conn is moved into DbState.
            // data_folder_path is NULL pre-onboarding; sentinel check is skipped in that case.
            let data_folder_opt: Option<String> = conn
                .query_row(
                    "SELECT data_folder_path FROM settings WHERE id = 1",
                    [],
                    |row| row.get::<_, Option<String>>(0),
                )
                .optional()     // Ok(None) if no settings row (pre-onboarding)
                .ok()           // Option<Option<Option<String>>>
                .flatten()      // Option<Option<String>> — outer Option from .optional()
                .flatten();     // Option<String>        — inner Option from nullable column

            let is_read_only = if let Some(ref path) = data_folder_opt {
                let lock_path = std::path::Path::new(path).join("garbanzobeans.lock");
                sentinel::check_and_acquire(&lock_path)
            } else {
                false // pre-onboarding: no data folder configured yet
            };

            app.manage(DbState(Mutex::new(conn)));
            app.manage(ReadOnlyState(Mutex::new(is_read_only)));
            app.manage(DataFolderState(Mutex::new(data_folder_opt)));

            Ok(())
        })
        .on_window_event(|window, event| {
            use tauri::Manager;
            // On normal close: flush WAL and release the sentinel lock (if we own it).
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                let app = window.app_handle();

                // Read is_read_only — explicit semicolon forces guard to drop before val is returned
                let is_read_only: bool = {
                    let ro = app.state::<ReadOnlyState>();
                    let val = match ro.0.lock() {
                        Ok(guard) => *guard,
                        Err(p) => *p.into_inner(),
                    };
                    val
                };

                if !is_read_only {
                    // WAL checkpoint — try_lock avoids deadlock if a command is in flight
                    {
                        let db = app.state::<DbState>();
                        if let Ok(conn) = db.0.try_lock() {
                            sentinel::wal_checkpoint(&conn);
                        };
                    }
                    // Release sentinel — clone path out of guard before releasing lock
                    let data_folder: Option<String> = {
                        let df = app.state::<DataFolderState>();
                        let val = df.0.lock().ok().and_then(|g| g.clone());
                        val
                    };
                    if let Some(path) = data_folder {
                        let lock_path = std::path::Path::new(&path)
                            .join("garbanzobeans.lock");
                        sentinel::release(&lock_path);
                    }
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_db_status,
            commands::get_settings,
            commands::upsert_settings,
            commands::init_data_folder,
            commands::get_read_only_state,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
