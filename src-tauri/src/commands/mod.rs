use crate::error::AppError;
use crate::DbState;
use tauri::State;
use rusqlite::OptionalExtension;

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
    pub is_savings: bool,
}

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateEnvelopeInput {
    pub name: String,
    pub envelope_type: String,
    pub priority: String,
    pub allocated_cents: i64,
    pub month_id: Option<i64>,
    pub is_savings: Option<bool>,
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
    pub is_savings: Option<bool>,
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
        "SELECT id, name, type, priority, allocated_cents, month_id, created_at, is_savings \
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
                is_savings: row.get::<_, i64>(7)? != 0,
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
        "INSERT INTO envelopes (name, type, priority, allocated_cents, month_id, is_savings) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        rusqlite::params![
            input.name.trim(),
            input.envelope_type,
            input.priority,
            input.allocated_cents,
            input.month_id,
            input.is_savings.map(|b| if b { 1i64 } else { 0i64 }).unwrap_or(0),
        ],
    )?;

    let id = tx.last_insert_rowid();

    let envelope = tx.query_row(
        "SELECT id, name, type, priority, allocated_cents, month_id, created_at, is_savings \
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
            is_savings: row.get::<_, i64>(7)? != 0,
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

    if let Some(true) = input.is_savings {
        let already: i64 = conn.query_row(
            "SELECT COUNT(*) FROM envelopes WHERE is_savings = 1 AND id != ?1",
            rusqlite::params![input.id],
            |row| row.get(0),
        )?;
        if already > 0 {
            return Err(AppError {
                code: "SAVINGS_ALREADY_DESIGNATED".to_string(),
                message: "Another envelope is already designated as savings. Remove that designation first.".to_string(),
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
           month_id        = COALESCE(?6, month_id),
           is_savings      = COALESCE(?7, is_savings)
         WHERE id = ?1",
        rusqlite::params![
            input.id,
            input.name.as_deref().map(|s| s.trim()),
            input.envelope_type,
            input.priority,
            input.allocated_cents,
            input.month_id,
            input.is_savings.map(|b| if b { 1i64 } else { 0i64 }),
        ],
    )?;

    if tx.changes() == 0 {
        return Err(AppError {
            code: "ENVELOPE_NOT_FOUND".to_string(),
            message: format!("No envelope found with id {}", input.id),
        });
    }

    let envelope = tx.query_row(
        "SELECT id, name, type, priority, allocated_cents, month_id, created_at, is_savings \
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
            is_savings: row.get::<_, i64>(7)? != 0,
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

// --- Income entry types ---

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IncomeEntry {
    pub id: i64,
    pub name: String,
    pub amount_cents: i64,
}

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateIncomeEntryInput {
    pub name: String,
    pub amount_cents: i64,
}

// --- Income entry commands (inner helpers accept &Connection for testability) ---

fn get_income_entries_inner(conn: &rusqlite::Connection) -> Result<Vec<IncomeEntry>, AppError> {
    let mut stmt = conn.prepare(
        "SELECT id, name, amount_cents FROM income_entries ORDER BY id ASC",
    )?;

    let entries = stmt
        .query_map([], |row| {
            Ok(IncomeEntry {
                id: row.get(0)?,
                name: row.get(1)?,
                amount_cents: row.get(2)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()
        .map_err(AppError::from)?;

    Ok(entries)
}

fn create_income_entry_inner(
    conn: &rusqlite::Connection,
    input: &CreateIncomeEntryInput,
) -> Result<IncomeEntry, AppError> {
    if input.name.trim().is_empty() {
        return Err(AppError {
            code: "INVALID_INCOME_ENTRY_NAME".to_string(),
            message: "Income entry name cannot be empty.".to_string(),
        });
    }

    if input.amount_cents < 0 {
        return Err(AppError {
            code: "INVALID_AMOUNT_CENTS".to_string(),
            message: "amount_cents cannot be negative.".to_string(),
        });
    }

    let tx = conn.unchecked_transaction()?;

    tx.execute(
        "INSERT INTO income_entries (name, amount_cents) VALUES (?1, ?2)",
        rusqlite::params![input.name.trim(), input.amount_cents],
    )?;

    let id = tx.last_insert_rowid();

    let entry = tx.query_row(
        "SELECT id, name, amount_cents FROM income_entries WHERE id = ?1",
        rusqlite::params![id],
        |row| Ok(IncomeEntry {
            id: row.get(0)?,
            name: row.get(1)?,
            amount_cents: row.get(2)?,
        }),
    )?;

    tx.commit()?;

    Ok(entry)
}

fn delete_income_entry_inner(conn: &rusqlite::Connection, id: i64) -> Result<(), AppError> {
    let tx = conn.unchecked_transaction()?;

    tx.execute(
        "DELETE FROM income_entries WHERE id = ?1",
        rusqlite::params![id],
    )?;

    if tx.changes() == 0 {
        return Err(AppError {
            code: "ENTRY_NOT_FOUND".to_string(),
            message: format!("No income entry found with id {}", id),
        });
    }

    tx.commit()?;
    Ok(())
}

#[tauri::command]
pub fn get_income_entries(state: State<DbState>) -> Result<Vec<IncomeEntry>, AppError> {
    let conn = state.0.lock().map_err(|_| AppError {
        code: "DB_LOCK_POISON".to_string(),
        message: "Database mutex was poisoned.".to_string(),
    })?;
    get_income_entries_inner(&conn)
}

#[tauri::command]
pub fn create_income_entry(
    state: State<DbState>,
    input: CreateIncomeEntryInput,
) -> Result<IncomeEntry, AppError> {
    let conn = state.0.lock().map_err(|_| AppError {
        code: "DB_LOCK_POISON".to_string(),
        message: "Database mutex was poisoned.".to_string(),
    })?;
    create_income_entry_inner(&conn, &input)
}

#[tauri::command]
pub fn delete_income_entry(state: State<DbState>, id: i64) -> Result<(), AppError> {
    let conn = state.0.lock().map_err(|_| AppError {
        code: "DB_LOCK_POISON".to_string(),
        message: "Database mutex was poisoned.".to_string(),
    })?;
    delete_income_entry_inner(&conn, id)
}

// --- Allocation types ---

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AllocationItem {
    pub id: i64,
    pub allocated_cents: i64,
}

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AllocateEnvelopesInput {
    pub allocations: Vec<AllocationItem>,
}

// --- Bulk allocation command ---

fn allocate_envelopes_inner(
    conn: &rusqlite::Connection,
    input: &AllocateEnvelopesInput,
) -> Result<Vec<Envelope>, AppError> {
    // Validate all cents and reject duplicate IDs before opening the transaction
    let mut seen = std::collections::HashSet::new();
    for item in &input.allocations {
        if item.allocated_cents < 0 {
            return Err(AppError {
                code: "INVALID_ALLOCATED_CENTS".to_string(),
                message: "allocated_cents cannot be negative.".to_string(),
            });
        }
        if !seen.insert(item.id) {
            return Err(AppError {
                code: "DUPLICATE_ENVELOPE_ID".to_string(),
                message: format!("Duplicate envelope id {} in allocations", item.id),
            });
        }
    }

    if input.allocations.is_empty() {
        return Ok(vec![]);
    }

    let tx = conn.unchecked_transaction()?;

    for item in &input.allocations {
        tx.execute(
            "UPDATE envelopes SET allocated_cents = ?2 WHERE id = ?1",
            rusqlite::params![item.id, item.allocated_cents],
        )?;

        if tx.changes() == 0 {
            return Err(AppError {
                code: "ENVELOPE_NOT_FOUND".to_string(),
                message: format!("No envelope found with id {}", item.id),
            });
        }
    }

    // Re-SELECT all updated envelopes in one pass
    let ids: Vec<i64> = input.allocations.iter().map(|a| a.id).collect();
    let placeholders = ids
        .iter()
        .enumerate()
        .map(|(i, _)| format!("?{}", i + 1))
        .collect::<Vec<_>>()
        .join(", ");
    let sql = format!(
        "SELECT id, name, type, priority, allocated_cents, month_id, created_at, is_savings \
         FROM envelopes WHERE id IN ({}) ORDER BY id ASC",
        placeholders
    );

    // Collect envelopes before committing — stmt borrows tx, must be dropped first.
    // Using a named local `rows` inside the block before the final expression forces
    // the MappedRows temporary to drop before the block ends and tx becomes available.
    let envelopes = {
        let mut stmt = tx.prepare(&sql)?;
        let rows = stmt
            .query_map(rusqlite::params_from_iter(ids.iter()), |row| {
                Ok(Envelope {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    envelope_type: row.get(2)?,
                    priority: row.get(3)?,
                    allocated_cents: row.get(4)?,
                    month_id: row.get(5)?,
                    created_at: row.get(6)?,
                    is_savings: row.get::<_, i64>(7)? != 0,
                })
            })?
            .collect::<Result<Vec<_>, _>>()
            .map_err(AppError::from)?;
        rows
    };

    tx.commit()?;

    Ok(envelopes)
}

#[tauri::command]
pub fn allocate_envelopes(
    state: State<DbState>,
    input: AllocateEnvelopesInput,
) -> Result<Vec<Envelope>, AppError> {
    let conn = state.0.lock().map_err(|_| AppError {
        code: "DB_LOCK_POISON".to_string(),
        message: "Database mutex was poisoned.".to_string(),
    })?;
    allocate_envelopes_inner(&conn, &input)
}

// --- Borrow types ---

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BorrowInput {
    pub source_envelope_id: i64,
    pub target_envelope_id: i64,
    pub amount_cents: i64,
}

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BorrowResult {
    pub source: Envelope,
    pub target: Envelope,
}

// --- Borrow command (inner helper for testability) ---

fn borrow_from_envelope_inner(
    conn: &rusqlite::Connection,
    input: &BorrowInput,
) -> Result<BorrowResult, AppError> {
    if input.amount_cents <= 0 {
        return Err(AppError {
            code: "INVALID_AMOUNT_CENTS".to_string(),
            message: "amount_cents must be greater than zero.".to_string(),
        });
    }

    if input.source_envelope_id == input.target_envelope_id {
        return Err(AppError {
            code: "INVALID_BORROW_SAME_ENVELOPE".to_string(),
            message: "Source and target envelopes must be different.".to_string(),
        });
    }

    let tx = conn.unchecked_transaction()?;

    // Fetch source allocated_cents inside the transaction to prevent TOCTOU race
    let source_allocated: i64 = tx
        .query_row(
            "SELECT allocated_cents FROM envelopes WHERE id = ?1",
            rusqlite::params![input.source_envelope_id],
            |row| row.get(0),
        )
        .map_err(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => AppError {
                code: "ENVELOPE_NOT_FOUND".to_string(),
                message: format!("No envelope found with id {}", input.source_envelope_id),
            },
            other => AppError::from(other),
        })?;

    if source_allocated < input.amount_cents {
        return Err(AppError {
            code: "INSUFFICIENT_BALANCE".to_string(),
            message: "Source envelope does not have enough balance to cover this borrow.".to_string(),
        });
    }

    tx.execute(
        "UPDATE envelopes SET allocated_cents = allocated_cents - ?2 WHERE id = ?1",
        rusqlite::params![input.source_envelope_id, input.amount_cents],
    )?;

    if tx.changes() == 0 {
        return Err(AppError {
            code: "ENVELOPE_NOT_FOUND".to_string(),
            message: format!("No envelope found with id {}", input.source_envelope_id),
        });
    }

    tx.execute(
        "UPDATE envelopes SET allocated_cents = allocated_cents + ?2 WHERE id = ?1",
        rusqlite::params![input.target_envelope_id, input.amount_cents],
    )?;

    if tx.changes() == 0 {
        return Err(AppError {
            code: "ENVELOPE_NOT_FOUND".to_string(),
            message: format!("No envelope found with id {}", input.target_envelope_id),
        });
    }

    tx.execute(
        "INSERT INTO borrow_events (source_envelope_id, target_envelope_id, amount_cents) \
         VALUES (?1, ?2, ?3)",
        rusqlite::params![
            input.source_envelope_id,
            input.target_envelope_id,
            input.amount_cents,
        ],
    )?;

    // Re-SELECT both envelopes with authoritative DB values
    let source = tx.query_row(
        "SELECT id, name, type, priority, allocated_cents, month_id, created_at, is_savings \
         FROM envelopes WHERE id = ?1",
        rusqlite::params![input.source_envelope_id],
        |row| Ok(Envelope {
            id: row.get(0)?,
            name: row.get(1)?,
            envelope_type: row.get(2)?,
            priority: row.get(3)?,
            allocated_cents: row.get(4)?,
            month_id: row.get(5)?,
            created_at: row.get(6)?,
            is_savings: row.get::<_, i64>(7)? != 0,
        }),
    ).map_err(AppError::from)?;

    let target = tx.query_row(
        "SELECT id, name, type, priority, allocated_cents, month_id, created_at, is_savings \
         FROM envelopes WHERE id = ?1",
        rusqlite::params![input.target_envelope_id],
        |row| Ok(Envelope {
            id: row.get(0)?,
            name: row.get(1)?,
            envelope_type: row.get(2)?,
            priority: row.get(3)?,
            allocated_cents: row.get(4)?,
            month_id: row.get(5)?,
            created_at: row.get(6)?,
            is_savings: row.get::<_, i64>(7)? != 0,
        }),
    ).map_err(AppError::from)?;

    tx.commit()?;

    Ok(BorrowResult { source, target })
}

#[tauri::command]
pub fn borrow_from_envelope(
    state: State<DbState>,
    input: BorrowInput,
) -> Result<BorrowResult, AppError> {
    let conn = state.0.lock().map_err(|_| AppError {
        code: "DB_LOCK_POISON".to_string(),
        message: "Database mutex was poisoned.".to_string(),
    })?;
    borrow_from_envelope_inner(&conn, &input)
}

// --- Transaction types ---

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Transaction {
    pub id: i64,
    pub payee: String,
    pub amount_cents: i64,         // index 2 — INTEGER cents, NEVER float
    pub date: String,              // index 3 — ISO 8601 "YYYY-MM-DD"
    pub envelope_id: Option<i64>, // index 4 — nullable FK
    pub is_cleared: bool,          // index 5 — stored as i64 0/1
    pub import_batch_id: Option<String>, // index 6 — nullable
    pub created_at: String,        // index 7 — ISO 8601 UTC
}

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateTransactionInput {
    pub payee: String,
    pub amount_cents: i64,
    pub date: String,
    pub envelope_id: Option<i64>,
    pub is_cleared: Option<bool>,
    pub import_batch_id: Option<String>,
}

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateTransactionInput {
    pub id: i64,
    pub payee: Option<String>,
    pub amount_cents: Option<i64>,
    pub date: Option<String>,
    pub envelope_id: Option<i64>,
    pub clear_envelope_id: Option<bool>, // when true, sets envelope_id = NULL regardless of envelope_id field
    pub is_cleared: Option<bool>,
}

// --- Transaction row mapper (shared across get/create/update) ---

fn map_transaction_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<Transaction> {
    Ok(Transaction {
        id: row.get(0)?,
        payee: row.get(1)?,
        amount_cents: row.get(2)?,
        date: row.get(3)?,
        envelope_id: row.get::<_, Option<i64>>(4)?,
        is_cleared: row.get::<_, i64>(5)? != 0,
        import_batch_id: row.get::<_, Option<String>>(6)?,
        created_at: row.get(7)?,
    })
}

// --- Compute next month for date-range filtering ---

fn next_month(ym: &str) -> String {
    let parts: Vec<&str> = ym.splitn(2, '-').collect();
    let year: i32 = parts.first().and_then(|s| s.parse().ok()).unwrap_or(2026);
    let month: i32 = parts.get(1).and_then(|s| s.parse().ok()).unwrap_or(1);
    if month == 12 {
        format!("{}-01", year + 1)
    } else {
        format!("{}-{:02}", year, month + 1)
    }
}

// Validate month_key is "YYYY-MM" with a valid month component (01–12).
fn validate_month_key(ym: &str) -> Result<(), AppError> {
    let parts: Vec<&str> = ym.splitn(2, '-').collect();
    if parts.len() != 2 {
        return Err(AppError {
            code: "INVALID_MONTH_KEY".to_string(),
            message: format!("month_key must be 'YYYY-MM', got '{}'", ym),
        });
    }
    let month: i32 = parts[1].parse().map_err(|_| AppError {
        code: "INVALID_MONTH_KEY".to_string(),
        message: format!("month_key has invalid month component: '{}'", ym),
    })?;
    if !(1..=12).contains(&month) {
        return Err(AppError {
            code: "INVALID_MONTH_KEY".to_string(),
            message: format!("month_key month must be 01-12, got '{}'", ym),
        });
    }
    Ok(())
}

// --- Transaction commands ---

fn get_transactions_inner(
    conn: &rusqlite::Connection,
    month_key: Option<String>,
) -> Result<Vec<Transaction>, AppError> {
    // Split into two branches so each stmt has an independent scope — avoids E0597.
    if let Some(ref ym) = month_key {
        validate_month_key(ym)?;
        let lower = format!("{}-01", ym);
        let upper = next_month(ym);
        let mut stmt = conn.prepare(
            "SELECT id, payee, amount_cents, date, envelope_id, is_cleared, import_batch_id, created_at \
             FROM transactions WHERE date >= ?1 AND date < ?2 ORDER BY date DESC, id DESC",
        )?;
        let rows = stmt
            .query_map(rusqlite::params![lower, upper], map_transaction_row)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(AppError::from)?;
        Ok(rows)
    } else {
        let mut stmt = conn.prepare(
            "SELECT id, payee, amount_cents, date, envelope_id, is_cleared, import_batch_id, created_at \
             FROM transactions ORDER BY date DESC, id DESC",
        )?;
        let rows = stmt
            .query_map([], map_transaction_row)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(AppError::from)?;
        Ok(rows)
    }
}

fn create_transaction_inner(
    conn: &rusqlite::Connection,
    input: &CreateTransactionInput,
) -> Result<Transaction, AppError> {
    // Blank payee is intentionally allowed — OFX imports may carry no payee name.
    // This differs from income/envelope commands, which reject empty names.
    let tx = conn.unchecked_transaction()?;
    tx.execute(
        "INSERT INTO transactions (payee, amount_cents, date, envelope_id, is_cleared, import_batch_id) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        rusqlite::params![
            input.payee,
            input.amount_cents,
            input.date,
            input.envelope_id,
            if input.is_cleared.unwrap_or(false) { 1i64 } else { 0i64 },
            input.import_batch_id,
        ],
    )?;
    let id = tx.last_insert_rowid();
    let row = tx.query_row(
        "SELECT id, payee, amount_cents, date, envelope_id, is_cleared, import_batch_id, created_at \
         FROM transactions WHERE id = ?1",
        rusqlite::params![id],
        map_transaction_row,
    )?;
    tx.commit()?;
    Ok(row)
}

fn update_transaction_inner(
    conn: &rusqlite::Connection,
    input: &UpdateTransactionInput,
) -> Result<Transaction, AppError> {
    let tx = conn.unchecked_transaction()?;

    tx.execute(
        "UPDATE transactions SET
           payee        = COALESCE(?2, payee),
           amount_cents = COALESCE(?3, amount_cents),
           date         = COALESCE(?4, date),
           envelope_id  = CASE WHEN ?7 = 1 THEN NULL ELSE COALESCE(?5, envelope_id) END,
           is_cleared   = COALESCE(?6, is_cleared)
         WHERE id = ?1",
        rusqlite::params![
            input.id,
            input.payee.as_deref(),
            input.amount_cents,
            input.date.as_deref(),
            input.envelope_id,
            input.is_cleared.map(|b| if b { 1i64 } else { 0i64 }),
            if input.clear_envelope_id.unwrap_or(false) { 1i64 } else { 0i64 },
        ],
    )?;

    if tx.changes() == 0 {
        return Err(AppError {
            code: "TRANSACTION_NOT_FOUND".to_string(),
            message: format!("No transaction found with id {}", input.id),
        });
    }

    let row = tx.query_row(
        "SELECT id, payee, amount_cents, date, envelope_id, is_cleared, import_batch_id, created_at \
         FROM transactions WHERE id = ?1",
        rusqlite::params![input.id],
        map_transaction_row,
    )?;
    tx.commit()?;
    Ok(row)
}

#[tauri::command]
pub fn get_transactions(
    state: State<DbState>,
    month_key: Option<String>,
) -> Result<Vec<Transaction>, AppError> {
    let conn = state.0.lock().map_err(|_| AppError {
        code: "DB_LOCK_POISON".to_string(),
        message: "Database mutex was poisoned.".to_string(),
    })?;
    get_transactions_inner(&conn, month_key)
}

#[tauri::command]
pub fn create_transaction(
    state: State<DbState>,
    input: CreateTransactionInput,
) -> Result<Transaction, AppError> {
    let conn = state.0.lock().map_err(|_| AppError {
        code: "DB_LOCK_POISON".to_string(),
        message: "Database mutex was poisoned.".to_string(),
    })?;
    create_transaction_inner(&conn, &input)
}

#[tauri::command]
pub fn update_transaction(
    state: State<DbState>,
    input: UpdateTransactionInput,
) -> Result<Transaction, AppError> {
    let conn = state.0.lock().map_err(|_| AppError {
        code: "DB_LOCK_POISON".to_string(),
        message: "Database mutex was poisoned.".to_string(),
    })?;
    update_transaction_inner(&conn, &input)
}

#[cfg(test)]
mod transaction_tests {
    use crate::migrations;
    use rusqlite::Connection;
    use super::{CreateTransactionInput, UpdateTransactionInput};
    use super::{get_transactions_inner, create_transaction_inner, update_transaction_inner};

    fn fresh_conn() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        migrations::run_migrations(&conn).unwrap();
        conn
    }

    fn make_tx(conn: &Connection, payee: &str, cents: i64, date: &str) -> super::Transaction {
        create_transaction_inner(conn, &CreateTransactionInput {
            payee: payee.to_string(),
            amount_cents: cents,
            date: date.to_string(),
            envelope_id: None,
            is_cleared: None,
            import_batch_id: None,
        }).unwrap()
    }

    #[test]
    fn test_create_transaction_returns_inserted_row() {
        let conn = fresh_conn();
        let tx = make_tx(&conn, "Grocery Store", 5000, "2026-04-05");
        assert!(tx.id > 0);
        assert_eq!(tx.payee, "Grocery Store");
        assert_eq!(tx.amount_cents, 5000);
        assert_eq!(tx.date, "2026-04-05");
        assert!(tx.envelope_id.is_none());
        assert!(tx.import_batch_id.is_none());
    }

    #[test]
    fn test_create_transaction_is_uncleared_by_default() {
        let conn = fresh_conn();
        let tx = make_tx(&conn, "Coffee Shop", 500, "2026-04-06");
        assert!(!tx.is_cleared, "transaction should default to uncleared");
    }

    #[test]
    fn test_get_transactions_filters_by_month_key() {
        let conn = fresh_conn();
        make_tx(&conn, "March item", 100, "2026-03-15");
        make_tx(&conn, "April item", 200, "2026-04-10");
        make_tx(&conn, "May item", 300, "2026-05-01");

        let april = get_transactions_inner(&conn, Some("2026-04".to_string())).unwrap();
        assert_eq!(april.len(), 1);
        assert_eq!(april[0].payee, "April item");
    }

    #[test]
    fn test_get_transactions_returns_all_when_no_month_key() {
        let conn = fresh_conn();
        make_tx(&conn, "Item A", 100, "2026-01-01");
        make_tx(&conn, "Item B", 200, "2026-06-15");
        make_tx(&conn, "Item C", 300, "2025-12-31");

        let all = get_transactions_inner(&conn, None).unwrap();
        assert_eq!(all.len(), 3);
    }

    #[test]
    fn test_update_transaction_changes_fields() {
        let conn = fresh_conn();
        let created = make_tx(&conn, "Old Payee", 1000, "2026-04-01");

        let updated = update_transaction_inner(&conn, &UpdateTransactionInput {
            id: created.id,
            payee: Some("New Payee".to_string()),
            amount_cents: Some(2000),
            date: None,
            envelope_id: None,
            clear_envelope_id: None,
            is_cleared: Some(true),
        }).unwrap();

        assert_eq!(updated.id, created.id);
        assert_eq!(updated.payee, "New Payee");
        assert_eq!(updated.amount_cents, 2000);
        assert_eq!(updated.date, "2026-04-01"); // unchanged
        assert!(updated.is_cleared);
    }

    #[test]
    fn test_update_transaction_returns_not_found_for_invalid_id() {
        let conn = fresh_conn();
        let err = update_transaction_inner(&conn, &UpdateTransactionInput {
            id: 9999,
            payee: Some("Ghost".to_string()),
            amount_cents: None,
            date: None,
            envelope_id: None,
            clear_envelope_id: None,
            is_cleared: None,
        }).unwrap_err();
        assert_eq!(err.code, "TRANSACTION_NOT_FOUND");
    }

    #[test]
    fn test_update_transaction_clears_envelope_id_when_flag_set() {
        let conn = fresh_conn();
        // Create a transaction with an envelope_id set (use a raw INSERT since create_transaction
        // doesn't accept envelope_id as a parameter in this test helper)
        let created = make_tx(&conn, "Categorized", 500, "2026-04-01");
        conn.execute(
            "UPDATE transactions SET envelope_id = 1 WHERE id = ?1",
            rusqlite::params![created.id],
        ).unwrap();

        // Verify envelope_id is set
        let before = update_transaction_inner(&conn, &UpdateTransactionInput {
            id: created.id,
            payee: None,
            amount_cents: None,
            date: None,
            envelope_id: None,
            clear_envelope_id: None,
            is_cleared: None,
        }).unwrap();
        assert_eq!(before.envelope_id, Some(1));

        // Now clear it
        let after = update_transaction_inner(&conn, &UpdateTransactionInput {
            id: created.id,
            payee: None,
            amount_cents: None,
            date: None,
            envelope_id: None,
            clear_envelope_id: Some(true),
            is_cleared: None,
        }).unwrap();
        assert!(after.envelope_id.is_none(), "envelope_id should be cleared to NULL");
    }
}

#[cfg(test)]
mod borrow_tests {
    use crate::migrations;
    use rusqlite::Connection;
    use super::{CreateEnvelopeInput, BorrowInput};
    use super::{create_envelope_inner, borrow_from_envelope_inner};

    fn fresh_conn() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        migrations::run_migrations(&conn).unwrap();
        conn
    }

    fn make_envelope(conn: &Connection, name: &str, cents: i64) -> i64 {
        let input = CreateEnvelopeInput {
            name: name.to_string(),
            envelope_type: "Rolling".to_string(),
            priority: "Need".to_string(),
            allocated_cents: cents,
            month_id: None,
            is_savings: None,
        };
        create_envelope_inner(conn, &input).unwrap().id
    }

    #[test]
    fn test_borrow_from_envelope_happy_path() {
        let conn = fresh_conn();
        let source_id = make_envelope(&conn, "Vacation", 50000);
        let target_id = make_envelope(&conn, "Car Repair", 0);

        let input = BorrowInput {
            source_envelope_id: source_id,
            target_envelope_id: target_id,
            amount_cents: 20000,
        };
        let result = borrow_from_envelope_inner(&conn, &input).unwrap();

        assert_eq!(result.source.id, source_id);
        assert_eq!(result.source.allocated_cents, 30000);
        assert_eq!(result.target.id, target_id);
        assert_eq!(result.target.allocated_cents, 20000);

        // Verify borrow_event was inserted
        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM borrow_events", [], |row| row.get(0))
            .unwrap();
        assert_eq!(count, 1);
    }

    #[test]
    fn test_borrow_from_envelope_same_envelope() {
        let conn = fresh_conn();
        let id = make_envelope(&conn, "Groceries", 50000);
        let input = BorrowInput {
            source_envelope_id: id,
            target_envelope_id: id,
            amount_cents: 10000,
        };
        let err = borrow_from_envelope_inner(&conn, &input).unwrap_err();
        assert_eq!(err.code, "INVALID_BORROW_SAME_ENVELOPE");
    }

    #[test]
    fn test_borrow_from_envelope_zero_amount() {
        let conn = fresh_conn();
        let source_id = make_envelope(&conn, "Vacation", 50000);
        let target_id = make_envelope(&conn, "Car", 0);
        let input = BorrowInput {
            source_envelope_id: source_id,
            target_envelope_id: target_id,
            amount_cents: 0,
        };
        let err = borrow_from_envelope_inner(&conn, &input).unwrap_err();
        assert_eq!(err.code, "INVALID_AMOUNT_CENTS");
    }

    #[test]
    fn test_borrow_from_envelope_insufficient_balance() {
        let conn = fresh_conn();
        let source_id = make_envelope(&conn, "Vacation", 5000);
        let target_id = make_envelope(&conn, "Car", 0);
        let input = BorrowInput {
            source_envelope_id: source_id,
            target_envelope_id: target_id,
            amount_cents: 10000,
        };
        let err = borrow_from_envelope_inner(&conn, &input).unwrap_err();
        assert_eq!(err.code, "INSUFFICIENT_BALANCE");
    }

    #[test]
    fn test_borrow_from_envelope_target_not_found() {
        let conn = fresh_conn();
        let source_id = make_envelope(&conn, "Vacation", 50000);
        let input = BorrowInput {
            source_envelope_id: source_id,
            target_envelope_id: 9999,
            amount_cents: 10000,
        };
        let err = borrow_from_envelope_inner(&conn, &input).unwrap_err();
        assert_eq!(err.code, "ENVELOPE_NOT_FOUND");
    }
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
            is_savings: None,
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
            is_savings: None,
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
            is_savings: None,
        };
        let created = create_envelope_inner(&conn, &input).unwrap();

        let update = UpdateEnvelopeInput {
            id: created.id,
            name: Some("Rent Updated".to_string()),
            envelope_type: None,
            priority: None,
            allocated_cents: Some(120000),
            month_id: None,
            is_savings: None,
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
            is_savings: None,
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
            is_savings: None,
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

#[cfg(test)]
mod income_tests {
    use crate::migrations;
    use rusqlite::Connection;
    use super::{CreateIncomeEntryInput};
    use super::{get_income_entries_inner, create_income_entry_inner, delete_income_entry_inner};

    fn fresh_conn() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        migrations::run_migrations(&conn).unwrap();
        conn
    }

    #[test]
    fn test_get_income_entries_empty_on_fresh_db() {
        let conn = fresh_conn();
        let entries = get_income_entries_inner(&conn).unwrap();
        assert!(entries.is_empty(), "fresh DB should have no income entries");
    }

    #[test]
    fn test_create_income_entry_ok() {
        let conn = fresh_conn();
        let input = CreateIncomeEntryInput {
            name: "1st Paycheck".to_string(),
            amount_cents: 250000,
        };
        let entry = create_income_entry_inner(&conn, &input).unwrap();
        assert_eq!(entry.name, "1st Paycheck");
        assert_eq!(entry.amount_cents, 250000);
        assert!(entry.id > 0);
    }

    #[test]
    fn test_create_income_entry_zero_cents_allowed() {
        let conn = fresh_conn();
        let input = CreateIncomeEntryInput {
            name: "Bonus".to_string(),
            amount_cents: 0,
        };
        let entry = create_income_entry_inner(&conn, &input).unwrap();
        assert_eq!(entry.amount_cents, 0);
    }

    #[test]
    fn test_create_income_entry_empty_name_rejected() {
        let conn = fresh_conn();
        let input = CreateIncomeEntryInput {
            name: "   ".to_string(),
            amount_cents: 10000,
        };
        let err = create_income_entry_inner(&conn, &input).unwrap_err();
        assert_eq!(err.code, "INVALID_INCOME_ENTRY_NAME");
    }

    #[test]
    fn test_create_income_entry_negative_cents_rejected() {
        let conn = fresh_conn();
        let input = CreateIncomeEntryInput {
            name: "Bad".to_string(),
            amount_cents: -1,
        };
        let err = create_income_entry_inner(&conn, &input).unwrap_err();
        assert_eq!(err.code, "INVALID_AMOUNT_CENTS");
    }

    #[test]
    fn test_delete_income_entry_ok() {
        let conn = fresh_conn();
        let input = CreateIncomeEntryInput {
            name: "2nd Paycheck".to_string(),
            amount_cents: 250000,
        };
        let entry = create_income_entry_inner(&conn, &input).unwrap();
        delete_income_entry_inner(&conn, entry.id).unwrap();
        let entries = get_income_entries_inner(&conn).unwrap();
        assert!(entries.is_empty());
    }

    #[test]
    fn test_delete_income_entry_not_found() {
        let conn = fresh_conn();
        let err = delete_income_entry_inner(&conn, 9999).unwrap_err();
        assert_eq!(err.code, "ENTRY_NOT_FOUND");
    }
}

#[cfg(test)]
mod allocation_tests {
    use crate::migrations;
    use rusqlite::Connection;
    use super::{CreateEnvelopeInput, AllocationItem, AllocateEnvelopesInput};
    use super::{create_envelope_inner, allocate_envelopes_inner, get_envelopes_inner};

    fn fresh_conn() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        migrations::run_migrations(&conn).unwrap();
        conn
    }

    fn make_envelope(conn: &Connection, name: &str, cents: i64) -> i64 {
        let input = CreateEnvelopeInput {
            name: name.to_string(),
            envelope_type: "Rolling".to_string(),
            priority: "Need".to_string(),
            allocated_cents: cents,
            month_id: None,
            is_savings: None,
        };
        create_envelope_inner(conn, &input).unwrap().id
    }

    #[test]
    fn test_allocate_envelopes_happy_path() {
        let conn = fresh_conn();
        let id1 = make_envelope(&conn, "Groceries", 0);
        let id2 = make_envelope(&conn, "Rent", 0);

        let input = AllocateEnvelopesInput {
            allocations: vec![
                AllocationItem { id: id1, allocated_cents: 50000 },
                AllocationItem { id: id2, allocated_cents: 100000 },
            ],
        };
        let updated = allocate_envelopes_inner(&conn, &input).unwrap();
        assert_eq!(updated.len(), 2);
        let g = updated.iter().find(|e| e.id == id1).unwrap();
        let r = updated.iter().find(|e| e.id == id2).unwrap();
        assert_eq!(g.allocated_cents, 50000);
        assert_eq!(r.allocated_cents, 100000);
    }

    #[test]
    fn test_allocate_envelopes_zero_cents_allowed() {
        let conn = fresh_conn();
        let id = make_envelope(&conn, "Vacation", 5000);
        let input = AllocateEnvelopesInput {
            allocations: vec![AllocationItem { id, allocated_cents: 0 }],
        };
        let updated = allocate_envelopes_inner(&conn, &input).unwrap();
        assert_eq!(updated[0].allocated_cents, 0);
    }

    #[test]
    fn test_allocate_envelopes_negative_cents_rejected() {
        let conn = fresh_conn();
        let id = make_envelope(&conn, "Groceries", 1000);
        let input = AllocateEnvelopesInput {
            allocations: vec![AllocationItem { id, allocated_cents: -1 }],
        };
        let err = allocate_envelopes_inner(&conn, &input).unwrap_err();
        assert_eq!(err.code, "INVALID_ALLOCATED_CENTS");
    }

    #[test]
    fn test_allocate_envelopes_unknown_id_rejected() {
        let conn = fresh_conn();
        let input = AllocateEnvelopesInput {
            allocations: vec![AllocationItem { id: 9999, allocated_cents: 100 }],
        };
        let err = allocate_envelopes_inner(&conn, &input).unwrap_err();
        assert_eq!(err.code, "ENVELOPE_NOT_FOUND");
    }

    #[test]
    fn test_allocate_envelopes_empty_list_ok() {
        let conn = fresh_conn();
        let input = AllocateEnvelopesInput { allocations: vec![] };
        let updated = allocate_envelopes_inner(&conn, &input).unwrap();
        assert!(updated.is_empty());
    }

    #[test]
    fn test_allocate_envelopes_is_atomic_on_error() {
        // If one item fails, none should be committed
        let conn = fresh_conn();
        let id1 = make_envelope(&conn, "Groceries", 0);
        let input = AllocateEnvelopesInput {
            allocations: vec![
                AllocationItem { id: id1, allocated_cents: 50000 },
                AllocationItem { id: 9999, allocated_cents: 10000 }, // bad id
            ],
        };
        let err = allocate_envelopes_inner(&conn, &input).unwrap_err();
        assert_eq!(err.code, "ENVELOPE_NOT_FOUND");

        // Groceries should NOT have been updated (transaction rolled back)
        let envelopes = get_envelopes_inner(&conn).unwrap();
        let groceries = envelopes.iter().find(|e| e.id == id1).unwrap();
        assert_eq!(groceries.allocated_cents, 0, "rollback should restore original value");
    }

    #[test]
    fn test_allocate_envelopes_duplicate_id_rejected() {
        let conn = fresh_conn();
        let id = make_envelope(&conn, "Groceries", 0);
        let input = AllocateEnvelopesInput {
            allocations: vec![
                AllocationItem { id, allocated_cents: 50000 },
                AllocationItem { id, allocated_cents: 99999 }, // duplicate
            ],
        };
        let err = allocate_envelopes_inner(&conn, &input).unwrap_err();
        assert_eq!(err.code, "DUPLICATE_ENVELOPE_ID");
    }
}

// ─── OFX Import ─────────────────────────────────────────────────────────────

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportResult {
    pub count: i64,
    pub batch_id: String,
    pub latest_date: Option<String>,
    pub transactions: Vec<Transaction>,
    pub matched_transactions: Vec<Transaction>,
    /// Maps newly inserted transaction IDs to the matched rule's payee_substring.
    /// Used by the UI to render `-> Groceries via Kroger rule` labels. Not stored in SQLite.
    pub categorized_annotations: std::collections::HashMap<i64, String>,
    /// Newly inserted transaction IDs that matched no stored rule.
    /// Used by Story 4.3's unknown merchant queue. Not stored in SQLite.
    pub uncategorized_ids: Vec<i64>,
    /// Newly inserted transaction IDs that matched more than one stored rule (conflict).
    /// Used by Story 4.1's conflict messaging and Story 4.3's queue. Not stored in SQLite.
    pub conflicted_ids: Vec<i64>,
}

fn generate_batch_id() -> String {
    use std::sync::atomic::{AtomicU64, Ordering};
    use std::time::{SystemTime, UNIX_EPOCH};
    static COUNTER: AtomicU64 = AtomicU64::new(0);
    let seq = COUNTER.fetch_add(1, Ordering::Relaxed);
    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    format!("import_{}_{}", millis, seq)
}

/// Extract the value of an uppercase OFX SGML tag from a block.
/// `upper_block` must be the uppercase copy of `block` (for case-insensitive search).
/// Returns a slice of `block` (original case) trimmed of whitespace.
fn ofx_field<'a>(block: &'a str, upper_block: &str, tag: &str) -> Option<&'a str> {
    let open = format!("<{}>", tag);
    let pos = upper_block.find(&open)? + open.len();
    let rest = &block[pos..];
    let len = rest.find(|c: char| c == '<' || c == '\n' || c == '\r')
        .unwrap_or(rest.len());
    Some(rest[..len].trim())
}

fn ofx_date_to_iso(dtposted: &str) -> Option<String> {
    if dtposted.len() < 8 { return None; }
    let d = &dtposted[..8];
    if !d.chars().all(|c| c.is_ascii_digit()) { return None; }
    Some(format!("{}-{}-{}", &d[..4], &d[4..6], &d[6..8]))
}

fn ofx_amount_to_cents(amount: &str) -> Option<i64> {
    let s = amount.trim();
    let negative = s.starts_with('-');
    let abs = if negative { &s[1..] } else { s };
    let (int_str, frac_str) = match abs.find('.') {
        Some(dot) => (&abs[..dot], &abs[dot + 1..]),
        None => (abs, ""),
    };
    let int_cents: i64 = int_str.parse().ok().map(|n: i64| n * 100)?;
    let frac_padded = format!("{:0<2}", &frac_str[..frac_str.len().min(2)]);
    let frac_cents: i64 = frac_padded.parse().ok()?;
    let result = int_cents + frac_cents;
    Some(if negative { -result } else { result })
}

fn parse_ofx_sgml(content: &str) -> Result<Vec<(String, i64, String)>, AppError> {
    let upper = content.to_uppercase();
    let mut results = Vec::new();
    let mut search_from = 0usize;

    loop {
        let rel_start = match upper[search_from..].find("<STMTTRN>") {
            Some(p) => p,
            None => break,
        };
        let block_start = search_from + rel_start + "<STMTTRN>".len();
        let upper_rest = &upper[block_start..];
        let content_rest = &content[block_start..];

        let close_at = upper_rest.find("</STMTTRN>").unwrap_or(usize::MAX);
        let next_open = upper_rest.find("<STMTTRN>").unwrap_or(usize::MAX);
        let block_end = close_at.min(next_open);

        let (block, upper_block) = if block_end == usize::MAX {
            (content_rest, upper_rest)
        } else {
            (&content_rest[..block_end], &upper_rest[..block_end])
        };

        let payee = ofx_field(block, upper_block, "NAME")
            .or_else(|| ofx_field(block, upper_block, "MEMO"))
            .unwrap_or("")
            .to_string();
        let date = ofx_field(block, upper_block, "DTPOSTED")
            .and_then(ofx_date_to_iso);
        let cents = ofx_field(block, upper_block, "TRNAMT")
            .and_then(ofx_amount_to_cents);

        if let (Some(d), Some(c)) = (date, cents) {
            results.push((payee, c, d));
        }

        if block_end == usize::MAX {
            break;
        }
        search_from = block_start + block_end;
        if close_at < next_open {
            search_from += "</STMTTRN>".len();
        }
    }

    Ok(results)
}

fn read_ofx_file(path: &str) -> Result<String, AppError> {
    let bytes = std::fs::read(path).map_err(|e| AppError {
        code: "OFX_READ_ERROR".to_string(),
        message: format!("Could not read file: {}", e),
    })?;
    // Try UTF-8 first (modern OFX files)
    if let Ok(s) = std::str::from_utf8(&bytes) {
        return Ok(s.to_owned());
    }
    // Fall back to Windows-1252 (common US bank export encoding)
    let (decoded, _, had_errors) = encoding_rs::WINDOWS_1252.decode(&bytes);
    if had_errors {
        return Err(AppError {
            code: "OFX_ENCODING_ERROR".to_string(),
            message: "File encoding is not supported. Try re-exporting your OFX file with UTF-8 or Windows encoding.".to_string(),
        });
    }
    Ok(decoded.into_owned())
}

fn iso_date_to_days(iso: &str) -> Option<i64> {
    if iso.len() < 10 {
        return None;
    }
    let year: i64 = iso[0..4].parse().ok()?;
    let month: i64 = iso[5..7].parse().ok()?;
    let day: i64 = iso[8..10].parse().ok()?;
    // Julian Day Number (Gregorian calendar)
    let a = (14 - month) / 12;
    let y = year + 4800 - a;
    let m = month + 12 * a - 3;
    Some(day + (153 * m + 2) / 5 + 365 * y + y / 4 - y / 100 + y / 400 - 32045)
}

fn date_diff_days(a: &str, b: &str) -> i64 {
    match (iso_date_to_days(a), iso_date_to_days(b)) {
        (Some(da), Some(db)) => (da - db).abs(),
        _ => i64::MAX,
    }
}

fn import_ofx_inner(conn: &rusqlite::Connection, path: &str) -> Result<ImportResult, AppError> {
    let content = read_ofx_file(path)?;
    let parsed = parse_ofx_sgml(&content)?;
    if parsed.is_empty() {
        return Err(AppError {
            code: "OFX_PARSE_ERROR".to_string(),
            message: "No valid transactions found in this file.".to_string(),
        });
    }
    let latest_date = parsed.iter().map(|(_, _, d)| d.as_str()).max().map(String::from);
    let batch_id = generate_batch_id();

    // Load merchant rules once — do not query inside the per-transaction loop.
    let rules = get_merchant_rules_inner(conn)?;

    // Load existing uncleared entries before starting the transaction.
    let uncleared: Vec<Transaction> = {
        let mut stmt = conn.prepare(
            "SELECT id, payee, amount_cents, date, envelope_id, is_cleared, import_batch_id, created_at
             FROM transactions WHERE is_cleared=0",
        )?;
        let rows = stmt.query_map([], map_transaction_row)?.collect::<Result<Vec<_>, _>>()?;
        rows
    };
    let mut matched_ids: std::collections::HashSet<i64> = std::collections::HashSet::new();

    let tx = conn.unchecked_transaction()?;
    let mut transactions = Vec::with_capacity(parsed.len());
    let mut matched_transactions = Vec::new();
    let mut categorized_annotations: std::collections::HashMap<i64, String> =
        std::collections::HashMap::new();
    let mut uncategorized_ids: Vec<i64> = Vec::new();
    let mut conflicted_ids: Vec<i64> = Vec::new();

    for (payee, amount_cents, date) in &parsed {
        // Story 3.4: try to auto-match an existing uncleared entry first.
        let best_candidate = uncleared
            .iter()
            .filter(|t| !matched_ids.contains(&t.id))
            .filter(|t| t.amount_cents == *amount_cents)
            .filter(|t| {
                let imp = payee.to_lowercase();
                let ex = t.payee.to_lowercase();
                !imp.is_empty() && !ex.is_empty() && (imp.contains(&ex) || ex.contains(&imp))
            })
            .filter(|t| date_diff_days(&t.date, date) <= 3)
            .min_by_key(|t| (date_diff_days(&t.date, date), t.id));

        match best_candidate {
            Some(candidate) => {
                // Clear the existing uncleared transaction — no merchant-rule logic applies here.
                tx.execute(
                    "UPDATE transactions SET is_cleared=1, import_batch_id=?1 WHERE id=?2",
                    rusqlite::params![batch_id, candidate.id],
                )?;
                let updated = tx.query_row(
                    "SELECT id, payee, amount_cents, date, envelope_id, is_cleared, import_batch_id, created_at
                     FROM transactions WHERE id=?1",
                    rusqlite::params![candidate.id],
                    map_transaction_row,
                )?;
                matched_ids.insert(candidate.id);
                matched_transactions.push(updated);
            }
            None => {
                // New imported transaction — apply merchant-rule categorization.
                // Collect all rules whose payee_substring appears in the payee (case-insensitive).
                let payee_lower = payee.to_lowercase();
                let matching_rules: Vec<&MerchantRule> = rules
                    .iter()
                    .filter(|r| payee_lower.contains(&r.payee_substring.to_lowercase()))
                    .collect();

                // Exactly one match → assign that envelope; zero or multiple → NULL (no silent choice).
                let envelope_id: Option<i64> = if matching_rules.len() == 1 {
                    Some(matching_rules[0].envelope_id)
                } else {
                    None
                };

                tx.execute(
                    "INSERT INTO transactions (payee, amount_cents, date, envelope_id, is_cleared, import_batch_id)
                     VALUES (?1, ?2, ?3, ?4, 1, ?5)",
                    rusqlite::params![payee, amount_cents, date, envelope_id, batch_id],
                )?;
                let id = tx.last_insert_rowid();

                // When exactly one rule matched: increment its bookkeeping atomically in this same
                // transaction block so the entire import remains all-or-nothing (Story 3.2 guarantee).
                if matching_rules.len() == 1 {
                    let rule = matching_rules[0];
                    tx.execute(
                        "UPDATE merchant_rules \
                         SET match_count = match_count + 1, last_matched_at = datetime('now') \
                         WHERE id = ?1",
                        rusqlite::params![rule.id],
                    )?;
                    categorized_annotations.insert(id, rule.payee_substring.clone());
                } else if matching_rules.len() > 1 {
                    conflicted_ids.push(id);
                } else {
                    uncategorized_ids.push(id);
                }

                let row = tx.query_row(
                    "SELECT id, payee, amount_cents, date, envelope_id, is_cleared, import_batch_id, created_at
                     FROM transactions WHERE id = ?1",
                    rusqlite::params![id],
                    map_transaction_row,
                )?;
                transactions.push(row);
            }
        }
    }
    tx.commit()?;
    Ok(ImportResult {
        count: (transactions.len() + matched_transactions.len()) as i64,
        batch_id,
        latest_date,
        transactions,
        matched_transactions,
        categorized_annotations,
        uncategorized_ids,
        conflicted_ids,
    })
}

#[tauri::command]
pub fn import_ofx(state: State<DbState>, path: String) -> Result<ImportResult, AppError> {
    let ext = std::path::Path::new(&path)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();
    if ext != "ofx" && ext != "qfx" {
        return Err(AppError {
            code: "OFX_INVALID_FILE".to_string(),
            message: "Only .ofx and .qfx files are supported.".to_string(),
        });
    }
    let conn = state.0.lock().map_err(|_| AppError {
        code: "DB_LOCK_POISON".to_string(),
        message: "Database mutex was poisoned.".to_string(),
    })?;
    import_ofx_inner(&conn, &path)
}

#[cfg(test)]
mod import_tests {
    use super::*;
    use crate::migrations;
    use rusqlite::Connection;

    fn fresh_conn() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        migrations::run_migrations(&conn).unwrap();
        conn
    }

    #[test]
    fn test_import_ofx_inner_parses_single_transaction() {
        let conn = fresh_conn();
        let dir = std::env::temp_dir();
        let path = dir.join("test_single.ofx");
        let content = "OFXHEADER:100\n<OFX><STMTTRN>\n<DTPOSTED>20261012120000[0:GMT]\n<TRNAMT>-45.23\n<NAME>KROGER #1234\n</STMTTRN></OFX>";
        std::fs::write(&path, content).unwrap();

        let result = import_ofx_inner(&conn, path.to_str().unwrap()).unwrap();
        assert_eq!(result.count, 1);
        // Format: import_{millis}_{seq}
        let id_parts: Vec<&str> = result.batch_id.splitn(3, '_').collect();
        assert_eq!(id_parts.get(0).copied(), Some("import"), "batch_id must start with 'import'");
        assert!(id_parts.get(1).and_then(|s| s.parse::<u64>().ok()).is_some(), "batch_id second segment must be millis");
        assert!(id_parts.get(2).and_then(|s| s.parse::<u64>().ok()).is_some(), "batch_id third segment must be seq counter");
        assert_eq!(result.latest_date.as_deref(), Some("2026-10-12"));
        assert_eq!(result.transactions.len(), 1);
        let tx = &result.transactions[0];
        assert_eq!(tx.payee, "KROGER #1234");
        assert_eq!(tx.amount_cents, -4523);
        assert_eq!(tx.date, "2026-10-12");
        assert!(tx.is_cleared);
        assert_eq!(tx.import_batch_id.as_deref(), Some(result.batch_id.as_str()));
    }

    #[test]
    fn test_import_ofx_inner_atomic_two_transactions() {
        // Verify that 2 transactions in the same batch both commit successfully
        let conn = fresh_conn();
        let dir = std::env::temp_dir();
        let path = dir.join("test_atomic.ofx");
        let content = "OFXHEADER:100\n<OFX>\
            <STMTTRN>\n<DTPOSTED>20261012\n<TRNAMT>-10.00\n<NAME>Store A\n</STMTTRN>\
            <STMTTRN>\n<DTPOSTED>20261013\n<TRNAMT>-20.00\n<NAME>Store B\n</STMTTRN>\
            </OFX>";
        std::fs::write(&path, content).unwrap();

        let result = import_ofx_inner(&conn, path.to_str().unwrap()).unwrap();
        assert_eq!(result.count, 2);
        let all = get_transactions_inner(&conn, None).unwrap();
        assert_eq!(all.len(), 2);
    }

    #[test]
    fn test_parse_ofx_sgml_extracts_multiple_transactions() {
        let content = "<STMTTRN>\n<DTPOSTED>20261012\n<TRNAMT>-45.23\n<NAME>Store1\n</STMTTRN>\
            <STMTTRN>\n<DTPOSTED>20261013\n<TRNAMT>500.00\n<NAME>Store2\n</STMTTRN>\
            <STMTTRN>\n<DTPOSTED>20261014\n<TRNAMT>-10.00\n<NAME>Store3\n</STMTTRN>";
        let results = parse_ofx_sgml(content).unwrap();
        assert_eq!(results.len(), 3);
        assert_eq!(results[0].0, "Store1");
        assert_eq!(results[1].2, "2026-10-13");
        assert_eq!(results[2].1, -1000);
    }

    #[test]
    fn test_parse_ofx_sgml_returns_empty_for_no_transactions() {
        // Empty content and valid-but-empty OFX both return Ok([]) — not an error
        assert!(parse_ofx_sgml("").unwrap().is_empty());
        assert!(parse_ofx_sgml("<OFX><STMTRS></STMTRS></OFX>").unwrap().is_empty());
    }

    #[test]
    fn test_ofx_date_to_iso_converts_correctly() {
        assert_eq!(ofx_date_to_iso("20261012120000[0:GMT]"), Some("2026-10-12".to_string()));
        assert_eq!(ofx_date_to_iso("20261012"), Some("2026-10-12".to_string()));
        assert_eq!(ofx_date_to_iso("short"), None);
        assert_eq!(ofx_date_to_iso("abcd1234"), None);
    }

    #[test]
    fn test_ofx_amount_to_cents_converts_correctly() {
        assert_eq!(ofx_amount_to_cents("-45.23"), Some(-4523));
        assert_eq!(ofx_amount_to_cents("500.00"), Some(50000));
    }

    #[test]
    fn test_ofx_amount_to_cents_handles_zero() {
        assert_eq!(ofx_amount_to_cents("0.00"), Some(0));
    }

    fn insert_uncleared(conn: &Connection, payee: &str, amount_cents: i64, date: &str) -> i64 {
        conn.execute(
            "INSERT INTO transactions (payee, amount_cents, date, envelope_id, is_cleared, import_batch_id) VALUES (?1, ?2, ?3, NULL, 0, NULL)",
            rusqlite::params![payee, amount_cents, date],
        ).unwrap();
        conn.last_insert_rowid()
    }

    fn make_ofx(entries: &[(&str, &str, &str)]) -> String {
        // entries: (date_compact like "20261012", amount like "-45.23", name)
        let mut body = "OFXHEADER:100\n<OFX>".to_string();
        for (date, amount, name) in entries {
            body.push_str(&format!(
                "<STMTTRN>\n<DTPOSTED>{}\n<TRNAMT>{}\n<NAME>{}\n</STMTTRN>",
                date, amount, name
            ));
        }
        body.push_str("</OFX>");
        body
    }

    #[test]
    fn test_auto_match_clears_existing_uncleared_transaction() {
        let conn = fresh_conn();
        insert_uncleared(&conn, "Kroger", -4523, "2026-10-12");

        let dir = std::env::temp_dir();
        let path = dir.join("test_automatch1.ofx");
        std::fs::write(&path, make_ofx(&[("20261012", "-45.23", "KROGER #0423")])).unwrap();

        let result = import_ofx_inner(&conn, path.to_str().unwrap()).unwrap();

        assert_eq!(result.matched_transactions.len(), 1, "should have 1 matched transaction");
        assert_eq!(result.transactions.len(), 0, "should have 0 new insertions");
        assert_eq!(result.count, 1);

        let matched = &result.matched_transactions[0];
        assert!(matched.is_cleared, "matched tx should be cleared");
        assert!(matched.import_batch_id.is_some(), "matched tx should have import_batch_id set");

        // Verify no duplicate row was inserted
        let count: i64 = conn.query_row("SELECT COUNT(*) FROM transactions", [], |r| r.get(0)).unwrap();
        assert_eq!(count, 1, "only 1 row should exist in DB");
    }

    #[test]
    fn test_auto_match_no_match_inserts_new() {
        let conn = fresh_conn();
        insert_uncleared(&conn, "Kroger", -4523, "2026-10-01");

        let dir = std::env::temp_dir();
        let path = dir.join("test_automatch2.ofx");
        // Different amount — no match
        std::fs::write(&path, make_ofx(&[("20261001", "-10.00", "KROGER #0423")])).unwrap();

        let result = import_ofx_inner(&conn, path.to_str().unwrap()).unwrap();

        assert_eq!(result.transactions.len(), 1, "should have 1 new insertion");
        assert_eq!(result.matched_transactions.len(), 0, "should have 0 matches");
    }

    #[test]
    fn test_auto_match_date_window_3_days() {
        let conn = fresh_conn();
        // 3 days apart — should match
        insert_uncleared(&conn, "Kroger", -4523, "2026-10-09");

        let dir = std::env::temp_dir();
        let path_match = dir.join("test_automatch3a.ofx");
        std::fs::write(&path_match, make_ofx(&[("20261012", "-45.23", "KROGER #0423")])).unwrap();

        let result_match = import_ofx_inner(&conn, path_match.to_str().unwrap()).unwrap();
        assert_eq!(result_match.matched_transactions.len(), 1, "3-day gap should match");
        assert_eq!(result_match.transactions.len(), 0);

        // Now test 4 days apart — should NOT match
        let conn2 = fresh_conn();
        insert_uncleared(&conn2, "Kroger", -4523, "2026-10-09");

        let path_nomatch = dir.join("test_automatch3b.ofx");
        std::fs::write(&path_nomatch, make_ofx(&[("20261013", "-45.23", "KROGER #0423")])).unwrap();

        let result_nomatch = import_ofx_inner(&conn2, path_nomatch.to_str().unwrap()).unwrap();
        assert_eq!(result_nomatch.matched_transactions.len(), 0, "4-day gap should not match");
        assert_eq!(result_nomatch.transactions.len(), 1);
    }

    #[test]
    fn test_auto_match_no_double_match() {
        let conn = fresh_conn();
        // Only 1 uncleared entry
        insert_uncleared(&conn, "Kroger", -4523, "2026-10-12");

        let dir = std::env::temp_dir();
        let path = dir.join("test_automatch4.ofx");
        // 2 OFX transactions both matching the same uncleared entry
        std::fs::write(
            &path,
            make_ofx(&[
                ("20261012", "-45.23", "KROGER #0423"),
                ("20261012", "-45.23", "KROGER #0423"),
            ]),
        ).unwrap();

        let result = import_ofx_inner(&conn, path.to_str().unwrap()).unwrap();

        assert_eq!(result.matched_transactions.len(), 1, "only 1 match allowed");
        assert_eq!(result.transactions.len(), 1, "second should be a new insert");
        assert_eq!(result.count, 2);
    }

    #[test]
    fn test_auto_match_picks_closest_date_candidate() {
        let conn = fresh_conn();
        // 2 uncleared entries: dates 2026-10-10 and 2026-10-11
        let id1 = insert_uncleared(&conn, "Kroger", -4523, "2026-10-10");
        let id2 = insert_uncleared(&conn, "Kroger", -4523, "2026-10-11");

        let dir = std::env::temp_dir();
        let path = dir.join("test_automatch5.ofx");
        // OFX date 2026-10-11 — id2 is closest (0 days), id1 is 1 day away
        std::fs::write(&path, make_ofx(&[("20261011", "-45.23", "KROGER #0423")])).unwrap();

        let result = import_ofx_inner(&conn, path.to_str().unwrap()).unwrap();

        assert_eq!(result.matched_transactions.len(), 1);
        assert_eq!(result.matched_transactions[0].id, id2, "should match the closest date (id2)");
        let _ = id1; // id1 was not matched
    }

    // ── Story 4.2: Merchant-rule categorization tests ────────────────────────

    fn insert_envelope(conn: &Connection, name: &str) -> i64 {
        let input = CreateEnvelopeInput {
            name: name.to_string(),
            envelope_type: "Rolling".to_string(),
            priority: "Need".to_string(),
            allocated_cents: 10000,
            month_id: None,
            is_savings: None,
        };
        create_envelope_inner(conn, &input).unwrap().id
    }

    fn insert_merchant_rule(conn: &Connection, payee_substring: &str, envelope_id: i64) -> i64 {
        let input = CreateMerchantRuleInput {
            payee_substring: payee_substring.to_string(),
            envelope_id,
        };
        create_merchant_rule_inner(conn, &input).unwrap().id
    }

    #[test]
    fn test_merchant_rule_unique_match_categorizes_transaction() {
        let conn = fresh_conn();
        let env_id = insert_envelope(&conn, "Groceries");
        insert_merchant_rule(&conn, "Kroger", env_id);

        let dir = std::env::temp_dir();
        let path = dir.join("test_mr_unique.ofx");
        std::fs::write(&path, make_ofx(&[("20261012", "-45.23", "KROGER #0423")])).unwrap();

        let result = import_ofx_inner(&conn, path.to_str().unwrap()).unwrap();

        assert_eq!(result.transactions.len(), 1);
        let tx = &result.transactions[0];
        assert_eq!(tx.envelope_id, Some(env_id), "unique rule match should set envelope_id");
        assert_eq!(result.categorized_annotations.len(), 1);
        assert_eq!(result.categorized_annotations.get(&tx.id).map(|s| s.as_str()), Some("Kroger"));
        assert!(result.uncategorized_ids.is_empty());
    }

    #[test]
    fn test_merchant_rule_no_match_inserts_null_envelope() {
        let conn = fresh_conn();
        let env_id = insert_envelope(&conn, "Groceries");
        insert_merchant_rule(&conn, "Walmart", env_id); // "Walmart" won't match "KROGER"

        let dir = std::env::temp_dir();
        let path = dir.join("test_mr_nomatch.ofx");
        std::fs::write(&path, make_ofx(&[("20261012", "-45.23", "KROGER #0423")])).unwrap();

        let result = import_ofx_inner(&conn, path.to_str().unwrap()).unwrap();

        assert_eq!(result.transactions.len(), 1);
        let tx = &result.transactions[0];
        assert_eq!(tx.envelope_id, None, "no rule match should leave envelope_id NULL");
        assert!(result.categorized_annotations.is_empty());
        assert_eq!(result.uncategorized_ids, vec![tx.id]);
    }

    #[test]
    fn test_merchant_rule_multiple_matches_inserts_null_envelope() {
        let conn = fresh_conn();
        let env1 = insert_envelope(&conn, "Groceries");
        let env2 = insert_envelope(&conn, "Food");
        insert_merchant_rule(&conn, "Kroger", env1);
        insert_merchant_rule(&conn, "KROGER", env2); // Both match — conflict

        let dir = std::env::temp_dir();
        let path = dir.join("test_mr_conflict.ofx");
        std::fs::write(&path, make_ofx(&[("20261012", "-45.23", "KROGER #0423")])).unwrap();

        let result = import_ofx_inner(&conn, path.to_str().unwrap()).unwrap();

        assert_eq!(result.transactions.len(), 1);
        let tx = &result.transactions[0];
        assert_eq!(tx.envelope_id, None, "conflicting rules should leave envelope_id NULL");
        assert!(result.categorized_annotations.is_empty());
        assert!(result.uncategorized_ids.is_empty(), "conflict should not go to uncategorized_ids");
        assert_eq!(result.conflicted_ids, vec![tx.id]);
    }

    #[test]
    fn test_merchant_rule_match_count_increments_and_last_matched_at_set() {
        let conn = fresh_conn();
        let env_id = insert_envelope(&conn, "Groceries");
        let rule_id = insert_merchant_rule(&conn, "Kroger", env_id);

        // Verify initial match_count is 0 and last_matched_at is NULL
        let rules_before = get_merchant_rules_inner(&conn).unwrap();
        let rule_before = rules_before.iter().find(|r| r.id == rule_id).unwrap();
        assert_eq!(rule_before.match_count, 0);
        assert!(rule_before.last_matched_at.is_none());

        let dir = std::env::temp_dir();
        let path = dir.join("test_mr_count.ofx");
        std::fs::write(&path, make_ofx(&[("20261012", "-45.23", "KROGER #1234")])).unwrap();
        import_ofx_inner(&conn, path.to_str().unwrap()).unwrap();

        let rules_after = get_merchant_rules_inner(&conn).unwrap();
        let rule_after = rules_after.iter().find(|r| r.id == rule_id).unwrap();
        assert_eq!(rule_after.match_count, 1, "match_count should increment to 1 after one import");
        assert!(rule_after.last_matched_at.is_some(), "last_matched_at should be set after match");
    }

    #[test]
    fn test_merchant_rule_auto_match_takes_priority_over_rule_categorization() {
        // When an uncleared transaction matches, merchant rules are NOT applied — the existing
        // uncleared row is cleared instead. This preserves Story 3.4 behavior.
        let conn = fresh_conn();
        let env_id = insert_envelope(&conn, "Groceries");
        let rule_id = insert_merchant_rule(&conn, "Kroger", env_id);
        insert_uncleared(&conn, "Kroger", -4523, "2026-10-12");

        let dir = std::env::temp_dir();
        let path = dir.join("test_mr_automatch_priority.ofx");
        std::fs::write(&path, make_ofx(&[("20261012", "-45.23", "KROGER #0423")])).unwrap();

        let result = import_ofx_inner(&conn, path.to_str().unwrap()).unwrap();

        // Should be a match (Story 3.4), not a new insert
        assert_eq!(result.matched_transactions.len(), 1, "uncleared tx should be auto-matched");
        assert_eq!(result.transactions.len(), 0, "no new insert when auto-match succeeds");
        assert!(result.categorized_annotations.is_empty(), "no annotation on auto-matched rows");
        assert!(result.uncategorized_ids.is_empty());

        // Rule match_count should NOT increment (rules only fire on new inserts)
        let rules = get_merchant_rules_inner(&conn).unwrap();
        let rule = rules.iter().find(|r| r.id == rule_id).unwrap();
        assert_eq!(rule.match_count, 0, "match_count must not increment for auto-matched rows");
    }

    #[test]
    fn test_merchant_rule_import_remains_atomic_across_multiple_transactions() {
        // Both new inserts and rule updates must commit together. Here we verify a two-transaction
        // import where each matches a different rule both succeeds atomically.
        let conn = fresh_conn();
        let env1 = insert_envelope(&conn, "Groceries");
        let env2 = insert_envelope(&conn, "Gas");
        let rule1_id = insert_merchant_rule(&conn, "Kroger", env1);
        let rule2_id = insert_merchant_rule(&conn, "Shell", env2);

        let dir = std::env::temp_dir();
        let path = dir.join("test_mr_atomic_multi.ofx");
        std::fs::write(
            &path,
            make_ofx(&[
                ("20261012", "-45.23", "KROGER #0423"),
                ("20261013", "-30.00", "SHELL STATION"),
            ]),
        )
        .unwrap();

        let result = import_ofx_inner(&conn, path.to_str().unwrap()).unwrap();

        assert_eq!(result.transactions.len(), 2);
        assert_eq!(result.categorized_annotations.len(), 2);

        let rules = get_merchant_rules_inner(&conn).unwrap();
        let r1 = rules.iter().find(|r| r.id == rule1_id).unwrap();
        let r2 = rules.iter().find(|r| r.id == rule2_id).unwrap();
        assert_eq!(r1.match_count, 1, "rule1 match_count should be 1");
        assert_eq!(r2.match_count, 1, "rule2 match_count should be 1");
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

// --- Merchant Rule structs ---

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MerchantRule {
    pub id: i64,
    pub payee_substring: String,          // index 1
    pub envelope_id: i64,                 // index 2 — NOT Option; every rule must have an envelope
    pub version: i64,                     // index 3
    pub created_at: String,               // index 4 — ISO 8601 UTC
    pub last_matched_at: Option<String>,  // index 5 — NULL until first import match
    pub match_count: i64,                 // index 6
}

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateMerchantRuleInput {
    pub payee_substring: String,
    pub envelope_id: i64,
}

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateMerchantRuleInput {
    pub id: i64,
    pub payee_substring: Option<String>,
    pub envelope_id: Option<i64>,
}

// --- Merchant Rule commands ---

fn map_merchant_rule_row(row: &rusqlite::Row) -> rusqlite::Result<MerchantRule> {
    Ok(MerchantRule {
        id: row.get(0)?,
        payee_substring: row.get(1)?,
        envelope_id: row.get(2)?,
        version: row.get(3)?,
        created_at: row.get(4)?,
        last_matched_at: row.get(5)?,
        match_count: row.get(6)?,
    })
}

fn get_merchant_rules_inner(conn: &rusqlite::Connection) -> Result<Vec<MerchantRule>, AppError> {
    let mut stmt = conn.prepare(
        "SELECT id, payee_substring, envelope_id, version, created_at, last_matched_at, match_count \
         FROM merchant_rules ORDER BY match_count DESC, created_at DESC",
    )?;
    let rows = stmt
        .query_map([], map_merchant_rule_row)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(AppError::from)?;
    Ok(rows)
}

#[tauri::command]
pub fn get_merchant_rules(state: State<DbState>) -> Result<Vec<MerchantRule>, AppError> {
    let conn = state.0.lock().map_err(|_| AppError {
        code: "DB_LOCK_POISON".to_string(),
        message: "Database mutex was poisoned.".to_string(),
    })?;
    get_merchant_rules_inner(&conn)
}

fn create_merchant_rule_inner(
    conn: &rusqlite::Connection,
    input: &CreateMerchantRuleInput,
) -> Result<MerchantRule, AppError> {
    if input.payee_substring.trim().is_empty() {
        return Err(AppError {
            code: "INVALID_INPUT".to_string(),
            message: "payee_substring must not be empty or whitespace-only.".to_string(),
        });
    }
    let tx = conn.unchecked_transaction()?;
    tx.execute(
        "INSERT INTO merchant_rules (payee_substring, envelope_id) VALUES (?1, ?2)",
        rusqlite::params![input.payee_substring, input.envelope_id],
    )?;
    let id = tx.last_insert_rowid();
    let row = tx.query_row(
        "SELECT id, payee_substring, envelope_id, version, created_at, last_matched_at, match_count \
         FROM merchant_rules WHERE id = ?1",
        rusqlite::params![id],
        map_merchant_rule_row,
    )?;
    tx.commit()?;
    Ok(row)
}

#[tauri::command]
pub fn create_merchant_rule(
    state: State<DbState>,
    input: CreateMerchantRuleInput,
) -> Result<MerchantRule, AppError> {
    let conn = state.0.lock().map_err(|_| AppError {
        code: "DB_LOCK_POISON".to_string(),
        message: "Database mutex was poisoned.".to_string(),
    })?;
    create_merchant_rule_inner(&conn, &input)
}

fn update_merchant_rule_inner(
    conn: &rusqlite::Connection,
    input: &UpdateMerchantRuleInput,
) -> Result<MerchantRule, AppError> {
    if input.payee_substring.is_none() && input.envelope_id.is_none() {
        return Err(AppError {
            code: "INVALID_INPUT".to_string(),
            message: "At least one field (payee_substring or envelope_id) must be provided.".to_string(),
        });
    }
    if let Some(ref s) = input.payee_substring {
        if s.trim().is_empty() {
            return Err(AppError {
                code: "INVALID_INPUT".to_string(),
                message: "payee_substring must not be empty or whitespace-only.".to_string(),
            });
        }
    }
    let tx = conn.unchecked_transaction()?;
    let affected = tx.execute(
        "UPDATE merchant_rules SET
           payee_substring = COALESCE(?2, payee_substring),
           envelope_id     = COALESCE(?3, envelope_id),
           version         = version + 1
         WHERE id = ?1",
        rusqlite::params![input.id, input.payee_substring, input.envelope_id],
    )?;
    if affected == 0 {
        return Err(AppError {
            code: "RULE_NOT_FOUND".to_string(),
            message: format!("No merchant rule with id {}", input.id),
        });
    }
    let row = tx.query_row(
        "SELECT id, payee_substring, envelope_id, version, created_at, last_matched_at, match_count \
         FROM merchant_rules WHERE id = ?1",
        rusqlite::params![input.id],
        map_merchant_rule_row,
    )?;
    tx.commit()?;
    Ok(row)
}

#[tauri::command]
pub fn update_merchant_rule(
    state: State<DbState>,
    input: UpdateMerchantRuleInput,
) -> Result<MerchantRule, AppError> {
    let conn = state.0.lock().map_err(|_| AppError {
        code: "DB_LOCK_POISON".to_string(),
        message: "Database mutex was poisoned.".to_string(),
    })?;
    update_merchant_rule_inner(&conn, &input)
}

fn delete_merchant_rule_inner(conn: &rusqlite::Connection, id: i64) -> Result<(), AppError> {
    let tx = conn.unchecked_transaction()?;
    let affected = tx.execute(
        "DELETE FROM merchant_rules WHERE id = ?1",
        rusqlite::params![id],
    )?;
    if affected == 0 {
        return Err(AppError {
            code: "RULE_NOT_FOUND".to_string(),
            message: format!("No merchant rule with id {}", id),
        });
    }
    tx.commit()?;
    Ok(())
}

#[tauri::command]
pub fn delete_merchant_rule(state: State<DbState>, id: i64) -> Result<(), AppError> {
    let conn = state.0.lock().map_err(|_| AppError {
        code: "DB_LOCK_POISON".to_string(),
        message: "Database mutex was poisoned.".to_string(),
    })?;
    delete_merchant_rule_inner(&conn, id)
}

// --- Savings reconciliation structs ---

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SavingsReconciliation {
    pub id: i64,
    pub date: String,                           // ISO 8601 "YYYY-MM-DD"
    pub entered_balance_cents: i64,             // user's actual savings balance
    pub previous_tracked_balance_cents: i64,    // app's tracked balance before this reconciliation
    pub delta_cents: i64,                       // entered_balance_cents - previous_tracked_balance_cents
    pub note: Option<String>,                   // nullable user annotation
}

// --- Savings reconciliation commands ---

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SavingsFlowMonth {
    pub month: String,          // "YYYY-MM"
    pub net_flow_cents: i64,    // positive = net deposit; negative = net withdrawal
}

fn map_savings_reconciliation_row(
    row: &rusqlite::Row<'_>,
) -> rusqlite::Result<SavingsReconciliation> {
    Ok(SavingsReconciliation {
        id: row.get(0)?,
        date: row.get(1)?,
        entered_balance_cents: row.get(2)?,
        previous_tracked_balance_cents: row.get(3)?,
        delta_cents: row.get(4)?,
        note: row.get(5)?,
    })
}

fn get_savings_reconciliations_inner(
    conn: &rusqlite::Connection,
) -> Result<Vec<SavingsReconciliation>, AppError> {
    let mut stmt = conn.prepare(
        "SELECT id, date, entered_balance_cents, previous_tracked_balance_cents, delta_cents, note \
         FROM savings_reconciliations ORDER BY date ASC, id ASC",
    )?;
    let rows = stmt
        .query_map([], map_savings_reconciliation_row)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(AppError::from)?;
    Ok(rows)
}

#[tauri::command]
pub fn get_savings_reconciliations(
    state: State<DbState>,
) -> Result<Vec<SavingsReconciliation>, AppError> {
    let conn = state.0.lock().map_err(|_| AppError {
        code: "DB_LOCK_POISON".to_string(),
        message: "Database mutex was poisoned.".to_string(),
    })?;
    get_savings_reconciliations_inner(&conn)
}

fn record_reconciliation_inner(
    conn: &rusqlite::Connection,
    entered_balance_cents: i64,
    note: Option<String>,
) -> Result<SavingsReconciliation, AppError> {
    // Enforce sign convention: reconciliation balance must be non-negative
    if entered_balance_cents < 0 {
        return Err(AppError {
            code: "INVALID_ENTERED_BALANCE".to_string(),
            message: "entered_balance_cents must be >= 0.".to_string(),
        });
    }

    let tx = conn.unchecked_transaction()?;

    // Fetch most recent reconciliation date and balance (0/'0000-00-00' if no prior reconciliations)
    let (prev_date, prev_balance): (String, i64) = match tx.query_row(
        "SELECT date, entered_balance_cents FROM savings_reconciliations ORDER BY date DESC, id DESC LIMIT 1",
        [],
        |row| Ok((row.get(0)?, row.get(1)?)),
    ) {
        Ok(row) => row,
        Err(rusqlite::Error::QueryReturnedNoRows) => ("0000-00-00".to_string(), 0),
        Err(e) => return Err(AppError::from(e)),
    };

    // Sum savings transaction deltas since last reconciliation date (inclusive — matches frontend)
    let tx_delta: i64 = tx
        .query_row(
            "SELECT COALESCE(SUM(-t.amount_cents), 0) FROM transactions t \
             JOIN envelopes e ON t.envelope_id = e.id \
             WHERE e.is_savings = 1 AND t.date >= ?1",
            rusqlite::params![prev_date],
            |row| row.get(0),
        )?;

    let previous_tracked_balance_cents = prev_balance + tx_delta;
    let delta_cents = entered_balance_cents - previous_tracked_balance_cents;

    tx.execute(
        "INSERT INTO savings_reconciliations \
         (date, entered_balance_cents, previous_tracked_balance_cents, delta_cents, note) \
         VALUES (date('now'), ?1, ?2, ?3, ?4)",
        rusqlite::params![entered_balance_cents, previous_tracked_balance_cents, delta_cents, note],
    )?;

    let id = tx.last_insert_rowid();
    let row = tx.query_row(
        "SELECT id, date, entered_balance_cents, previous_tracked_balance_cents, delta_cents, note \
         FROM savings_reconciliations WHERE id = ?1",
        rusqlite::params![id],
        map_savings_reconciliation_row,
    )?;

    tx.commit()?;
    Ok(row)
}

#[tauri::command]
pub fn record_reconciliation(
    state: State<DbState>,
    entered_balance_cents: i64,
    note: Option<String>,
) -> Result<SavingsReconciliation, AppError> {
    let conn = state.0.lock().map_err(|_| AppError {
        code: "DB_LOCK_POISON".to_string(),
        message: "Database mutex was poisoned.".to_string(),
    })?;
    record_reconciliation_inner(&conn, entered_balance_cents, note)
}

fn get_savings_transactions_since_inner(
    conn: &rusqlite::Connection,
    since_date: &str,
) -> Result<Vec<Transaction>, AppError> {
    let mut stmt = conn.prepare(
        "SELECT t.id, t.payee, t.amount_cents, t.date, t.envelope_id, \
         t.is_cleared, t.import_batch_id, t.created_at \
         FROM transactions t \
         JOIN envelopes e ON t.envelope_id = e.id \
         WHERE e.is_savings = 1 AND t.date >= ?1 \
         ORDER BY t.date ASC",
    )?;
    let rows = stmt
        .query_map(rusqlite::params![since_date], map_transaction_row)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(AppError::from)?;
    Ok(rows)
}

#[tauri::command]
pub fn get_savings_transactions_since(
    state: State<DbState>,
    since_date: String,
) -> Result<Vec<Transaction>, AppError> {
    let conn = state.0.lock().map_err(|_| AppError {
        code: "DB_LOCK_POISON".to_string(),
        message: "Database mutex was poisoned.".to_string(),
    })?;
    get_savings_transactions_since_inner(&conn, &since_date)
}

fn get_avg_monthly_essential_spend_cents_inner(
    conn: &rusqlite::Connection,
) -> Result<i64, AppError> {
    let avg: i64 = conn.query_row(
        "SELECT CAST(COALESCE(AVG(monthly_spend_cents), 0) AS INTEGER) \
         FROM ( \
           SELECT strftime('%Y-%m', t.date) AS month, \
                  SUM(-t.amount_cents) AS monthly_spend_cents \
           FROM transactions t \
           JOIN envelopes e ON t.envelope_id = e.id \
           WHERE e.priority = 'Need' AND e.is_savings = 0 \
           GROUP BY strftime('%Y-%m', t.date) \
           HAVING SUM(-t.amount_cents) > 0 \
         )",
        [],
        |row| row.get(0),
    )?;
    Ok(avg)
}

#[tauri::command]
pub fn get_avg_monthly_essential_spend_cents(
    state: State<DbState>,
) -> Result<i64, AppError> {
    let conn = state.0.lock().map_err(|_| AppError {
        code: "DB_LOCK_POISON".to_string(),
        message: "Database mutex was poisoned.".to_string(),
    })?;
    get_avg_monthly_essential_spend_cents_inner(&conn)
}

fn get_savings_flow_by_month_inner(
    conn: &rusqlite::Connection,
) -> Result<Vec<SavingsFlowMonth>, AppError> {
    // Returns monthly net savings flow for the last 6 calendar months (inclusive of current).
    // Sign: SUM(-amount_cents) → positive = deposit to savings (money going in).
    // date filter: first day of the month 5 months ago → covers 6 months total.
    let mut stmt = conn.prepare(
        "SELECT strftime('%Y-%m', t.date) AS month, \
                SUM(-t.amount_cents) AS net_flow_cents \
         FROM transactions t \
         JOIN envelopes e ON t.envelope_id = e.id \
         WHERE e.is_savings = 1 \
           AND t.date >= date('now', 'start of month', '-5 months') \
         GROUP BY strftime('%Y-%m', t.date) \
         ORDER BY month ASC",
    )?;
    let rows = stmt
        .query_map([], |row| {
            Ok(SavingsFlowMonth {
                month: row.get(0)?,
                net_flow_cents: row.get(1)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()
        .map_err(AppError::from)?;
    Ok(rows)
}

#[tauri::command]
pub fn get_savings_flow_by_month(
    state: State<DbState>,
) -> Result<Vec<SavingsFlowMonth>, AppError> {
    let conn = state.0.lock().map_err(|_| AppError {
        code: "DB_LOCK_POISON".to_string(),
        message: "Database mutex was poisoned.".to_string(),
    })?;
    get_savings_flow_by_month_inner(&conn)
}

// ─── Month lifecycle structs ───────────────────────────────────────────────

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Month {
    pub id: i64,
    pub year: i64,
    pub month: i64,
    pub status: String,
    pub opened_at: String,
    pub closed_at: Option<String>,
}

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AdvanceTurnTheMonthStepInput {
    pub month_id: i64,
    pub current_step: i64,
}

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CloseMonthInput {
    pub month_id: i64,
    pub allocations: Vec<AllocationItem>,
}

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BeginTurnTheMonthInput {
    pub month_id: i64,
}

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CloseoutSummaryInput {
    pub month_id: i64,
}

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CloseoutSummary {
    /// Sum of allocated_cents for all non-savings envelopes.
    pub total_allocated_cents: i64,
    /// Net spend for non-savings envelopes in the closing month.
    /// SUM(-amount_cents) for transactions in month date range — positive = money spent.
    /// Can be negative if refunds exceed charges (rare, but valid).
    pub total_spent_cents: i64,
    /// true when total_spent_cents <= total_allocated_cents.
    pub stayed_in_budget: bool,
    /// max(0, total_spent_cents - total_allocated_cents). 0 when in budget.
    pub overspend_cents: i64,
    /// Net savings flow for the month: SUM(-amount_cents) for savings envelope transactions.
    /// Positive = deposit (money going into savings), negative = withdrawal.
    pub savings_flow_cents: i64,
    /// Name of the first envelope found to be over budget 2+ consecutive months, if any.
    pub drift_envelope_name: Option<String>,
}

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BillDateSuggestion {
    /// Envelope id
    pub envelope_id: i64,
    /// Envelope display name
    pub envelope_name: String,
    /// Day of month the bill is due (1–31), or None if no record in bill_due_dates
    pub due_day: Option<i32>,
}

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BillDateEntry {
    pub envelope_id: i64,
    /// Some(day) → upsert; None → delete existing record for this envelope
    pub due_day: Option<i32>,
}

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConfirmBillDatesInput {
    pub month_id: i64,
    /// Full list of Bill envelopes with their new or unchanged due days
    pub dates: Vec<BillDateEntry>,
}

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IncomeTimingSuggestion {
    /// ISO 'YYYY-MM-DD' date in the NEW (upcoming) month
    pub pay_date: String,
    /// Expected income amount in cents for this pay date
    pub amount_cents: i64,
    /// Optional label (e.g., "Paycheck 1", "Paycheck 2")
    pub label: Option<String>,
}

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IncomeTimingEntry {
    pub pay_date: String,
    pub amount_cents: i64,
    pub label: Option<String>,
}

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConfirmIncomeTimingInput {
    pub month_id: i64,
    /// Full list of pay dates for the new month (may be empty if no income configured)
    pub entries: Vec<IncomeTimingEntry>,
}

fn days_in_month(year: i32, month: i32) -> i32 {
    match month {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 => {
            // Leap year: divisible by 4, except centuries unless divisible by 400
            if year % 400 == 0 || (year % 4 == 0 && year % 100 != 0) { 29 } else { 28 }
        }
        _ => 31,
    }
}

fn row_to_month(row: &rusqlite::Row<'_>) -> rusqlite::Result<Month> {
    Ok(Month {
        id: row.get(0)?,
        year: row.get(1)?,
        month: row.get(2)?,
        status: row.get(3)?,
        opened_at: row.get(4)?,
        closed_at: row.get(5)?,
    })
}

fn get_current_month_inner(conn: &rusqlite::Connection) -> Result<Option<Month>, AppError> {
    // "Current" = the most recently opened month that is not closed.
    let result = conn.query_row(
        "SELECT id, year, month, status, opened_at, closed_at \
         FROM months \
         WHERE status != 'closed' \
         ORDER BY year DESC, month DESC \
         LIMIT 1",
        [],
        row_to_month,
    );
    match result {
        Ok(m) => Ok(Some(m)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(AppError::from(e)),
    }
}

#[tauri::command]
pub fn get_current_month(state: State<DbState>) -> Result<Option<Month>, AppError> {
    let conn = state.0.lock().map_err(|_| AppError {
        code: "DB_LOCK_POISON".to_string(),
        message: "Database mutex was poisoned.".to_string(),
    })?;
    get_current_month_inner(&conn)
}

fn open_month_inner(conn: &rusqlite::Connection) -> Result<Month, AppError> {
    // Determine year/month from today's date.
    let today: String = conn.query_row(
        "SELECT date('now')",
        [],
        |row| row.get(0),
    )?;
    let parts: Vec<&str> = today.splitn(3, '-').collect();
    if parts.len() < 2 {
        return Err(AppError {
            code: "INVALID_DATE".to_string(),
            message: format!("Unexpected date format from SQLite: {}", today),
        });
    }
    let year: i64 = parts[0].parse().map_err(|_| AppError {
        code: "INVALID_DATE".to_string(),
        message: "Could not parse year from SQLite date".to_string(),
    })?;
    let month: i64 = parts[1].parse().map_err(|_| AppError {
        code: "INVALID_DATE".to_string(),
        message: "Could not parse month from SQLite date".to_string(),
    })?;

    let tx = conn.unchecked_transaction()?;
    tx.execute(
        "INSERT OR IGNORE INTO months (year, month, status) VALUES (?1, ?2, 'open')",
        rusqlite::params![year, month],
    )?;
    // Use year/month lookup (not last_insert_rowid) to handle OR IGNORE case
    let m = tx.query_row(
        "SELECT id, year, month, status, opened_at, closed_at FROM months WHERE year = ?1 AND month = ?2",
        rusqlite::params![year, month],
        row_to_month,
    )?;
    tx.commit()?;
    Ok(m)
}

#[tauri::command]
pub fn open_month(state: State<DbState>) -> Result<Month, AppError> {
    let conn = state.0.lock().map_err(|_| AppError {
        code: "DB_LOCK_POISON".to_string(),
        message: "Database mutex was poisoned.".to_string(),
    })?;
    open_month_inner(&conn)
}

fn advance_turn_the_month_step_inner(
    conn: &rusqlite::Connection,
    input: &AdvanceTurnTheMonthStepInput,
) -> Result<Month, AppError> {
    // Guard: only steps 1–3 may advance; step 4 must use close_month instead
    if input.current_step >= 4 {
        return Err(AppError {
            code: "INVALID_STEP_TRANSITION".to_string(),
            message: format!(
                "Step {} cannot be advanced — step 4 must be completed via close_month.",
                input.current_step
            ),
        });
    }

    let expected_status = format!("closing:step-{}", input.current_step);
    let next_status = format!("closing:step-{}", input.current_step + 1);

    let tx = conn.unchecked_transaction()?;

    // Verify current status matches expected — prevents double-advance
    let current: String = tx.query_row(
        "SELECT status FROM months WHERE id = ?1",
        rusqlite::params![input.month_id],
        |row| row.get(0),
    ).map_err(|e| match e {
        rusqlite::Error::QueryReturnedNoRows => AppError {
            code: "MONTH_NOT_FOUND".to_string(),
            message: format!("No month found with id {}", input.month_id),
        },
        other => AppError::from(other),
    })?;

    if current != expected_status {
        return Err(AppError {
            code: "INVALID_STEP_TRANSITION".to_string(),
            message: format!(
                "Expected status '{}' but found '{}'. Step may have already advanced.",
                expected_status, current
            ),
        });
    }

    tx.execute(
        "UPDATE months SET status = ?1 WHERE id = ?2",
        rusqlite::params![next_status, input.month_id],
    )?;
    let m = tx.query_row(
        "SELECT id, year, month, status, opened_at, closed_at FROM months WHERE id = ?1",
        rusqlite::params![input.month_id],
        row_to_month,
    )?;
    tx.commit()?;
    Ok(m)
}

#[tauri::command]
pub fn advance_turn_the_month_step(
    state: State<DbState>,
    input: AdvanceTurnTheMonthStepInput,
) -> Result<Month, AppError> {
    let conn = state.0.lock().map_err(|_| AppError {
        code: "DB_LOCK_POISON".to_string(),
        message: "Database mutex was poisoned.".to_string(),
    })?;
    advance_turn_the_month_step_inner(&conn, &input)
}

fn close_month_inner(conn: &rusqlite::Connection, input: &CloseMonthInput) -> Result<Month, AppError> {
    // Fetch current month's year, month, and status for validation
    let (curr_year, curr_month, curr_status): (i64, i64, String) = conn.query_row(
        "SELECT year, month, status FROM months WHERE id = ?1",
        rusqlite::params![input.month_id],
        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
    ).map_err(|e| match e {
        rusqlite::Error::QueryReturnedNoRows => AppError {
            code: "MONTH_NOT_FOUND".to_string(),
            message: format!("No month found with id {}", input.month_id),
        },
        other => AppError::from(other),
    })?;

    // Enforce state machine: close_month is only valid from closing:step-4
    if curr_status != "closing:step-4" {
        return Err(AppError {
            code: "INVALID_STATUS_FOR_CLOSE".to_string(),
            message: format!(
                "Month {} cannot be closed from status '{}'. Must be in closing:step-4 state.",
                input.month_id, curr_status
            ),
        });
    }

    let (next_year, next_month) = if curr_month == 12 {
        (curr_year + 1, 1i64)
    } else {
        (curr_year, curr_month + 1)
    };

    let tx = conn.unchecked_transaction()?;

    // 1. Mark current month closed
    tx.execute(
        "UPDATE months SET status = 'closed', closed_at = datetime('now') WHERE id = ?1",
        rusqlite::params![input.month_id],
    )?;

    // 2. Create next month record (INSERT OR IGNORE — idempotent if already exists)
    tx.execute(
        "INSERT OR IGNORE INTO months (year, month, status) VALUES (?1, ?2, 'open')",
        rusqlite::params![next_year, next_month],
    )?;

    // 3. Reset envelope allocations per type rules:
    //    Rolling envelopes → 0 (re-allocated each month in guided fill)
    //    Bill and Goal envelopes → preserve allocated_cents (recurring fixed costs/goals)
    tx.execute(
        "UPDATE envelopes SET allocated_cents = 0 WHERE type = 'Rolling'",
        [],
    )?;

    // 4. Apply guided-fill allocations from input (committed atomically with close)
    for item in &input.allocations {
        tx.execute(
            "UPDATE envelopes SET allocated_cents = ?2 WHERE id = ?1",
            rusqlite::params![item.id, item.allocated_cents],
        )?;
        if tx.changes() == 0 {
            return Err(AppError {
                code: "ENVELOPE_NOT_FOUND".to_string(),
                message: format!("No envelope found with id {}", item.id),
            });
        }
    }

    // 5. Return the new open month (query by year/month — handles OR IGNORE case)
    let new_month = tx.query_row(
        "SELECT id, year, month, status, opened_at, closed_at FROM months WHERE year = ?1 AND month = ?2",
        rusqlite::params![next_year, next_month],
        row_to_month,
    )?;
    tx.commit()?;
    Ok(new_month)
}

#[tauri::command]
pub fn close_month(
    state: State<DbState>,
    input: CloseMonthInput,
) -> Result<Month, AppError> {
    let conn = state.0.lock().map_err(|_| AppError {
        code: "DB_LOCK_POISON".to_string(),
        message: "Database mutex was poisoned.".to_string(),
    })?;
    close_month_inner(&conn, &input)
}

fn begin_turn_the_month_inner(
    conn: &rusqlite::Connection,
    input: &BeginTurnTheMonthInput,
) -> Result<Month, AppError> {
    // Fetch the month record
    let month = conn.query_row(
        "SELECT id, year, month, status, opened_at, closed_at FROM months WHERE id = ?1",
        rusqlite::params![input.month_id],
        row_to_month,
    ).map_err(|e| match e {
        rusqlite::Error::QueryReturnedNoRows => AppError {
            code: "MONTH_NOT_FOUND".to_string(),
            message: format!("No month found with id {}", input.month_id),
        },
        other => AppError::from(other),
    })?;

    // If already closing or closed, return as-is (idempotent)
    if month.status != "open" {
        return Ok(month);
    }

    // Check if calendar date has passed the end of this month.
    // Compare (today_year * 12 + today_month) > (record_year * 12 + record_month)
    let past_end: bool = conn.query_row(
        "SELECT (CAST(strftime('%Y', 'now') AS INTEGER) * 12 + \
                 CAST(strftime('%m', 'now') AS INTEGER)) > (?1 * 12 + ?2)",
        rusqlite::params![month.year, month.month],
        |row| row.get(0),
    )?;

    if !past_end {
        // Still within the month — return open month unchanged
        return Ok(month);
    }

    // Past month end — transition open → closing:step-1 atomically
    let tx = conn.unchecked_transaction()?;
    tx.execute(
        "UPDATE months SET status = 'closing:step-1' WHERE id = ?1 AND status = 'open'",
        rusqlite::params![input.month_id],
    )?;
    let updated = tx.query_row(
        "SELECT id, year, month, status, opened_at, closed_at FROM months WHERE id = ?1",
        rusqlite::params![input.month_id],
        row_to_month,
    )?;
    tx.commit()?;
    Ok(updated)
}

#[tauri::command]
pub fn begin_turn_the_month(
    state: State<DbState>,
    input: BeginTurnTheMonthInput,
) -> Result<Month, AppError> {
    let conn = state.0.lock().map_err(|_| AppError {
        code: "DB_LOCK_POISON".to_string(),
        message: "Database mutex was poisoned.".to_string(),
    })?;
    begin_turn_the_month_inner(&conn, &input)
}

fn get_closeout_summary_inner(
    conn: &rusqlite::Connection,
    input: &CloseoutSummaryInput,
) -> Result<CloseoutSummary, AppError> {
    // Fetch month record
    let (year, month): (i64, i64) = conn.query_row(
        "SELECT year, month FROM months WHERE id = ?1",
        rusqlite::params![input.month_id],
        |row| Ok((row.get(0)?, row.get(1)?)),
    ).map_err(|e| match e {
        rusqlite::Error::QueryReturnedNoRows => AppError {
            code: "MONTH_NOT_FOUND".to_string(),
            message: format!("No month found with id {}", input.month_id),
        },
        other => AppError::from(other),
    })?;

    // Compute date range strings for the closing month
    let curr_start = format!("{:04}-{:02}-01", year, month);
    let (next_year, next_month) = if month == 12 { (year + 1, 1i64) } else { (year, month + 1) };
    let next_start = format!("{:04}-{:02}-01", next_year, next_month);
    let (prev_year, prev_month) = if month == 1 { (year - 1, 12i64) } else { (year, month - 1) };
    let prev_start = format!("{:04}-{:02}-01", prev_year, prev_month);

    // Budget: total allocated for non-savings envelopes
    let total_allocated_cents: i64 = conn.query_row(
        "SELECT COALESCE(SUM(allocated_cents), 0) FROM envelopes WHERE is_savings = 0",
        [],
        |row| row.get(0),
    )?;

    // Budget: total spent (non-savings) in closing month.
    // SUM(-amount_cents): expenses have negative amount_cents → positive spend.
    let total_spent_cents: i64 = conn.query_row(
        "SELECT COALESCE(SUM(-t.amount_cents), 0) \
         FROM transactions t \
         JOIN envelopes e ON t.envelope_id = e.id \
         WHERE e.is_savings = 0 \
           AND t.date >= ?1 AND t.date < ?2",
        rusqlite::params![curr_start, next_start],
        |row| row.get(0),
    )?;

    let stayed_in_budget = total_spent_cents <= total_allocated_cents;
    let overspend_cents = if stayed_in_budget { 0 } else { total_spent_cents - total_allocated_cents };

    // Savings flow for closing month: SUM(-amount_cents) for savings envelope.
    // Positive = deposit (money entering savings account).
    let savings_flow_cents: i64 = conn.query_row(
        "SELECT COALESCE(SUM(-t.amount_cents), 0) \
         FROM transactions t \
         JOIN envelopes e ON t.envelope_id = e.id \
         WHERE e.is_savings = 1 \
           AND t.date >= ?1 AND t.date < ?2",
        rusqlite::params![curr_start, next_start],
        |row| row.get(0),
    )?;

    // Drift detection: first non-savings envelope over budget in BOTH the closing month
    // and the prior month. Only considers envelopes with allocated_cents > 0.
    let drift_envelope_name: Option<String> = conn.query_row(
        "WITH curr AS ( \
           SELECT t.envelope_id, COALESCE(SUM(-t.amount_cents), 0) AS spent \
           FROM transactions t \
           WHERE t.date >= ?1 AND t.date < ?2 \
             AND t.amount_cents < 0 \
           GROUP BY t.envelope_id \
         ), \
         prev AS ( \
           SELECT t.envelope_id, COALESCE(SUM(-t.amount_cents), 0) AS spent \
           FROM transactions t \
           WHERE t.date >= ?3 AND t.date < ?1 \
             AND t.amount_cents < 0 \
           GROUP BY t.envelope_id \
         ) \
         SELECT e.name \
         FROM envelopes e \
         LEFT JOIN curr c ON e.id = c.envelope_id \
         LEFT JOIN prev p ON e.id = p.envelope_id \
         WHERE e.is_savings = 0 \
           AND e.allocated_cents > 0 \
           AND COALESCE(c.spent, 0) > e.allocated_cents \
           AND COALESCE(p.spent, 0) > e.allocated_cents \
         ORDER BY e.name ASC \
         LIMIT 1",
        rusqlite::params![curr_start, next_start, prev_start],
        |row| row.get(0),
    ).optional()?;

    Ok(CloseoutSummary {
        total_allocated_cents,
        total_spent_cents,
        stayed_in_budget,
        overspend_cents,
        savings_flow_cents,
        drift_envelope_name,
    })
}

#[tauri::command]
pub fn get_closeout_summary(
    state: State<DbState>,
    input: CloseoutSummaryInput,
) -> Result<CloseoutSummary, AppError> {
    let conn = state.0.lock().map_err(|_| AppError {
        code: "DB_LOCK_POISON".to_string(),
        message: "Database mutex was poisoned.".to_string(),
    })?;
    get_closeout_summary_inner(&conn, &input)
}

fn get_bill_date_suggestions_inner(
    conn: &rusqlite::Connection,
) -> Result<Vec<BillDateSuggestion>, AppError> {
    let mut stmt = conn.prepare(
        "SELECT e.id, e.name, b.due_day \
         FROM envelopes e \
         LEFT JOIN bill_due_dates b ON e.id = b.envelope_id \
         WHERE e.type = 'Bill' AND e.is_savings = 0 \
         ORDER BY e.name ASC",
    )?;
    let rows = stmt.query_map([], |row| {
        Ok(BillDateSuggestion {
            envelope_id: row.get(0)?,
            envelope_name: row.get(1)?,
            due_day: row.get(2)?,
        })
    })?;
    let mut result = Vec::new();
    for row in rows {
        result.push(row?);
    }
    Ok(result)
}

#[tauri::command]
pub fn get_bill_date_suggestions(
    state: State<DbState>,
) -> Result<Vec<BillDateSuggestion>, AppError> {
    let conn = state.0.lock().map_err(|_| AppError {
        code: "DB_LOCK_POISON".to_string(),
        message: "Database mutex was poisoned.".to_string(),
    })?;
    get_bill_date_suggestions_inner(&conn)
}

fn confirm_bill_dates_inner(
    conn: &rusqlite::Connection,
    input: &ConfirmBillDatesInput,
) -> Result<Month, AppError> {
    let expected_status = "closing:step-2";
    let next_status = "closing:step-3";

    let tx = conn.unchecked_transaction()?;

    // Guard: verify month is at closing:step-2
    let current: String = tx.query_row(
        "SELECT status FROM months WHERE id = ?1",
        rusqlite::params![input.month_id],
        |row| row.get(0),
    ).map_err(|e| match e {
        rusqlite::Error::QueryReturnedNoRows => AppError {
            code: "MONTH_NOT_FOUND".to_string(),
            message: format!("No month found with id {}", input.month_id),
        },
        other => AppError::from(other),
    })?;

    if current != expected_status {
        return Err(AppError {
            code: "INVALID_STEP_TRANSITION".to_string(),
            message: format!(
                "Expected status '{}' but found '{}'. Step may have already advanced.",
                expected_status, current
            ),
        });
    }

    // Upsert or delete each bill due date entry
    for entry in &input.dates {
        match entry.due_day {
            Some(day) => {
                tx.execute(
                    "INSERT INTO bill_due_dates (envelope_id, due_day, updated_at) \
                     VALUES (?1, ?2, datetime('now')) \
                     ON CONFLICT(envelope_id) DO UPDATE SET \
                       due_day = excluded.due_day, \
                       updated_at = excluded.updated_at",
                    rusqlite::params![entry.envelope_id, day],
                )?;
            }
            None => {
                tx.execute(
                    "DELETE FROM bill_due_dates WHERE envelope_id = ?1",
                    rusqlite::params![entry.envelope_id],
                )?;
            }
        }
    }

    // Advance step 2 → 3 atomically
    tx.execute(
        "UPDATE months SET status = ?1 WHERE id = ?2",
        rusqlite::params![next_status, input.month_id],
    )?;

    let m = tx.query_row(
        "SELECT id, year, month, status, opened_at, closed_at FROM months WHERE id = ?1",
        rusqlite::params![input.month_id],
        row_to_month,
    )?;
    tx.commit()?;
    Ok(m)
}

#[tauri::command]
pub fn confirm_bill_dates(
    state: State<DbState>,
    input: ConfirmBillDatesInput,
) -> Result<Month, AppError> {
    let conn = state.0.lock().map_err(|_| AppError {
        code: "DB_LOCK_POISON".to_string(),
        message: "Database mutex was poisoned.".to_string(),
    })?;
    confirm_bill_dates_inner(&conn, &input)
}

fn get_income_timing_suggestions_inner(
    conn: &rusqlite::Connection,
    month_id: i64,
) -> Result<Vec<IncomeTimingSuggestion>, AppError> {
    use rusqlite::OptionalExtension;

    // If timing already confirmed for this month, return stored values
    let count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM month_income_timing WHERE month_id = ?1",
        rusqlite::params![month_id],
        |row| row.get(0),
    )?;
    if count > 0 {
        let mut stmt = conn.prepare(
            "SELECT pay_date, amount_cents, label FROM month_income_timing \
             WHERE month_id = ?1 ORDER BY pay_date ASC",
        )?;
        let rows = stmt.query_map(rusqlite::params![month_id], |row| {
            Ok(IncomeTimingSuggestion {
                pay_date: row.get(0)?,
                amount_cents: row.get(1)?,
                label: row.get(2)?,
            })
        })?;
        let mut result = Vec::new();
        for row in rows { result.push(row?); }
        return Ok(result);
    }

    // No stored timing yet — derive suggestions from settings + income_entries
    // Get current month year/month to compute NEW month
    let (curr_year, curr_month): (i32, i32) = conn.query_row(
        "SELECT year, month FROM months WHERE id = ?1",
        rusqlite::params![month_id],
        |row| Ok((row.get(0)?, row.get(1)?)),
    ).map_err(|e| match e {
        rusqlite::Error::QueryReturnedNoRows => AppError {
            code: "MONTH_NOT_FOUND".to_string(),
            message: format!("No month found with id {}", month_id),
        },
        other => AppError::from(other),
    })?;

    let (new_year, new_month) = if curr_month == 12 {
        (curr_year + 1, 1i32)
    } else {
        (curr_year, curr_month + 1)
    };

    // Get settings pay_frequency and pay_dates
    let settings_row: Option<(Option<String>, Option<String>)> = conn.query_row(
        "SELECT pay_frequency, pay_dates FROM settings WHERE id = 1",
        [],
        |row| Ok((row.get(0)?, row.get(1)?)),
    ).optional()?;

    let (pay_frequency, pay_dates_json) = match settings_row {
        Some((freq, dates)) => (freq, dates),
        None => (None, None),
    };

    // Parse pay_dates JSON — expected format: ["1", "15"] (day-of-month numbers)
    // Sorted ascending so suggestions always appear in calendar order and the
    // remainder cent is consistently assigned to the last calendar pay date.
    let mut pay_days: Vec<i32> = match pay_dates_json {
        Some(ref json) => {
            serde_json::from_str::<Vec<String>>(json)
                .unwrap_or_default()
                .iter()
                .filter_map(|s| s.parse::<i32>().ok())
                .collect()
        }
        None => vec![],
    };
    pay_days.sort_unstable();

    if pay_days.is_empty() || pay_frequency.is_none() {
        return Ok(vec![]);
    }

    // Get total income from income_entries
    let total_income: i64 = conn.query_row(
        "SELECT COALESCE(SUM(amount_cents), 0) FROM income_entries",
        [],
        |row| row.get(0),
    )?;

    let max_day = days_in_month(new_year, new_month);
    let n = pay_days.len() as i64;
    let per_pay = if n > 0 { total_income / n } else { 0 };
    let remainder = if n > 0 { total_income % n } else { 0 };

    let mut suggestions = Vec::new();
    for (i, &day) in pay_days.iter().enumerate() {
        let clamped = day.min(max_day).max(1);
        let pay_date = format!(
            "{:04}-{:02}-{:02}",
            new_year, new_month, clamped
        );
        let label = if pay_days.len() > 1 {
            Some(format!("Paycheck {}", i + 1))
        } else {
            None
        };
        // Last pay date gets any remainder cents
        let amount = if i == pay_days.len() - 1 {
            per_pay + remainder
        } else {
            per_pay
        };
        suggestions.push(IncomeTimingSuggestion { pay_date, amount_cents: amount, label });
    }
    Ok(suggestions)
}

#[tauri::command]
pub fn get_income_timing_suggestions(
    state: State<DbState>,
    month_id: i64,
) -> Result<Vec<IncomeTimingSuggestion>, AppError> {
    let conn = state.0.lock().map_err(|_| AppError {
        code: "DB_LOCK_POISON".to_string(),
        message: "Database mutex was poisoned.".to_string(),
    })?;
    get_income_timing_suggestions_inner(&conn, month_id)
}

fn confirm_income_timing_inner(
    conn: &rusqlite::Connection,
    input: &ConfirmIncomeTimingInput,
) -> Result<Month, AppError> {
    let expected_status = "closing:step-3";
    let next_status = "closing:step-4";

    let tx = conn.unchecked_transaction()?;

    // Guard: verify month is at closing:step-3
    let current: String = tx.query_row(
        "SELECT status FROM months WHERE id = ?1",
        rusqlite::params![input.month_id],
        |row| row.get(0),
    ).map_err(|e| match e {
        rusqlite::Error::QueryReturnedNoRows => AppError {
            code: "MONTH_NOT_FOUND".to_string(),
            message: format!("No month found with id {}", input.month_id),
        },
        other => AppError::from(other),
    })?;

    if current != expected_status {
        return Err(AppError {
            code: "INVALID_STEP_TRANSITION".to_string(),
            message: format!(
                "Expected status '{}' but found '{}'. Step may have already advanced.",
                expected_status, current
            ),
        });
    }

    // Replace all existing timing records for this month
    tx.execute(
        "DELETE FROM month_income_timing WHERE month_id = ?1",
        rusqlite::params![input.month_id],
    )?;

    for entry in &input.entries {
        tx.execute(
            "INSERT INTO month_income_timing (month_id, pay_date, amount_cents, label, updated_at) \
             VALUES (?1, ?2, ?3, ?4, datetime('now'))",
            rusqlite::params![
                input.month_id,
                entry.pay_date,
                entry.amount_cents,
                entry.label,
            ],
        )?;
    }

    // Advance step 3 → 4 atomically
    tx.execute(
        "UPDATE months SET status = ?1 WHERE id = ?2",
        rusqlite::params![next_status, input.month_id],
    )?;

    let m = tx.query_row(
        "SELECT id, year, month, status, opened_at, closed_at FROM months WHERE id = ?1",
        rusqlite::params![input.month_id],
        row_to_month,
    )?;
    tx.commit()?;
    Ok(m)
}

#[tauri::command]
pub fn confirm_income_timing(
    state: State<DbState>,
    input: ConfirmIncomeTimingInput,
) -> Result<Month, AppError> {
    let conn = state.0.lock().map_err(|_| AppError {
        code: "DB_LOCK_POISON".to_string(),
        message: "Database mutex was poisoned.".to_string(),
    })?;
    confirm_income_timing_inner(&conn, &input)
}

#[cfg(test)]
mod month_tests {
    use crate::migrations;
    use rusqlite::Connection;
    use super::{
        Month, AdvanceTurnTheMonthStepInput, CloseMonthInput, BeginTurnTheMonthInput,
        AllocationItem,
        open_month_inner, get_current_month_inner,
        advance_turn_the_month_step_inner, close_month_inner, begin_turn_the_month_inner,
    };
    use super::{CreateEnvelopeInput, create_envelope_inner};
    use super::{CloseoutSummaryInput, get_closeout_summary_inner};
    use super::{BillDateEntry, ConfirmBillDatesInput, confirm_bill_dates_inner};
    use super::{get_bill_date_suggestions_inner};
    use super::{IncomeTimingEntry, ConfirmIncomeTimingInput, confirm_income_timing_inner};
    use super::{get_income_timing_suggestions_inner};

    fn fresh_conn() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        migrations::run_migrations(&conn).unwrap();
        conn
    }

    fn insert_month(conn: &Connection, year: i64, month: i64, status: &str) -> i64 {
        conn.execute(
            "INSERT INTO months (year, month, status) VALUES (?1, ?2, ?3)",
            rusqlite::params![year, month, status],
        ).unwrap();
        conn.last_insert_rowid()
    }

    #[test]
    fn test_open_month_creates_record() {
        let conn = fresh_conn();
        let m = open_month_inner(&conn).unwrap();
        assert!(m.id > 0);
        assert_eq!(m.status, "open");
        assert!(m.year > 0);
        assert!(m.month >= 1 && m.month <= 12);
    }

    #[test]
    fn test_open_month_idempotent_via_insert_or_ignore() {
        let conn = fresh_conn();
        let m1 = open_month_inner(&conn).unwrap();
        let m2 = open_month_inner(&conn).unwrap();
        // Both calls return the same record
        assert_eq!(m1.id, m2.id);
        // Only one row exists
        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM months", [], |row| row.get(0))
            .unwrap();
        assert_eq!(count, 1);
    }

    #[test]
    fn test_get_current_month_returns_none_on_empty_db() {
        let conn = fresh_conn();
        let result = get_current_month_inner(&conn).unwrap();
        assert!(result.is_none());
    }

    #[test]
    fn test_get_current_month_returns_open_month() {
        let conn = fresh_conn();
        insert_month(&conn, 2026, 4, "open");
        let m = get_current_month_inner(&conn).unwrap().unwrap();
        assert_eq!(m.status, "open");
        assert_eq!(m.year, 2026);
        assert_eq!(m.month, 4);
    }

    #[test]
    fn test_get_current_month_returns_closing_month() {
        let conn = fresh_conn();
        insert_month(&conn, 2026, 4, "closing:step-2");
        let m = get_current_month_inner(&conn).unwrap().unwrap();
        assert_eq!(m.status, "closing:step-2");
    }

    #[test]
    fn test_get_current_month_skips_closed_months() {
        let conn = fresh_conn();
        insert_month(&conn, 2026, 3, "closed");
        let result = get_current_month_inner(&conn).unwrap();
        assert!(result.is_none(), "closed months should not be returned");
    }

    #[test]
    fn test_advance_step_updates_status() {
        let conn = fresh_conn();
        let id = insert_month(&conn, 2026, 4, "closing:step-1");
        let input = AdvanceTurnTheMonthStepInput { month_id: id, current_step: 1 };
        let m = advance_turn_the_month_step_inner(&conn, &input).unwrap();
        assert_eq!(m.status, "closing:step-2");
    }

    #[test]
    fn test_advance_step_wrong_status_errors() {
        let conn = fresh_conn();
        let id = insert_month(&conn, 2026, 4, "closing:step-1");
        // Try to advance from step 2, but we're at step 1 → should fail
        let input = AdvanceTurnTheMonthStepInput { month_id: id, current_step: 2 };
        let err = advance_turn_the_month_step_inner(&conn, &input).unwrap_err();
        assert_eq!(err.code, "INVALID_STEP_TRANSITION");
    }

    #[test]
    fn test_advance_step_month_not_found_errors() {
        let conn = fresh_conn();
        let input = AdvanceTurnTheMonthStepInput { month_id: 999, current_step: 1 };
        let err = advance_turn_the_month_step_inner(&conn, &input).unwrap_err();
        assert_eq!(err.code, "MONTH_NOT_FOUND");
    }

    #[test]
    fn test_close_month_creates_next_month() {
        let conn = fresh_conn();
        let id = insert_month(&conn, 2026, 4, "closing:step-4");
        let input = CloseMonthInput { month_id: id, allocations: vec![] };
        let new_month = close_month_inner(&conn, &input).unwrap();
        assert_eq!(new_month.status, "open");
        assert_eq!(new_month.year, 2026);
        assert_eq!(new_month.month, 5);

        // Original month should be closed
        let status: String = conn
            .query_row("SELECT status FROM months WHERE id = ?1", rusqlite::params![id], |row| row.get(0))
            .unwrap();
        assert_eq!(status, "closed");
    }

    #[test]
    fn test_close_month_open_status_errors() {
        let conn = fresh_conn();
        let id = insert_month(&conn, 2026, 4, "open");
        let input = CloseMonthInput { month_id: id, allocations: vec![] };
        let err = close_month_inner(&conn, &input).unwrap_err();
        assert_eq!(err.code, "INVALID_STATUS_FOR_CLOSE");
    }

    #[test]
    fn test_close_month_resets_rolling_envelopes() {
        let conn = fresh_conn();
        let id = insert_month(&conn, 2026, 4, "closing:step-4");
        // Create a Rolling envelope with allocated_cents > 0
        create_envelope_inner(&conn, &CreateEnvelopeInput {
            name: "Groceries".to_string(),
            envelope_type: "Rolling".to_string(),
            priority: "Need".to_string(),
            allocated_cents: 50000,
            month_id: None,
            is_savings: None,
        }).unwrap();
        let input = CloseMonthInput { month_id: id, allocations: vec![] };
        close_month_inner(&conn, &input).unwrap();
        // Rolling envelope allocated_cents should be 0
        let cents: i64 = conn
            .query_row("SELECT allocated_cents FROM envelopes WHERE type = 'Rolling'", [], |row| row.get(0))
            .unwrap();
        assert_eq!(cents, 0);
    }

    #[test]
    fn test_close_month_preserves_bill_envelope() {
        let conn = fresh_conn();
        let id = insert_month(&conn, 2026, 4, "closing:step-4");
        create_envelope_inner(&conn, &CreateEnvelopeInput {
            name: "Rent".to_string(),
            envelope_type: "Bill".to_string(),
            priority: "Need".to_string(),
            allocated_cents: 120000,
            month_id: None,
            is_savings: None,
        }).unwrap();
        let input = CloseMonthInput { month_id: id, allocations: vec![] };
        close_month_inner(&conn, &input).unwrap();
        // Bill envelope allocated_cents should be preserved
        let cents: i64 = conn
            .query_row("SELECT allocated_cents FROM envelopes WHERE type = 'Bill'", [], |row| row.get(0))
            .unwrap();
        assert_eq!(cents, 120000);
    }

    #[test]
    fn test_close_month_wraps_december() {
        let conn = fresh_conn();
        let id = insert_month(&conn, 2026, 12, "closing:step-4");
        let input = CloseMonthInput { month_id: id, allocations: vec![] };
        let new_month = close_month_inner(&conn, &input).unwrap();
        assert_eq!(new_month.year, 2027);
        assert_eq!(new_month.month, 1);
    }

    #[test]
    fn test_close_month_not_found_errors() {
        let conn = fresh_conn();
        let input = CloseMonthInput { month_id: 999, allocations: vec![] };
        let err = close_month_inner(&conn, &input).unwrap_err();
        assert_eq!(err.code, "MONTH_NOT_FOUND");
    }

    #[test]
    fn test_close_month_commits_allocations_atomically() {
        let conn = fresh_conn();
        let month_id = insert_month(&conn, 2026, 4, "closing:step-4");
        conn.execute(
            "INSERT INTO envelopes (name, type, priority, allocated_cents, is_savings) VALUES ('Groceries', 'Rolling', 'Need', 0, 0)",
            [],
        ).unwrap();
        let env_id = conn.last_insert_rowid();
        let input = CloseMonthInput {
            month_id,
            allocations: vec![AllocationItem { id: env_id, allocated_cents: 150_000 }],
        };
        let new_month = close_month_inner(&conn, &input).unwrap();
        assert_eq!(new_month.status, "open");
        assert_eq!(new_month.month, 5);
        let cents: i64 = conn.query_row(
            "SELECT allocated_cents FROM envelopes WHERE id = ?1",
            rusqlite::params![env_id],
            |row| row.get(0),
        ).unwrap();
        assert_eq!(cents, 150_000);
    }

    #[test]
    fn test_begin_ttm_noop_when_not_past_end() {
        let conn = fresh_conn();
        // Insert a month for the current calendar month — not past end
        let today: String = conn
            .query_row("SELECT date('now')", [], |row| row.get(0))
            .unwrap();
        let parts: Vec<&str> = today.splitn(3, '-').collect();
        let year: i64 = parts[0].parse().unwrap();
        let month: i64 = parts[1].parse().unwrap();
        let id = insert_month(&conn, year, month, "open");
        let input = BeginTurnTheMonthInput { month_id: id };
        let m = begin_turn_the_month_inner(&conn, &input).unwrap();
        assert_eq!(m.status, "open");
    }

    #[test]
    fn test_begin_ttm_transitions_to_closing_step_1() {
        let conn = fresh_conn();
        // Insert a month safely in the past
        let id = insert_month(&conn, 2000, 1, "open");
        let input = BeginTurnTheMonthInput { month_id: id };
        let m = begin_turn_the_month_inner(&conn, &input).unwrap();
        assert_eq!(m.status, "closing:step-1");
    }

    #[test]
    fn test_begin_ttm_idempotent_when_already_closing() {
        let conn = fresh_conn();
        let id = insert_month(&conn, 2000, 1, "closing:step-2");
        let input = BeginTurnTheMonthInput { month_id: id };
        let m = begin_turn_the_month_inner(&conn, &input).unwrap();
        assert_eq!(m.status, "closing:step-2");
    }

    #[test]
    fn test_begin_ttm_noop_when_closed() {
        let conn = fresh_conn();
        let id = insert_month(&conn, 2000, 1, "closed");
        let input = BeginTurnTheMonthInput { month_id: id };
        let m = begin_turn_the_month_inner(&conn, &input).unwrap();
        assert_eq!(m.status, "closed");
    }

    #[test]
    fn test_closeout_summary_empty_db() {
        let conn = fresh_conn();
        let id = insert_month(&conn, 2026, 3, "closing:step-1");
        let input = CloseoutSummaryInput { month_id: id };
        let s = get_closeout_summary_inner(&conn, &input).unwrap();
        assert_eq!(s.total_allocated_cents, 0);
        assert_eq!(s.total_spent_cents, 0);
        assert_eq!(s.stayed_in_budget, true);
        assert_eq!(s.overspend_cents, 0);
        assert_eq!(s.savings_flow_cents, 0);
        assert_eq!(s.drift_envelope_name, None);
    }

    #[test]
    fn test_closeout_summary_stayed_in_budget() {
        let conn = fresh_conn();
        let id = insert_month(&conn, 2026, 3, "closing:step-1");
        let env_id = {
            let input = CreateEnvelopeInput {
                name: "Groceries".to_string(),
                envelope_type: "Rolling".to_string(),
                priority: "Need".to_string(),
                allocated_cents: 50000,
                month_id: None,
                is_savings: Some(false),
            };
            create_envelope_inner(&conn, &input).unwrap().id
        };
        conn.execute(
            "INSERT INTO transactions (payee, amount_cents, date, envelope_id) VALUES (?1, ?2, ?3, ?4)",
            rusqlite::params!["Test Payee", -30000i64, "2026-03-15", env_id],
        ).unwrap();
        let input = CloseoutSummaryInput { month_id: id };
        let s = get_closeout_summary_inner(&conn, &input).unwrap();
        assert_eq!(s.total_spent_cents, 30000);
        assert_eq!(s.stayed_in_budget, true);
        assert_eq!(s.overspend_cents, 0);
    }

    #[test]
    fn test_closeout_summary_overspent() {
        let conn = fresh_conn();
        let id = insert_month(&conn, 2026, 3, "closing:step-1");
        let env_id = {
            let input = CreateEnvelopeInput {
                name: "Groceries".to_string(),
                envelope_type: "Rolling".to_string(),
                priority: "Need".to_string(),
                allocated_cents: 50000,
                month_id: None,
                is_savings: Some(false),
            };
            create_envelope_inner(&conn, &input).unwrap().id
        };
        conn.execute(
            "INSERT INTO transactions (payee, amount_cents, date, envelope_id) VALUES (?1, ?2, ?3, ?4)",
            rusqlite::params!["Test Payee", -60000i64, "2026-03-15", env_id],
        ).unwrap();
        let input = CloseoutSummaryInput { month_id: id };
        let s = get_closeout_summary_inner(&conn, &input).unwrap();
        assert_eq!(s.stayed_in_budget, false);
        assert_eq!(s.overspend_cents, 10000);
    }

    #[test]
    fn test_closeout_summary_savings_flow_deposit() {
        let conn = fresh_conn();
        let id = insert_month(&conn, 2026, 3, "closing:step-1");
        let env_id = {
            let input = CreateEnvelopeInput {
                name: "Savings".to_string(),
                envelope_type: "Goal".to_string(),
                priority: "Need".to_string(),
                allocated_cents: 0,
                month_id: None,
                is_savings: Some(true),
            };
            create_envelope_inner(&conn, &input).unwrap().id
        };
        conn.execute(
            "INSERT INTO transactions (payee, amount_cents, date, envelope_id) VALUES (?1, ?2, ?3, ?4)",
            rusqlite::params!["Savings Transfer", -25000i64, "2026-03-10", env_id],
        ).unwrap();
        let input = CloseoutSummaryInput { month_id: id };
        let s = get_closeout_summary_inner(&conn, &input).unwrap();
        assert_eq!(s.savings_flow_cents, 25000);
    }

    #[test]
    fn test_closeout_summary_savings_flow_withdrawal() {
        let conn = fresh_conn();
        let id = insert_month(&conn, 2026, 3, "closing:step-1");
        let env_id = {
            let input = CreateEnvelopeInput {
                name: "Savings".to_string(),
                envelope_type: "Goal".to_string(),
                priority: "Need".to_string(),
                allocated_cents: 0,
                month_id: None,
                is_savings: Some(true),
            };
            create_envelope_inner(&conn, &input).unwrap().id
        };
        conn.execute(
            "INSERT INTO transactions (payee, amount_cents, date, envelope_id) VALUES (?1, ?2, ?3, ?4)",
            rusqlite::params!["Savings Withdrawal", 15000i64, "2026-03-10", env_id],
        ).unwrap();
        let input = CloseoutSummaryInput { month_id: id };
        let s = get_closeout_summary_inner(&conn, &input).unwrap();
        assert_eq!(s.savings_flow_cents, -15000);
    }

    #[test]
    fn test_closeout_summary_drift_detection() {
        let conn = fresh_conn();
        let id = insert_month(&conn, 2026, 3, "closing:step-1");
        let env_id = {
            let input = CreateEnvelopeInput {
                name: "Dining Out".to_string(),
                envelope_type: "Rolling".to_string(),
                priority: "Want".to_string(),
                allocated_cents: 10000,
                month_id: None,
                is_savings: Some(false),
            };
            create_envelope_inner(&conn, &input).unwrap().id
        };
        // Previous month overspend (Feb 2026)
        conn.execute(
            "INSERT INTO transactions (payee, amount_cents, date, envelope_id) VALUES (?1, ?2, ?3, ?4)",
            rusqlite::params!["Restaurant", -12000i64, "2026-02-15", env_id],
        ).unwrap();
        // Current month overspend (Mar 2026)
        conn.execute(
            "INSERT INTO transactions (payee, amount_cents, date, envelope_id) VALUES (?1, ?2, ?3, ?4)",
            rusqlite::params!["Restaurant", -11000i64, "2026-03-15", env_id],
        ).unwrap();
        let input = CloseoutSummaryInput { month_id: id };
        let s = get_closeout_summary_inner(&conn, &input).unwrap();
        assert_eq!(s.drift_envelope_name, Some("Dining Out".to_string()));
    }

    #[test]
    fn test_closeout_summary_no_drift_one_month() {
        let conn = fresh_conn();
        let id = insert_month(&conn, 2026, 3, "closing:step-1");
        let env_id = {
            let input = CreateEnvelopeInput {
                name: "Dining Out".to_string(),
                envelope_type: "Rolling".to_string(),
                priority: "Want".to_string(),
                allocated_cents: 10000,
                month_id: None,
                is_savings: Some(false),
            };
            create_envelope_inner(&conn, &input).unwrap().id
        };
        // Only current month overspend (no prior month data)
        conn.execute(
            "INSERT INTO transactions (payee, amount_cents, date, envelope_id) VALUES (?1, ?2, ?3, ?4)",
            rusqlite::params!["Restaurant", -11000i64, "2026-03-15", env_id],
        ).unwrap();
        let input = CloseoutSummaryInput { month_id: id };
        let s = get_closeout_summary_inner(&conn, &input).unwrap();
        assert_eq!(s.drift_envelope_name, None);
    }

    #[test]
    fn test_closeout_summary_excludes_other_months() {
        let conn = fresh_conn();
        let id = insert_month(&conn, 2026, 3, "closing:step-1");
        let env_id = {
            let input = CreateEnvelopeInput {
                name: "Groceries".to_string(),
                envelope_type: "Rolling".to_string(),
                priority: "Need".to_string(),
                allocated_cents: 50000,
                month_id: None,
                is_savings: Some(false),
            };
            create_envelope_inner(&conn, &input).unwrap().id
        };
        // Transaction in April (outside Mar closing month)
        conn.execute(
            "INSERT INTO transactions (payee, amount_cents, date, envelope_id) VALUES (?1, ?2, ?3, ?4)",
            rusqlite::params!["Test Payee", -40000i64, "2026-04-01", env_id],
        ).unwrap();
        // Transaction in March (inside closing month)
        conn.execute(
            "INSERT INTO transactions (payee, amount_cents, date, envelope_id) VALUES (?1, ?2, ?3, ?4)",
            rusqlite::params!["Test Payee", -20000i64, "2026-03-15", env_id],
        ).unwrap();
        let input = CloseoutSummaryInput { month_id: id };
        let s = get_closeout_summary_inner(&conn, &input).unwrap();
        assert_eq!(s.total_spent_cents, 20000);
    }

    // ── Bill date tests ──

    fn insert_bill_envelope(conn: &Connection, name: &str) -> i64 {
        let input = CreateEnvelopeInput {
            name: name.to_string(),
            envelope_type: "Bill".to_string(),
            priority: "Need".to_string(),
            allocated_cents: 10000,
            month_id: None,
            is_savings: Some(false),
        };
        create_envelope_inner(conn, &input).unwrap().id
    }

    #[test]
    fn test_get_bill_date_suggestions_empty() {
        let conn = fresh_conn();
        let result = get_bill_date_suggestions_inner(&conn).unwrap();
        assert!(result.is_empty());
    }

    #[test]
    fn test_get_bill_date_suggestions_filters_bill_only() {
        let conn = fresh_conn();
        // Insert Rolling, Bill, Goal envelopes
        conn.execute(
            "INSERT INTO envelopes (name, type, priority, allocated_cents, is_savings) VALUES ('Groceries', 'Rolling', 'Need', 50000, 0)",
            [],
        ).unwrap();
        insert_bill_envelope(&conn, "Rent");
        conn.execute(
            "INSERT INTO envelopes (name, type, priority, allocated_cents, is_savings) VALUES ('Vacation', 'Goal', 'Want', 20000, 0)",
            [],
        ).unwrap();
        let result = get_bill_date_suggestions_inner(&conn).unwrap();
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].envelope_name, "Rent");
    }

    #[test]
    fn test_get_bill_date_suggestions_returns_due_day() {
        let conn = fresh_conn();
        let env_id = insert_bill_envelope(&conn, "Internet");
        conn.execute(
            "INSERT INTO bill_due_dates (envelope_id, due_day) VALUES (?1, ?2)",
            rusqlite::params![env_id, 15i32],
        ).unwrap();
        let result = get_bill_date_suggestions_inner(&conn).unwrap();
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].due_day, Some(15));
    }

    #[test]
    fn test_get_bill_date_suggestions_null_when_no_record() {
        let conn = fresh_conn();
        insert_bill_envelope(&conn, "Phone");
        let result = get_bill_date_suggestions_inner(&conn).unwrap();
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].due_day, None);
    }

    #[test]
    fn test_confirm_bill_dates_saves_and_advances() {
        let conn = fresh_conn();
        let month_id = insert_month(&conn, 2026, 4, "closing:step-2");
        let env_id = insert_bill_envelope(&conn, "Rent");
        let input = ConfirmBillDatesInput {
            month_id,
            dates: vec![BillDateEntry { envelope_id: env_id, due_day: Some(15) }],
        };
        let m = confirm_bill_dates_inner(&conn, &input).unwrap();
        assert_eq!(m.status, "closing:step-3");
        let due_day: i32 = conn.query_row(
            "SELECT due_day FROM bill_due_dates WHERE envelope_id = ?1",
            rusqlite::params![env_id],
            |row| row.get(0),
        ).unwrap();
        assert_eq!(due_day, 15);
    }

    #[test]
    fn test_confirm_bill_dates_upserts_existing() {
        let conn = fresh_conn();
        let month_id = insert_month(&conn, 2026, 4, "closing:step-2");
        let env_id = insert_bill_envelope(&conn, "Rent");
        conn.execute(
            "INSERT INTO bill_due_dates (envelope_id, due_day) VALUES (?1, ?2)",
            rusqlite::params![env_id, 10i32],
        ).unwrap();
        let input = ConfirmBillDatesInput {
            month_id,
            dates: vec![BillDateEntry { envelope_id: env_id, due_day: Some(20) }],
        };
        confirm_bill_dates_inner(&conn, &input).unwrap();
        let due_day: i32 = conn.query_row(
            "SELECT due_day FROM bill_due_dates WHERE envelope_id = ?1",
            rusqlite::params![env_id],
            |row| row.get(0),
        ).unwrap();
        assert_eq!(due_day, 20);
    }

    #[test]
    fn test_confirm_bill_dates_null_deletes_record() {
        let conn = fresh_conn();
        let month_id = insert_month(&conn, 2026, 4, "closing:step-2");
        let env_id = insert_bill_envelope(&conn, "Rent");
        conn.execute(
            "INSERT INTO bill_due_dates (envelope_id, due_day) VALUES (?1, ?2)",
            rusqlite::params![env_id, 15i32],
        ).unwrap();
        let input = ConfirmBillDatesInput {
            month_id,
            dates: vec![BillDateEntry { envelope_id: env_id, due_day: None }],
        };
        let m = confirm_bill_dates_inner(&conn, &input).unwrap();
        assert_eq!(m.status, "closing:step-3");
        let count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM bill_due_dates WHERE envelope_id = ?1",
            rusqlite::params![env_id],
            |row| row.get(0),
        ).unwrap();
        assert_eq!(count, 0);
    }

    #[test]
    fn test_confirm_bill_dates_empty_list_advances_step() {
        let conn = fresh_conn();
        let month_id = insert_month(&conn, 2026, 4, "closing:step-2");
        let input = ConfirmBillDatesInput {
            month_id,
            dates: vec![],
        };
        let m = confirm_bill_dates_inner(&conn, &input).unwrap();
        assert_eq!(m.status, "closing:step-3");
        let count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM bill_due_dates",
            [],
            |row| row.get(0),
        ).unwrap();
        assert_eq!(count, 0);
    }

    #[test]
    fn test_confirm_bill_dates_wrong_step_errors() {
        let conn = fresh_conn();
        let month_id = insert_month(&conn, 2026, 4, "closing:step-1");
        let input = ConfirmBillDatesInput {
            month_id,
            dates: vec![],
        };
        let err = confirm_bill_dates_inner(&conn, &input).unwrap_err();
        assert_eq!(err.code, "INVALID_STEP_TRANSITION");
        let status: String = conn.query_row(
            "SELECT status FROM months WHERE id = ?1",
            rusqlite::params![month_id],
            |row| row.get(0),
        ).unwrap();
        assert_eq!(status, "closing:step-1");
    }

    // ── Income timing tests ──

    fn insert_settings_twice_monthly(conn: &Connection) {
        conn.execute(
            "INSERT OR IGNORE INTO settings (id, pay_frequency, pay_dates) VALUES (1, ?1, ?2)",
            rusqlite::params!["twice-monthly", r#"["1","15"]"#],
        ).unwrap();
    }

    fn insert_income_entry(conn: &Connection, amount_cents: i64) {
        conn.execute(
            "INSERT INTO income_entries (name, amount_cents) VALUES (?1, ?2)",
            rusqlite::params!["Salary", amount_cents],
        ).unwrap();
    }

    #[test]
    fn test_get_income_timing_suggestions_no_settings() {
        let conn = fresh_conn();
        insert_month(&conn, 2026, 4, "closing:step-3");
        let month_id: i64 = conn.query_row("SELECT id FROM months WHERE year=2026 AND month=4", [], |r| r.get(0)).unwrap();
        let result = get_income_timing_suggestions_inner(&conn, month_id).unwrap();
        assert!(result.is_empty());
    }

    #[test]
    fn test_get_income_timing_suggestions_no_pay_dates() {
        let conn = fresh_conn();
        conn.execute(
            "INSERT OR IGNORE INTO settings (id, pay_frequency) VALUES (1, ?1)",
            rusqlite::params!["monthly"],
        ).unwrap();
        insert_month(&conn, 2026, 4, "closing:step-3");
        let month_id: i64 = conn.query_row("SELECT id FROM months WHERE year=2026 AND month=4", [], |r| r.get(0)).unwrap();
        let result = get_income_timing_suggestions_inner(&conn, month_id).unwrap();
        assert!(result.is_empty());
    }

    #[test]
    fn test_get_income_timing_suggestions_twice_monthly() {
        let conn = fresh_conn();
        insert_settings_twice_monthly(&conn);
        insert_income_entry(&conn, 600000);
        insert_month(&conn, 2026, 4, "closing:step-3");
        let month_id: i64 = conn.query_row("SELECT id FROM months WHERE year=2026 AND month=4", [], |r| r.get(0)).unwrap();
        let result = get_income_timing_suggestions_inner(&conn, month_id).unwrap();
        assert_eq!(result.len(), 2);
        assert_eq!(result[0].pay_date, "2026-05-01");
        assert_eq!(result[0].amount_cents, 300000);
        assert_eq!(result[1].pay_date, "2026-05-15");
        assert_eq!(result[1].amount_cents, 300000);
    }

    #[test]
    fn test_get_income_timing_suggestions_monthly() {
        let conn = fresh_conn();
        conn.execute(
            "INSERT OR IGNORE INTO settings (id, pay_frequency, pay_dates) VALUES (1, ?1, ?2)",
            rusqlite::params!["monthly", r#"["1"]"#],
        ).unwrap();
        insert_income_entry(&conn, 500000);
        insert_month(&conn, 2026, 4, "closing:step-3");
        let month_id: i64 = conn.query_row("SELECT id FROM months WHERE year=2026 AND month=4", [], |r| r.get(0)).unwrap();
        let result = get_income_timing_suggestions_inner(&conn, month_id).unwrap();
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].pay_date, "2026-05-01");
        assert_eq!(result[0].amount_cents, 500000);
        assert!(result[0].label.is_none());
    }

    #[test]
    fn test_get_income_timing_suggestions_december_wraps() {
        let conn = fresh_conn();
        insert_settings_twice_monthly(&conn);
        insert_income_entry(&conn, 600000);
        insert_month(&conn, 2026, 12, "closing:step-3");
        let month_id: i64 = conn.query_row("SELECT id FROM months WHERE year=2026 AND month=12", [], |r| r.get(0)).unwrap();
        let result = get_income_timing_suggestions_inner(&conn, month_id).unwrap();
        assert_eq!(result.len(), 2);
        assert_eq!(result[0].pay_date, "2027-01-01");
        assert_eq!(result[1].pay_date, "2027-01-15");
    }

    #[test]
    fn test_get_income_timing_suggestions_day_clamped_to_month_end() {
        let conn = fresh_conn();
        // Month with day 31, new month = March (31 days) — no clamping needed
        conn.execute(
            "INSERT OR IGNORE INTO settings (id, pay_frequency, pay_dates) VALUES (1, ?1, ?2)",
            rusqlite::params!["monthly", r#"["31"]"#],
        ).unwrap();
        insert_income_entry(&conn, 100000);
        insert_month(&conn, 2026, 2, "closing:step-3");
        let month_id: i64 = conn.query_row("SELECT id FROM months WHERE year=2026 AND month=2", [], |r| r.get(0)).unwrap();
        let result = get_income_timing_suggestions_inner(&conn, month_id).unwrap();
        assert_eq!(result[0].pay_date, "2026-03-31");

        // New month = February (28 days in 2026) — day 31 clamped to 28
        insert_month(&conn, 2026, 1, "closing:step-3");
        let month_id2: i64 = conn.query_row("SELECT id FROM months WHERE year=2026 AND month=1", [], |r| r.get(0)).unwrap();
        let result2 = get_income_timing_suggestions_inner(&conn, month_id2).unwrap();
        assert_eq!(result2[0].pay_date, "2026-02-28");
    }

    #[test]
    fn test_get_income_timing_suggestions_returns_stored_when_exists() {
        let conn = fresh_conn();
        insert_settings_twice_monthly(&conn);
        insert_income_entry(&conn, 600000);
        insert_month(&conn, 2026, 4, "closing:step-3");
        let month_id: i64 = conn.query_row("SELECT id FROM months WHERE year=2026 AND month=4", [], |r| r.get(0)).unwrap();
        // Insert a stored record manually
        conn.execute(
            "INSERT INTO month_income_timing (month_id, pay_date, amount_cents, label) VALUES (?1, ?2, ?3, ?4)",
            rusqlite::params![month_id, "2026-05-01", 999999i64, Option::<String>::None],
        ).unwrap();
        let result = get_income_timing_suggestions_inner(&conn, month_id).unwrap();
        // Should return stored record, not re-derived from settings
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].pay_date, "2026-05-01");
        assert_eq!(result[0].amount_cents, 999999);
    }

    #[test]
    fn test_confirm_income_timing_saves_and_advances() {
        let conn = fresh_conn();
        let month_id = insert_month(&conn, 2026, 4, "closing:step-3");
        let input = ConfirmIncomeTimingInput {
            month_id,
            entries: vec![
                IncomeTimingEntry { pay_date: "2026-05-01".to_string(), amount_cents: 300000, label: Some("Paycheck 1".to_string()) },
                IncomeTimingEntry { pay_date: "2026-05-15".to_string(), amount_cents: 300000, label: Some("Paycheck 2".to_string()) },
            ],
        };
        let m = confirm_income_timing_inner(&conn, &input).unwrap();
        assert_eq!(m.status, "closing:step-4");
        let count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM month_income_timing WHERE month_id = ?1",
            rusqlite::params![month_id],
            |r| r.get(0),
        ).unwrap();
        assert_eq!(count, 2);
        let amount: i64 = conn.query_row(
            "SELECT amount_cents FROM month_income_timing WHERE month_id = ?1 AND pay_date = '2026-05-01'",
            rusqlite::params![month_id],
            |r| r.get(0),
        ).unwrap();
        assert_eq!(amount, 300000);
    }

    #[test]
    fn test_confirm_income_timing_empty_entries_advances() {
        let conn = fresh_conn();
        let month_id = insert_month(&conn, 2026, 4, "closing:step-3");
        let input = ConfirmIncomeTimingInput { month_id, entries: vec![] };
        let m = confirm_income_timing_inner(&conn, &input).unwrap();
        assert_eq!(m.status, "closing:step-4");
        let count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM month_income_timing WHERE month_id = ?1",
            rusqlite::params![month_id],
            |r| r.get(0),
        ).unwrap();
        assert_eq!(count, 0);
    }

    #[test]
    fn test_confirm_income_timing_replaces_existing_records() {
        let conn = fresh_conn();
        let month_id = insert_month(&conn, 2026, 4, "closing:step-3");
        // Insert existing row
        conn.execute(
            "INSERT INTO month_income_timing (month_id, pay_date, amount_cents) VALUES (?1, ?2, ?3)",
            rusqlite::params![month_id, "2026-05-01", 100000i64],
        ).unwrap();
        let input = ConfirmIncomeTimingInput {
            month_id,
            entries: vec![
                IncomeTimingEntry { pay_date: "2026-05-15".to_string(), amount_cents: 200000, label: None },
            ],
        };
        let m = confirm_income_timing_inner(&conn, &input).unwrap();
        assert_eq!(m.status, "closing:step-4");
        // Old row should be gone
        let old: i64 = conn.query_row(
            "SELECT COUNT(*) FROM month_income_timing WHERE pay_date = '2026-05-01'",
            [],
            |r| r.get(0),
        ).unwrap();
        assert_eq!(old, 0);
        // New row present
        let new_amt: i64 = conn.query_row(
            "SELECT amount_cents FROM month_income_timing WHERE pay_date = '2026-05-15'",
            [],
            |r| r.get(0),
        ).unwrap();
        assert_eq!(new_amt, 200000);
    }

    #[test]
    fn test_confirm_income_timing_wrong_step_errors() {
        let conn = fresh_conn();
        let month_id = insert_month(&conn, 2026, 4, "closing:step-2");
        let input = ConfirmIncomeTimingInput { month_id, entries: vec![] };
        let err = confirm_income_timing_inner(&conn, &input).unwrap_err();
        assert_eq!(err.code, "INVALID_STEP_TRANSITION");
        let status: String = conn.query_row(
            "SELECT status FROM months WHERE id = ?1",
            rusqlite::params![month_id],
            |row| row.get(0),
        ).unwrap();
        assert_eq!(status, "closing:step-2");
    }
}

