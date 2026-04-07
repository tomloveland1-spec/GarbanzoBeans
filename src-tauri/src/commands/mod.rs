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

// --- Envelope types ---

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Envelope {
    pub id: i64,
    pub name: String,
    #[serde(rename = "type")]
    pub envelope_type: String,
    pub priority: String,
    pub allocated_cents: i64,
    pub month_id: Option<i64>,
    pub created_at: String,
}

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateEnvelopeInput {
    pub name: String,
    pub envelope_type: String,
    pub priority: String,
    pub allocated_cents: i64,
    pub month_id: Option<i64>,
}

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateEnvelopeInput {
    pub id: i64,
    pub name: Option<String>,
    pub envelope_type: Option<String>,
    pub priority: Option<String>,
    pub allocated_cents: Option<i64>,
    pub month_id: Option<i64>,
}

// --- Envelope validation helpers ---

fn validate_envelope_type(t: &str) -> Result<(), AppError> {
    match t {
        "Rolling" | "Bill" | "Goal" => Ok(()),
        _ => Err(AppError {
            code: "INVALID_ENVELOPE_TYPE".to_string(),
            message: format!("type must be Rolling, Bill, or Goal. Got: {}", t),
        }),
    }
}

fn validate_priority(p: &str) -> Result<(), AppError> {
    match p {
        "Need" | "Should" | "Want" => Ok(()),
        _ => Err(AppError {
            code: "INVALID_PRIORITY".to_string(),
            message: format!("priority must be Need, Should, or Want. Got: {}", p),
        }),
    }
}

// --- Envelope commands (inner helpers accept &Connection for testability) ---

