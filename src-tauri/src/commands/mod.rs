use crate::error::AppError;
use crate::DbState;
use tauri::State;

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpsertSettingsInput {
    pub budget_name: Option<String>,
    pub start_month: Option<String>,
    pub pay_frequency: Option<String>,
    pub pay_dates: Option<String>,
    pub savings_target_pct: Option<i64>,
    pub data_folder_path: Option<String>,
    pub onboarding_complete: Option<bool>,
}

#[tauri::command]
pub fn get_db_status(state: State<DbState>) -> Result<serde_json::Value, AppError> {
    let conn = state.0.lock().map_err(|_| AppError {
        code: "DB_LOCK_POISON".to_string(),
        message: "Database mutex was poisoned.".to_string(),
    })?;

    let version: i64 = conn
        .query_row(
            "SELECT COALESCE(MAX(version), 0) FROM schema_version",
            [],
            |row| row.get(0),
        )
        .map_err(AppError::from)?;

    Ok(serde_json::json!({
        "schema_version": version,
        "status": "ok"
    }))
}

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    pub id: i64,
    pub budget_name: Option<String>,
    pub start_month: Option<String>,
    pub pay_frequency: Option<String>,
    pub pay_dates: Option<String>,
    pub savings_target_pct: i64,
    pub data_folder_path: Option<String>,
    pub onboarding_complete: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[tauri::command]
pub fn get_settings(state: State<DbState>) -> Result<Option<Settings>, AppError> {
    let conn = state.0.lock().map_err(|_| AppError {
        code: "DB_LOCK_POISON".to_string(),
        message: "Database mutex was poisoned.".to_string(),
    })?;

    let result = conn.query_row(
        "SELECT id, budget_name, start_month, pay_frequency, pay_dates, \
         savings_target_pct, data_folder_path, onboarding_complete, created_at, updated_at \
         FROM settings WHERE id = 1",
        [],
        |row| {
            Ok(Settings {
                id: row.get(0)?,
                budget_name: row.get(1)?,
                start_month: row.get(2)?,
                pay_frequency: row.get(3)?,
                pay_dates: row.get(4)?,
                savings_target_pct: row.get(5)?,
                data_folder_path: row.get(6)?,
                onboarding_complete: row.get::<_, Option<i64>>(7)?.unwrap_or(0) != 0,
                created_at: row.get(8)?,
                updated_at: row.get(9)?,
            })
        },
    );

    match result {
        Ok(settings) => Ok(Some(settings)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(AppError::from(e)),
    }
}

#[tauri::command]
pub fn upsert_settings(
    state: State<DbState>,
    input: UpsertSettingsInput,
) -> Result<(), AppError> {
    let conn = state.0.lock().map_err(|_| AppError {
        code: "DB_LOCK_POISON".to_string(),
        message: "Database mutex was poisoned.".to_string(),
    })?;

    if let Some(pct) = input.savings_target_pct {
        if !(0..=100).contains(&pct) {
            return Err(AppError {
                code: "INVALID_SAVINGS_TARGET".to_string(),
                message: format!("savings_target_pct must be 0–100, got {}", pct),
            });
        }
    }

    if let Some(ref month) = input.start_month {
        if !month.is_empty() {
            let valid = month.len() == 7
                && month.as_bytes().get(4) == Some(&b'-')
                && month[..4].parse::<u32>().is_ok()
                && month[5..].parse::<u32>().map_or(false, |m| (1..=12).contains(&m));
            if !valid {
                return Err(AppError {
                    code: "INVALID_START_MONTH".to_string(),
                    message: format!("start_month must be YYYY-MM format, got: {}", month),
                });
            }
        }
    }

    if let Some(ref freq) = input.pay_frequency {
        const ALLOWED_FREQUENCIES: &[&str] = &["weekly", "bi-weekly", "twice-monthly", "monthly"];
        if !ALLOWED_FREQUENCIES.contains(&freq.as_str()) {
            return Err(AppError {
                code: "INVALID_PAY_FREQUENCY".to_string(),
                message: format!(
                    "pay_frequency must be one of: weekly, bi-weekly, twice-monthly, monthly. Got: {}",
                    freq
                ),
            });
        }
    }

    conn.execute(
        "INSERT INTO settings (
            id, budget_name, start_month, pay_frequency, pay_dates,
            savings_target_pct, data_folder_path, onboarding_complete
         ) VALUES (1, ?1, ?2, ?3, ?4, ?5, ?6, ?7)
         ON CONFLICT(id) DO UPDATE SET
            budget_name          = COALESCE(?1, budget_name),
            start_month          = COALESCE(?2, start_month),
            pay_frequency        = COALESCE(?3, pay_frequency),
            pay_dates            = COALESCE(?4, pay_dates),
            savings_target_pct   = COALESCE(?5, savings_target_pct),
            data_folder_path     = COALESCE(?6, data_folder_path),
            onboarding_complete  = COALESCE(?7, onboarding_complete)",
        rusqlite::params![
            input.budget_name,
            input.start_month,
            input.pay_frequency,
            input.pay_dates,
            input.savings_target_pct,
            input.data_folder_path,
            input.onboarding_complete.map(|b| if b { 1i64 } else { 0i64 }),
        ],
    ).map_err(AppError::from)?;

    Ok(())
}

#[tauri::command]
pub fn get_read_only_state(state: State<crate::ReadOnlyState>) -> bool {
    *state.0.lock().unwrap_or_else(|p| p.into_inner())
}

#[tauri::command]
pub fn init_data_folder(
    data_folder_path: String,
    data_folder_state: State<crate::DataFolderState>,
    read_only_state: State<crate::ReadOnlyState>,
) -> Result<(), AppError> {
    use std::path::{Component, Path};

    if data_folder_path.trim().is_empty() {
        return Err(AppError {
            code: "INVALID_DATA_FOLDER".to_string(),
            message: "Data folder path cannot be empty.".to_string(),
        });
    }

    let folder = Path::new(&data_folder_path);

    if !folder.is_absolute() {
        return Err(AppError {
            code: "INVALID_DATA_FOLDER".to_string(),
            message: "Data folder path must be absolute.".to_string(),
        });
    }

    if folder.components().any(|c| c == Component::ParentDir) {
        return Err(AppError {
            code: "INVALID_DATA_FOLDER".to_string(),
            message: "Data folder path must not contain path traversal sequences.".to_string(),
        });
    }

    std::fs::create_dir_all(folder).map_err(|e| AppError {
        code: "FOLDER_CREATE_FAIL".to_string(),
        message: format!("Failed to create data folder: {}", e),
    })?;

    let lock_path = folder.join("garbanzobeans.lock");
    std::fs::write(&lock_path, "locked\n").map_err(|e| AppError {
        code: "SENTINEL_WRITE_FAIL".to_string(),
        message: format!("Failed to write sentinel lock file: {}", e),
    })?;

    // Update managed state so the close handler knows where to release the sentinel.
    // Without this, DataFolderState remains None for the session (set at startup before
    // onboarding completes), causing the close handler to skip sentinel::release() and
    // leaving a stale lock that makes the next launch open in read-only mode.
    if let Ok(mut guard) = data_folder_state.0.lock() {
        *guard = Some(data_folder_path);
    }
    if let Ok(mut guard) = read_only_state.0.lock() {
        *guard = false;
    }

    Ok(())
}