#[cfg(test)]
mod savings_tests {
    use crate::migrations;
    use rusqlite::Connection;
    use super::{get_savings_reconciliations_inner, record_reconciliation_inner, get_savings_transactions_since_inner, get_savings_flow_by_month_inner};

    fn fresh_conn() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        migrations::run_migrations(&conn).unwrap();
        conn
    }

    #[test]
    fn test_get_savings_reconciliations_empty_on_fresh_db() {
        let conn = fresh_conn();
        let rows = get_savings_reconciliations_inner(&conn).unwrap();
        assert!(rows.is_empty());
    }

    #[test]
    fn test_record_reconciliation_inserts_and_returns() {
        let conn = fresh_conn();
        let rec = record_reconciliation_inner(&conn, 500_000, Some("first entry".to_string())).unwrap();
        assert_eq!(rec.entered_balance_cents, 500_000);
        assert_eq!(rec.previous_tracked_balance_cents, 0);
        assert_eq!(rec.delta_cents, 500_000);
        assert_eq!(rec.note.as_deref(), Some("first entry"));
        assert!(rec.id > 0);
    }

    #[test]
    fn test_record_reconciliation_zero_balance_allowed() {
        let conn = fresh_conn();
        let rec = record_reconciliation_inner(&conn, 0, None).unwrap();
        assert_eq!(rec.entered_balance_cents, 0);
        assert_eq!(rec.delta_cents, 0);
    }

    #[test]
    fn test_record_reconciliation_negative_balance_rejected() {
        let conn = fresh_conn();
        let err = record_reconciliation_inner(&conn, -1, None).unwrap_err();
        assert_eq!(err.code, "INVALID_ENTERED_BALANCE");
    }

    #[test]
    fn test_record_reconciliation_delta_computed_correctly() {
        let conn = fresh_conn();
        // First reconciliation: balance goes from 0 to 300_000
        record_reconciliation_inner(&conn, 300_000, None).unwrap();
        // Second reconciliation: balance is now 450_000; delta = 150_000
        let rec2 = record_reconciliation_inner(&conn, 450_000, None).unwrap();
        assert_eq!(rec2.previous_tracked_balance_cents, 300_000);
        assert_eq!(rec2.delta_cents, 150_000);
    }

    #[test]
    fn test_record_reconciliation_negative_delta_allowed() {
        let conn = fresh_conn();
        // Balance drops from 500_000 to 200_000 (withdrew from savings)
        record_reconciliation_inner(&conn, 500_000, None).unwrap();
        let rec2 = record_reconciliation_inner(&conn, 200_000, None).unwrap();
        assert_eq!(rec2.delta_cents, -300_000);
    }

    #[test]
    fn test_record_reconciliation_previous_tracked_includes_tx_deltas() {
        let conn = fresh_conn();
        // Create savings envelope
        conn.execute(
            "INSERT INTO envelopes (name, type, priority, allocated_cents, is_savings) VALUES ('ING', 'Rolling', 'Need', 0, 1)",
            [],
        ).unwrap();
        let savings_env_id = conn.last_insert_rowid();
        // First reconciliation at 500_000
        let _rec1 = record_reconciliation_inner(&conn, 500_000, None).unwrap();
        // Insert savings deposit (amount_cents = -30_000) after the first reconciliation
        // (date > rec1.date means same-day txs are NOT included, which is correct)
        // Use a date after rec1 to ensure inclusion: rec1.date is today, use tomorrow-ish
        // Actually: the query uses `t.date > prev_date`. rec1.date is 'today'.
        // Insert on a date after rec1.date to ensure it's counted.
        conn.execute(
            "INSERT INTO transactions (payee, amount_cents, date, envelope_id, is_cleared) VALUES ('Deposit', -30000, '2099-01-01', ?1, 0)",
            rusqlite::params![savings_env_id],
        ).unwrap();
        // Second reconciliation at 600_000
        // previous_tracked = 500_000 + (-(-30_000)) = 530_000
        // delta = 600_000 - 530_000 = 70_000
        let rec2 = record_reconciliation_inner(&conn, 600_000, None).unwrap();
        assert_eq!(rec2.previous_tracked_balance_cents, 530_000);
        assert_eq!(rec2.delta_cents, 70_000);
    }

    #[test]
    fn test_get_savings_reconciliations_ordered_by_date_asc() {
        let conn = fresh_conn();
        // Insert rows with explicit different dates to actually exercise ORDER BY date ASC
        conn.execute(
            "INSERT INTO savings_reconciliations (date, entered_balance_cents, previous_tracked_balance_cents, delta_cents, note) VALUES ('2026-01-01', 200_000, 0, 200_000, NULL)",
            [],
        ).unwrap();
        conn.execute(
            "INSERT INTO savings_reconciliations (date, entered_balance_cents, previous_tracked_balance_cents, delta_cents, note) VALUES ('2026-03-01', 500_000, 200_000, 300_000, NULL)",
            [],
        ).unwrap();
        conn.execute(
            "INSERT INTO savings_reconciliations (date, entered_balance_cents, previous_tracked_balance_cents, delta_cents, note) VALUES ('2026-02-01', 350_000, 200_000, 150_000, NULL)",
            [],
        ).unwrap();
        let rows = get_savings_reconciliations_inner(&conn).unwrap();
        assert_eq!(rows.len(), 3);
        assert_eq!(rows[0].date, "2026-01-01");
        assert_eq!(rows[1].date, "2026-02-01");
        assert_eq!(rows[2].date, "2026-03-01");
    }

    #[test]
    fn test_get_savings_transactions_since_empty() {
        let conn = fresh_conn();
        // No savings envelope at all — query should return empty vec
        let rows = get_savings_transactions_since_inner(&conn, "2026-01-01").unwrap();
        assert!(rows.is_empty());
    }

    #[test]
    fn test_get_savings_transactions_since_filters_by_savings_envelope() {
        let conn = fresh_conn();
        // Create savings envelope
        conn.execute(
            "INSERT INTO envelopes (name, type, priority, allocated_cents, is_savings) VALUES ('ING', 'Rolling', 'Need', 0, 1)",
            [],
        ).unwrap();
        let savings_env_id = conn.last_insert_rowid();
        // Create non-savings envelope
        conn.execute(
            "INSERT INTO envelopes (name, type, priority, allocated_cents, is_savings) VALUES ('Groceries', 'Rolling', 'Need', 0, 0)",
            [],
        ).unwrap();
        let regular_env_id = conn.last_insert_rowid();
        // Add transaction to savings envelope
        conn.execute(
            "INSERT INTO transactions (payee, amount_cents, date, envelope_id, is_cleared) VALUES ('Deposit', -50000, '2026-04-01', ?1, 0)",
            rusqlite::params![savings_env_id],
        ).unwrap();
        // Add transaction to non-savings envelope
        conn.execute(
            "INSERT INTO transactions (payee, amount_cents, date, envelope_id, is_cleared) VALUES ('Kroger', 3000, '2026-04-01', ?1, 0)",
            rusqlite::params![regular_env_id],
        ).unwrap();
        let rows = get_savings_transactions_since_inner(&conn, "2026-01-01").unwrap();
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].payee, "Deposit");
        assert_eq!(rows[0].amount_cents, -50000);
    }

    #[test]
    fn test_get_savings_transactions_since_filters_by_date() {
        let conn = fresh_conn();
        // Create savings envelope
        conn.execute(
            "INSERT INTO envelopes (name, type, priority, allocated_cents, is_savings) VALUES ('ING', 'Rolling', 'Need', 0, 1)",
            [],
        ).unwrap();
        let savings_env_id = conn.last_insert_rowid();
        // Add two transactions on different dates
        conn.execute(
            "INSERT INTO transactions (payee, amount_cents, date, envelope_id, is_cleared) VALUES ('Early Deposit', -20000, '2026-03-01', ?1, 0)",
            rusqlite::params![savings_env_id],
        ).unwrap();
        conn.execute(
            "INSERT INTO transactions (payee, amount_cents, date, envelope_id, is_cleared) VALUES ('Late Deposit', -30000, '2026-04-15', ?1, 0)",
            rusqlite::params![savings_env_id],
        ).unwrap();
        // Query with since_date between the two → only the later one returned
        let rows = get_savings_transactions_since_inner(&conn, "2026-04-01").unwrap();
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].payee, "Late Deposit");
    }

    #[test]
    fn test_get_savings_flow_by_month_empty_returns_empty() {
        let conn = fresh_conn();
        let result = get_savings_flow_by_month_inner(&conn).unwrap();
        assert!(result.is_empty());
    }

    #[test]
    fn test_get_savings_flow_by_month_aggregates_by_month() {
        let conn = fresh_conn();
        // Create a savings envelope
        conn.execute(
            "INSERT INTO envelopes (name, type, priority, allocated_cents, is_savings) VALUES ('Savings', 'Rolling', 'Need', 0, 1)",
            [],
        ).unwrap();
        let envelope_id: i64 = conn.query_row("SELECT last_insert_rowid()", [], |r| r.get(0)).unwrap();
        // Two deposits in the same month
        conn.execute(
            "INSERT INTO transactions (payee, amount_cents, date, envelope_id, is_cleared) VALUES ('Deposit1', -20000, date('now', 'start of month'), ?1, 0)",
            rusqlite::params![envelope_id],
        ).unwrap();
        conn.execute(
            "INSERT INTO transactions (payee, amount_cents, date, envelope_id, is_cleared) VALUES ('Deposit2', -30000, date('now', 'start of month'), ?1, 0)",
            rusqlite::params![envelope_id],
        ).unwrap();
        // One in a different month (2 months ago)
        conn.execute(
            "INSERT INTO transactions (payee, amount_cents, date, envelope_id, is_cleared) VALUES ('OldDeposit', -10000, date('now', 'start of month', '-2 months'), ?1, 0)",
            rusqlite::params![envelope_id],
        ).unwrap();
        let result = get_savings_flow_by_month_inner(&conn).unwrap();
        assert_eq!(result.len(), 2);
        // Current month: -(-20000) + -(-30000) = 50000
        let current_month: String = conn.query_row("SELECT strftime('%Y-%m', 'now')", [], |r| r.get(0)).unwrap();
        let current = result.iter().find(|r| r.month == current_month).unwrap();
        assert_eq!(current.net_flow_cents, 50000);
        // Older month: -(-10000) = 10000
        let older = result.iter().find(|r| r.month != current_month).unwrap();
        assert_eq!(older.net_flow_cents, 10000);
    }

    #[test]
    fn test_get_savings_flow_by_month_sign_convention() {
        let conn = fresh_conn();
        conn.execute(
            "INSERT INTO envelopes (name, type, priority, allocated_cents, is_savings) VALUES ('Savings', 'Rolling', 'Need', 0, 1)",
            [],
        ).unwrap();
        let envelope_id: i64 = conn.query_row("SELECT last_insert_rowid()", [], |r| r.get(0)).unwrap();
        // Deposit: negative amount_cents → positive net_flow_cents
        conn.execute(
            "INSERT INTO transactions (payee, amount_cents, date, envelope_id, is_cleared) VALUES ('Deposit', -50000, date('now', 'start of month'), ?1, 0)",
            rusqlite::params![envelope_id],
        ).unwrap();
        // Withdrawal: positive amount_cents → negative net_flow_cents (different month)
        conn.execute(
            "INSERT INTO transactions (payee, amount_cents, date, envelope_id, is_cleared) VALUES ('Withdrawal', 20000, date('now', 'start of month', '-1 month'), ?1, 0)",
            rusqlite::params![envelope_id],
        ).unwrap();
        let result = get_savings_flow_by_month_inner(&conn).unwrap();
        assert_eq!(result.len(), 2);
        let deposit_month = result.iter().find(|r| r.net_flow_cents > 0).unwrap();
        assert_eq!(deposit_month.net_flow_cents, 50000);
        let withdrawal_month = result.iter().find(|r| r.net_flow_cents < 0).unwrap();
        assert_eq!(withdrawal_month.net_flow_cents, -20000);
    }

    #[test]
    fn test_get_savings_flow_by_month_excludes_non_savings_envelopes() {
        let conn = fresh_conn();
        // Non-savings envelope
        conn.execute(
            "INSERT INTO envelopes (name, type, priority, allocated_cents, is_savings) VALUES ('Groceries', 'Rolling', 'Need', 0, 0)",
            [],
        ).unwrap();
        let non_savings_id: i64 = conn.query_row("SELECT last_insert_rowid()", [], |r| r.get(0)).unwrap();
        conn.execute(
            "INSERT INTO transactions (payee, amount_cents, date, envelope_id, is_cleared) VALUES ('Groceries', 5000, date('now', 'start of month'), ?1, 0)",
            rusqlite::params![non_savings_id],
        ).unwrap();
        let result = get_savings_flow_by_month_inner(&conn).unwrap();
        assert!(result.is_empty());
    }
}