fn get_envelopes_inner(conn: &rusqlite::Connection) -> Result<Vec<Envelope>, AppError> {
    let mut stmt = conn.prepare(
        "SELECT id, name, type, priority, allocated_cents, month_id, created_at \
         FROM envelopes ORDER BY id ASC",
    )?;

    let envelopes = stmt
        .query_map([], |row| {
            Ok(Envelope {
                id: row.get(0)?,
                name: row.get(1)?,
                envelope_type: row.get(2)?,
                priority: row.get(3)?,
                allocated_cents: row.get(4)?,
                month_id: row.get(5)?,
                created_at: row.get(6)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()
        .map_err(AppError::from)?;

    Ok(envelopes)
}

fn create_envelope_inner(
    conn: &rusqlite::Connection,
    input: &CreateEnvelopeInput,
) -> Result<Envelope, AppError> {
    validate_envelope_type(&input.envelope_type)?;
    validate_priority(&input.priority)?;

    if input.name.trim().is_empty() {
        return Err(AppError {
            code: "INVALID_ENVELOPE_NAME".to_string(),
            message: "Envelope name cannot be empty.".to_string(),
        });
    }

    if input.allocated_cents < 0 {
        return Err(AppError {
            code: "INVALID_ALLOCATED_CENTS".to_string(),
            message: "allocated_cents cannot be negative.".to_string(),
        });
    }

    let tx = conn.unchecked_transaction()?;

    tx.execute(
        "INSERT INTO envelopes (name, type, priority, allocated_cents, month_id) \
         VALUES (?1, ?2, ?3, ?4, ?5)",
        rusqlite::params![
            input.name.trim(),
            input.envelope_type,
            input.priority,
            input.allocated_cents,
            input.month_id,
        ],
    )?;

    let id = tx.last_insert_rowid();

    let envelope = tx.query_row(
        "SELECT id, name, type, priority, allocated_cents, month_id, created_at \
         FROM envelopes WHERE id = ?1",
        rusqlite::params![id],
        |row| Ok(Envelope {
            id: row.get(0)?,
            name: row.get(1)?,
            envelope_type: row.get(2)?,
            priority: row.get(3)?,
            allocated_cents: row.get(4)?,
            month_id: row.get(5)?,
            created_at: row.get(6)?,
        }),
    )?;

    tx.commit()?;

    Ok(envelope)
}

fn delete_envelope_inner(conn: &rusqlite::Connection, id: i64) -> Result<(), AppError> {
    let tx = conn.unchecked_transaction()?;

    tx.execute("DELETE FROM envelopes WHERE id = ?1", rusqlite::params![id])?;

    if tx.changes() == 0 {
        return Err(AppError {
            code: "ENVELOPE_NOT_FOUND".to_string(),
            message: format!("No envelope found with id {}", id),
        });
    }

    tx.commit()?;
    Ok(())
}

fn update_envelope_inner(
    conn: &rusqlite::Connection,
    input: &UpdateEnvelopeInput,
) -> Result<Envelope, AppError> {
    if let Some(ref t) = input.envelope_type {
        validate_envelope_type(t)?;
    }
    if let Some(ref p) = input.priority {
        validate_priority(p)?;
    }
    if let Some(ref n) = input.name {
        if n.trim().is_empty() {
            return Err(AppError {
                code: "INVALID_ENVELOPE_NAME".to_string(),
                message: "Envelope name cannot be empty.".to_string(),
            });
        }
    }
    if let Some(cents) = input.allocated_cents {
        if cents < 0 {
            return Err(AppError {
                code: "INVALID_ALLOCATED_CENTS".to_string(),
                message: "allocated_cents cannot be negative.".to_string(),
            });
        }
    }

    let tx = conn.unchecked_transaction()?;

    tx.execute(
        "UPDATE envelopes SET
           name            = COALESCE(?2, name),
           type            = COALESCE(?3, type),
           priority        = COALESCE(?4, priority),
           allocated_cents = COALESCE(?5, allocated_cents),
           month_id        = COALESCE(?6, month_id)
         WHERE id = ?1",
        rusqlite::params![
            input.id,
            input.name.as_deref().map(|s| s.trim()),
            input.envelope_type,
            input.priority,
            input.allocated_cents,
            input.month_id,
        ],
    )?;

    if tx.changes() == 0 {
        return Err(AppError {
            code: "ENVELOPE_NOT_FOUND".to_string(),
            message: format!("No envelope found with id {}", input.id),
        });
    }

    let envelope = tx.query_row(
        "SELECT id, name, type, priority, allocated_cents, month_id, created_at \
         FROM envelopes WHERE id = ?1",
        rusqlite::params![input.id],
        |row| Ok(Envelope {
            id: row.get(0)?,
            name: row.get(1)?,
            envelope_type: row.get(2)?,
            priority: row.get(3)?,
            allocated_cents: row.get(4)?,
            month_id: row.get(5)?,
            created_at: row.get(6)?,
        }),
    )?;

    tx.commit()?;

    Ok(envelope)
}

#[tauri::command]
pub fn get_envelopes(state: State<DbState>) -> Result<Vec<Envelope>, AppError> {
    let conn = state.0.lock().map_err(|_| AppError {
        code: "DB_LOCK_POISON".to_string(),
        message: "Database mutex was poisoned.".to_string(),
    })?;
    get_envelopes_inner(&conn)
}

#[tauri::command]
pub fn create_envelope(
    state: State<DbState>,
    input: CreateEnvelopeInput,
) -> Result<Envelope, AppError> {
    let conn = state.0.lock().map_err(|_| AppError {
        code: "DB_LOCK_POISON".to_string(),
        message: "Database mutex was poisoned.".to_string(),
    })?;
    create_envelope_inner(&conn, &input)
}

#[tauri::command]
pub fn update_envelope(
    state: State<DbState>,
    input: UpdateEnvelopeInput,
) -> Result<Envelope, AppError> {
    let conn = state.0.lock().map_err(|_| AppError {
        code: "DB_LOCK_POISON".to_string(),
        message: "Database mutex was poisoned.".to_string(),
    })?;
    update_envelope_inner(&conn, &input)
}

#[tauri::command]
pub fn delete_envelope(state: State<DbState>, id: i64) -> Result<(), AppError> {
    let conn = state.0.lock().map_err(|_| AppError {
        code: "DB_LOCK_POISON".to_string(),
        message: "Database mutex was poisoned.".to_string(),
    })?;
    delete_envelope_inner(&conn, id)
}

#[cfg(test)]
mod envelope_tests {
    use crate::migrations;
    use rusqlite::Connection;
    use super::{CreateEnvelopeInput, UpdateEnvelopeInput};
    use super::{get_envelopes_inner, create_envelope_inner, update_envelope_inner, delete_envelope_inner};

    fn fresh_conn() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        migrations::run_migrations(&conn).unwrap();
        conn
    }

    #[test]
    fn test_get_envelopes_returns_empty_on_fresh_db() {
        let conn = fresh_conn();
        let result = get_envelopes_inner(&conn).unwrap();
        assert!(result.is_empty(), "fresh DB should have no envelopes");
    }

    #[test]
    fn test_create_envelope_inserts_and_returns() {
        let conn = fresh_conn();
        let input = CreateEnvelopeInput {
            name: "Groceries".to_string(),
            envelope_type: "Rolling".to_string(),
            priority: "Need".to_string(),
            allocated_cents: 50000,
            month_id: None,
        };
        let created = create_envelope_inner(&conn, &input).unwrap();
        assert_eq!(created.name, "Groceries");
        assert_eq!(created.envelope_type, "Rolling");
        assert_eq!(created.priority, "Need");
        assert_eq!(created.allocated_cents, 50000);
        assert!(created.id > 0);
    }

    #[test]
    fn test_create_envelope_rejects_invalid_type() {
        let conn = fresh_conn();
        let input = CreateEnvelopeInput {
            name: "Bad".to_string(),
            envelope_type: "Invalid".to_string(),
            priority: "Need".to_string(),
            allocated_cents: 0,
            month_id: None,
        };
        let err = create_envelope_inner(&conn, &input).unwrap_err();
        assert_eq!(err.code, "INVALID_ENVELOPE_TYPE");
    }

    #[test]
    fn test_update_envelope_modifies_and_returns() {
        let conn = fresh_conn();
        let input = CreateEnvelopeInput {
            name: "Rent".to_string(),
            envelope_type: "Bill".to_string(),
            priority: "Need".to_string(),
            allocated_cents: 100000,
            month_id: None,
        };
        let created = create_envelope_inner(&conn, &input).unwrap();

        let update = UpdateEnvelopeInput {
            id: created.id,
            name: Some("Rent Updated".to_string()),
            envelope_type: None,
            priority: None,
            allocated_cents: Some(120000),
            month_id: None,
        };
        let updated = update_envelope_inner(&conn, &update).unwrap();
        assert_eq!(updated.name, "Rent Updated");
        assert_eq!(updated.allocated_cents, 120000);
        assert_eq!(updated.envelope_type, "Bill");
    }

    #[test]
    fn test_update_envelope_not_found() {
        let conn = fresh_conn();
        let update = UpdateEnvelopeInput {
            id: 9999,
            name: Some("Ghost".to_string()),
            envelope_type: None,
            priority: None,
            allocated_cents: None,
            month_id: None,
        };
        let err = update_envelope_inner(&conn, &update).unwrap_err();
        assert_eq!(err.code, "ENVELOPE_NOT_FOUND");
    }

    #[test]
    fn test_delete_envelope_ok() {
        let conn = fresh_conn();
        let input = CreateEnvelopeInput {
            name: "Groceries".to_string(),
            envelope_type: "Rolling".to_string(),
            priority: "Need".to_string(),
            allocated_cents: 50000,
            month_id: None,
        };
        let created = create_envelope_inner(&conn, &input).unwrap();
        let result = delete_envelope_inner(&conn, created.id);
        assert!(result.is_ok(), "delete of existing envelope should return Ok(())");

        let envelopes = get_envelopes_inner(&conn).unwrap();
        assert!(envelopes.is_empty(), "envelope list should be empty after delete");
    }

    #[test]
    fn test_delete_envelope_not_found() {
        let conn = fresh_conn();
        let err = delete_envelope_inner(&conn, 9999).unwrap_err();
        assert_eq!(err.code, "ENVELOPE_NOT_FOUND");
    }
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
