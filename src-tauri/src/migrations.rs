use crate::error::AppError;

/// Each entry: (migration_version: i64, sql: &str)
const MIGRATIONS: &[(i64, &str)] = &[
    (1, include_str!("../migrations/001_initial_schema.sql")),
    (2, include_str!("../migrations/002_add_budget_name_start_month.sql")),
    (3, include_str!("../migrations/003_envelopes.sql")),
    (4, include_str!("../migrations/004_income_entries.sql")),
    (5, include_str!("../migrations/005_borrow_schema.sql")),
    (6, include_str!("../migrations/006_transactions.sql")),
    (7, include_str!("../migrations/007_merchant_rules.sql")),
];

const _: () = {
    let mut i = 1;
    while i < MIGRATIONS.len() {
        assert!(MIGRATIONS[i].0 > MIGRATIONS[i - 1].0, "MIGRATIONS must be in strictly ascending version order");
        i += 1;
    }
};

pub fn run_migrations(conn: &rusqlite::Connection) -> Result<(), AppError> {
    // Bootstrap: create schema_version if it doesn't exist yet.
    // This is the only SQL that runs outside a migration transaction.
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS schema_version (
           version    INTEGER PRIMARY KEY,
           applied_at TEXT NOT NULL DEFAULT (datetime('now'))
         );"
    )?;

    // Find current schema version (0 if no migrations applied yet)
    let current_version: i64 = conn.query_row(
        "SELECT COALESCE(MAX(version), 0) FROM schema_version",
        [],
        |row| row.get(0),
    )?;

    // Run each unapplied migration in order
    for &(version, sql) in MIGRATIONS {
        if version <= current_version {
            continue; // already applied
        }

        // Each migration runs in its own transaction for atomicity (FR39, FR40)
        let tx = conn.unchecked_transaction()?;
        tx.execute_batch(sql)?;
        tx.execute(
            "INSERT INTO schema_version (version) VALUES (?1)",
            rusqlite::params![version],
        )?;
        tx.commit()?;
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fresh_conn() -> rusqlite::Connection {
        rusqlite::Connection::open_in_memory().unwrap()
    }

    #[test]
    fn test_migrations_run_on_fresh_db() {
        let conn = fresh_conn();
        run_migrations(&conn).expect("migrations should succeed on fresh DB");

        let version: i64 = conn
            .query_row("SELECT MAX(version) FROM schema_version", [], |row| row.get(0))
            .unwrap();
        assert_eq!(version, 7, "schema_version should be 7 after all migrations");
    }

    #[test]
    fn test_migrations_are_idempotent() {
        let conn = fresh_conn();
        run_migrations(&conn).expect("first run should succeed");
        run_migrations(&conn).expect("second run should also succeed (idempotent)");

        let version: i64 = conn
            .query_row("SELECT MAX(version) FROM schema_version", [], |row| row.get(0))
            .unwrap();
        assert_eq!(version, 7, "version should still be 7 after second run");
    }

    #[test]
    fn test_settings_table_exists_after_migration() {
        let conn = fresh_conn();
        run_migrations(&conn).unwrap();

        // settings table should be queryable
        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM settings", [], |row| row.get(0))
            .unwrap();
        assert_eq!(count, 0, "settings table should be empty on fresh DB");
    }

    #[test]
    fn test_app_error_serializes_correctly() {
        let err = AppError {
            code: "TEST_CODE".to_string(),
            message: "Test message".to_string(),
        };
        let json = serde_json::to_string(&err).unwrap();
        assert!(json.contains("TEST_CODE"));
        assert!(json.contains("Test message"));
    }
}