#[cfg(test)]
mod essential_spend_tests {
    use crate::migrations;
    use rusqlite::Connection;
    use super::get_avg_monthly_essential_spend_cents_inner;

    fn fresh_conn() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        migrations::run_migrations(&conn).unwrap();
        conn
    }

    fn make_need_envelope(conn: &Connection, name: &str) -> i64 {
        conn.execute(
            "INSERT INTO envelopes (name, type, priority, allocated_cents, is_savings) \
             VALUES (?1, 'Rolling', 'Need', 0, 0)",
            rusqlite::params![name],
        ).unwrap();
        conn.last_insert_rowid()
    }

    fn make_tx(conn: &Connection, env_id: i64, amount_cents: i64, date: &str) {
        conn.execute(
            "INSERT INTO transactions (payee, amount_cents, date, envelope_id, is_cleared) \
             VALUES ('Test', ?1, ?2, ?3, 0)",
            rusqlite::params![amount_cents, date, env_id],
        ).unwrap();
    }

    #[test]
    fn test_get_avg_essential_spend_returns_zero_when_no_transactions() {
        let conn = fresh_conn();
        let result = get_avg_monthly_essential_spend_cents_inner(&conn).unwrap();
        assert_eq!(result, 0);
    }

    #[test]
    fn test_get_avg_essential_spend_returns_zero_when_no_need_envelopes() {
        let conn = fresh_conn();
        // Create Should-priority envelope with transactions
        conn.execute(
            "INSERT INTO envelopes (name, type, priority, allocated_cents, is_savings) \
             VALUES ('Should Env', 'Rolling', 'Should', 0, 0)",
            [],
        ).unwrap();
        let env_id = conn.last_insert_rowid();
        make_tx(&conn, env_id, -50_000, "2026-01-15");
        let result = get_avg_monthly_essential_spend_cents_inner(&conn).unwrap();
        assert_eq!(result, 0);
    }

    #[test]
    fn test_get_avg_essential_spend_returns_zero_when_savings_envelope() {
        let conn = fresh_conn();
        // Create Need-priority savings envelope (is_savings=1)
        conn.execute(
            "INSERT INTO envelopes (name, type, priority, allocated_cents, is_savings) \
             VALUES ('Savings', 'Rolling', 'Need', 0, 1)",
            [],
        ).unwrap();
        let env_id = conn.last_insert_rowid();
        make_tx(&conn, env_id, -100_000, "2026-01-15");
        let result = get_avg_monthly_essential_spend_cents_inner(&conn).unwrap();
        assert_eq!(result, 0);
    }

    #[test]
    fn test_get_avg_essential_spend_single_month() {
        let conn = fresh_conn();
        let env_id = make_need_envelope(&conn, "Rent");
        make_tx(&conn, env_id, -100_000, "2026-01-01");
        make_tx(&conn, env_id, -50_000, "2026-01-15");
        // Total for Jan: -(-100_000 + -50_000) = 150_000
        let result = get_avg_monthly_essential_spend_cents_inner(&conn).unwrap();
        assert_eq!(result, 150_000);
    }

    #[test]
    fn test_get_avg_essential_spend_two_months_averaged() {
        let conn = fresh_conn();
        let env_id = make_need_envelope(&conn, "Groceries");
        // Month A: total spend 120_000
        make_tx(&conn, env_id, -120_000, "2026-01-15");
        // Month B: total spend 180_000
        make_tx(&conn, env_id, -180_000, "2026-02-15");
        // AVG(120_000, 180_000) = 150_000
        let result = get_avg_monthly_essential_spend_cents_inner(&conn).unwrap();
        assert_eq!(result, 150_000);
    }

    #[test]
    fn test_get_avg_essential_spend_excludes_net_refund_months() {
        let conn = fresh_conn();
        let env_id = make_need_envelope(&conn, "Groceries");
        // Month A: qualifying — net spend 100_000
        make_tx(&conn, env_id, -100_000, "2026-01-15");
        // Month B: refunds outweigh spending — net SUM(-amount_cents) = -50_000 + 200_000 = should be calculated...
        // Transactions: spending +50_000 credit (positive amount = incoming/refund), refund -200_000 cents = +200_000 when negated
        // To get a net positive in SUM(-amount_cents), we need SUM(-amount_cents) > 0.
        // SUM(-amount_cents) > 0 means sum of expenses > 0.
        // For a month with net positive spending (after all refunds), SUM(-amount_cents) > 0.
        // For a month to be excluded (refunds > spending): SUM(-amount_cents) <= 0
        // Example: one transaction of amount_cents=50_000 (a refund/credit) → SUM(-50_000) = -50_000 ≤ 0 → excluded
        make_tx(&conn, env_id, 50_000, "2026-02-15"); // refund — positive amount
        // Only Jan qualifies → avg = 100_000
        let result = get_avg_monthly_essential_spend_cents_inner(&conn).unwrap();
        assert_eq!(result, 100_000);
    }
}

