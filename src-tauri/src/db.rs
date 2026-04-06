use crate::error::AppError;
use crate::migrations;

pub fn init_database(db_path: &std::path::Path) -> Result<rusqlite::Connection, AppError> {
    let conn = rusqlite::Connection::open(db_path)?;

    // Set busy timeout so commands don't hang indefinitely on WAL contention
    conn.busy_timeout(std::time::Duration::from_secs(5))?;

    // Enable WAL mode for concurrent read safety (NFR5, NFR7)
    // Verify the mode was actually engaged — SQLite can silently fall back on read-only volumes.
    let mode: String = conn.query_row("PRAGMA journal_mode=WAL", [], |row| row.get(0))?;
    if mode != "wal" {
        return Err(AppError {
            code: "DB_WAL_FAIL".to_string(),
            message: format!("Expected WAL journal mode but got '{}'. The database volume may be read-only.", mode),
        });
    }

    // Integrity check on every launch before any data access (Risk 1 mitigation).
    // Collect ALL rows — a corrupt DB can return multiple problem rows; checking only the
    // first would miss corruption beyond page 1.
    // stmt is scoped so it drops (releasing the borrow) before conn is moved into Ok().
    {
        let mut stmt = conn.prepare("PRAGMA integrity_check")?;
        let rows: Vec<String> = stmt
            .query_map([], |row| row.get(0))?
            .collect::<Result<_, _>>()
            .map_err(AppError::from)?;
        let is_ok = rows.len() == 1 && rows[0] == "ok";
        if !is_ok {
            return Err(AppError {
                code: "DB_INTEGRITY_FAIL".to_string(),
                message: format!(
                    "Database integrity check failed: {}. The database may be corrupted.",
                    rows.join("; ")
                ),
            });
        }
    }

    // Run pending migrations (FR40 — schema migration on version change)
    migrations::run_migrations(&conn)?;

    Ok(conn)
}