#[cfg(test)]
mod merchant_rule_tests {
    use crate::migrations;
    use rusqlite::Connection;
    use super::{CreateMerchantRuleInput, UpdateMerchantRuleInput, CreateEnvelopeInput};
    use super::{create_merchant_rule_inner, get_merchant_rules_inner, update_merchant_rule_inner, delete_merchant_rule_inner, create_envelope_inner};

    fn fresh_conn() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        migrations::run_migrations(&conn).unwrap();
        conn
    }

    fn make_envelope(conn: &Connection) -> i64 {
        let input = CreateEnvelopeInput {
            name: "Test Envelope".to_string(),
            envelope_type: "Rolling".to_string(),
            priority: "Need".to_string(),
            allocated_cents: 0,
            month_id: None,
            is_savings: None,
        };
        create_envelope_inner(conn, &input).unwrap().id
    }

    #[test]
    fn test_create_merchant_rule_returns_inserted_row() {
        let conn = fresh_conn();
        let env_id = make_envelope(&conn);
        let input = CreateMerchantRuleInput {
            payee_substring: "Kroger".to_string(),
            envelope_id: env_id,
        };
        let rule = create_merchant_rule_inner(&conn, &input).unwrap();
        assert_eq!(rule.payee_substring, "Kroger");
        assert_eq!(rule.envelope_id, env_id);
        assert!(rule.id > 0);
    }

    #[test]
    fn test_create_merchant_rule_defaults_match_count_zero() {
        let conn = fresh_conn();
        let env_id = make_envelope(&conn);
        let input = CreateMerchantRuleInput {
            payee_substring: "Starbucks".to_string(),
            envelope_id: env_id,
        };
        let rule = create_merchant_rule_inner(&conn, &input).unwrap();
        assert_eq!(rule.match_count, 0);
    }

    #[test]
    fn test_create_merchant_rule_defaults_last_matched_at_null() {
        let conn = fresh_conn();
        let env_id = make_envelope(&conn);
        let input = CreateMerchantRuleInput {
            payee_substring: "Amazon".to_string(),
            envelope_id: env_id,
        };
        let rule = create_merchant_rule_inner(&conn, &input).unwrap();
        assert!(rule.last_matched_at.is_none());
    }

    #[test]
    fn test_get_merchant_rules_returns_all() {
        let conn = fresh_conn();
        let env_id = make_envelope(&conn);
        create_merchant_rule_inner(&conn, &CreateMerchantRuleInput {
            payee_substring: "Kroger".to_string(),
            envelope_id: env_id,
        }).unwrap();
        create_merchant_rule_inner(&conn, &CreateMerchantRuleInput {
            payee_substring: "Walmart".to_string(),
            envelope_id: env_id,
        }).unwrap();
        let rules = get_merchant_rules_inner(&conn).unwrap();
        assert_eq!(rules.len(), 2);
    }

    #[test]
    fn test_get_merchant_rules_ordered_by_match_count_desc() {
        let conn = fresh_conn();
        let env_id = make_envelope(&conn);
        let r1 = create_merchant_rule_inner(&conn, &CreateMerchantRuleInput {
            payee_substring: "Low".to_string(),
            envelope_id: env_id,
        }).unwrap();
        let r2 = create_merchant_rule_inner(&conn, &CreateMerchantRuleInput {
            payee_substring: "High".to_string(),
            envelope_id: env_id,
        }).unwrap();
        // Manually bump match_count for r2
        conn.execute(
            "UPDATE merchant_rules SET match_count = 10 WHERE id = ?1",
            rusqlite::params![r2.id],
        ).unwrap();
        let rules = get_merchant_rules_inner(&conn).unwrap();
        assert_eq!(rules[0].id, r2.id, "highest match_count should come first");
        assert_eq!(rules[1].id, r1.id);
    }

    #[test]
    fn test_update_merchant_rule_bumps_version() {
        let conn = fresh_conn();
        let env_id = make_envelope(&conn);
        let rule = create_merchant_rule_inner(&conn, &CreateMerchantRuleInput {
            payee_substring: "Kroger".to_string(),
            envelope_id: env_id,
        }).unwrap();
        assert_eq!(rule.version, 1);
        let updated = update_merchant_rule_inner(&conn, &UpdateMerchantRuleInput {
            id: rule.id,
            payee_substring: Some("KROGER".to_string()),
            envelope_id: None,
        }).unwrap();
        assert_eq!(updated.version, 2);
    }

    #[test]
    fn test_update_merchant_rule_coalesces_unchanged_fields() {
        let conn = fresh_conn();
        let env_id = make_envelope(&conn);
        let env_id2 = make_envelope(&conn);
        let rule = create_merchant_rule_inner(&conn, &CreateMerchantRuleInput {
            payee_substring: "Kroger".to_string(),
            envelope_id: env_id,
        }).unwrap();
        // Only update envelope_id — payee_substring should remain
        let updated = update_merchant_rule_inner(&conn, &UpdateMerchantRuleInput {
            id: rule.id,
            payee_substring: None,
            envelope_id: Some(env_id2),
        }).unwrap();
        assert_eq!(updated.payee_substring, "Kroger");
        assert_eq!(updated.envelope_id, env_id2);
    }

    #[test]
    fn test_update_merchant_rule_returns_not_found_for_invalid_id() {
        let conn = fresh_conn();
        let err = update_merchant_rule_inner(&conn, &UpdateMerchantRuleInput {
            id: 9999,
            payee_substring: Some("Ghost".to_string()),
            envelope_id: None,
        }).unwrap_err();
        assert_eq!(err.code, "RULE_NOT_FOUND");
    }

    #[test]
    fn test_delete_merchant_rule_removes_row() {
        let conn = fresh_conn();
        let env_id = make_envelope(&conn);
        let rule = create_merchant_rule_inner(&conn, &CreateMerchantRuleInput {
            payee_substring: "ToDelete".to_string(),
            envelope_id: env_id,
        }).unwrap();
        delete_merchant_rule_inner(&conn, rule.id).unwrap();
        let rules = get_merchant_rules_inner(&conn).unwrap();
        assert!(rules.is_empty());
    }

    #[test]
    fn test_delete_merchant_rule_returns_not_found_for_invalid_id() {
        let conn = fresh_conn();
        let err = delete_merchant_rule_inner(&conn, 9999).unwrap_err();
        assert_eq!(err.code, "RULE_NOT_FOUND");
    }
}

#[cfg(test)]
mod envelope_savings_tests {
    use crate::migrations;
    use rusqlite::Connection;
    use super::{CreateEnvelopeInput, UpdateEnvelopeInput};
    use super::{create_envelope_inner, update_envelope_inner};

    fn fresh_conn() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        migrations::run_migrations(&conn).unwrap();
        conn
    }

    fn make_envelope(conn: &Connection, name: &str) -> i64 {
        let input = CreateEnvelopeInput {
            name: name.to_string(),
            envelope_type: "Rolling".to_string(),
            priority: "Need".to_string(),
            allocated_cents: 0,
            month_id: None,
            is_savings: None,
        };
        create_envelope_inner(conn, &input).unwrap().id
    }

    #[test]
    fn test_update_envelope_savings_already_designated() {
        let conn = fresh_conn();
        let id1 = make_envelope(&conn, "ING Savings");
        let id2 = make_envelope(&conn, "Emergency Fund");

        // Set first envelope as savings — should succeed
        let result = update_envelope_inner(&conn, &UpdateEnvelopeInput {
            id: id1,
            name: None,
            envelope_type: None,
            priority: None,
            allocated_cents: None,
            month_id: None,
            is_savings: Some(true),
        });
        assert!(result.is_ok());
        assert!(result.unwrap().is_savings);

        // Attempt to set second envelope as savings — should fail
        let err = update_envelope_inner(&conn, &UpdateEnvelopeInput {
            id: id2,
            name: None,
            envelope_type: None,
            priority: None,
            allocated_cents: None,
            month_id: None,
            is_savings: Some(true),
        }).unwrap_err();
        assert_eq!(err.code, "SAVINGS_ALREADY_DESIGNATED");

        // Verify first envelope is still savings (unchanged)
        let first = update_envelope_inner(&conn, &UpdateEnvelopeInput {
            id: id1,
            name: None,
            envelope_type: None,
            priority: None,
            allocated_cents: None,
            month_id: None,
            is_savings: None,
        }).unwrap();
        assert!(first.is_savings);

        // Verify second envelope is NOT savings
        let second = update_envelope_inner(&conn, &UpdateEnvelopeInput {
            id: id2,
            name: None,
            envelope_type: None,
            priority: None,
            allocated_cents: None,
            month_id: None,
            is_savings: None,
        }).unwrap();
        assert!(!second.is_savings);
    }
}
