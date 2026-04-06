# Story 1.3: SQLite Infrastructure — Database, Migrations, and Atomic Writes

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer,
I want a fully operational SQLite backend with WAL mode, a migration runner, an initial schema, and a consistent Tauri command error pattern,
so that all subsequent stories can write data with guaranteed atomicity and the schema can evolve without data loss.

## Acceptance Criteria

1. **Given** `rusqlite` (bundled SQLite) is installed and the Tauri app initializes, **when** the app launches, **then** the SQLite database file is created in the app local data directory (pre-onboarding placeholder); WAL mode is enabled via `PRAGMA journal_mode=WAL`.

2. **Given** the app launches, **when** the migration runner executes before any data access, **then** it checks the internal `schema_version` table (bootstrapped if absent); runs only unapplied numbered migrations; `001_initial_schema.sql` creates the `settings` and `schema_version` tables.

3. **Given** a migration fails mid-run, **when** the migration runner detects the failure, **then** the launch aborts cleanly via the Tauri `setup` hook error; no partial migration is committed (each migration runs in a transaction); the database remains in its last consistent state.

4. **Given** `PRAGMA integrity_check` runs on every launch before any data access, **when** the database is healthy, **then** the check returns `ok` and the app proceeds normally; if it returns anything else the setup hook returns an error and the app does not start.

5. **Given** all Tauri commands are structured to return `Result<T, AppError>`, **when** a command is defined, **then** the `AppError` struct has `code: String` and `message: String` fields; all command errors use this shape; React receives typed rejections via `invoke()`.

6. **Given** a write operation fails mid-execution, **when** the Rust command catches the error, **then** the SQLite transaction is rolled back; the data store remains in its prior consistent state; no partial write is committed (FR39).

## Tasks / Subtasks

- [x] Task 1: Add `rusqlite` dependency to `src-tauri/Cargo.toml` (AC: #1)
  - [x] Add `rusqlite = { version = "0.32", features = ["bundled"] }` to `[dependencies]`
  - [x] Verify `serde` and `serde_json` are already present (they are — confirm no changes needed)

- [x] Task 2: Create `AppError` struct in `src-tauri/src/error.rs` (AC: #5, #6)
  - [x] Define `pub struct AppError { pub code: String, pub message: String }` with `derive(Debug, serde::Serialize)`
  - [x] Implement `From<rusqlite::Error>` → `AppError` with `code: "DB_ERROR"` and the rusqlite message
  - [x] Implement `From<std::io::Error>` → `AppError` with `code: "IO_ERROR"` and the io error message
  - [x] Implement `std::fmt::Display` for `AppError` (required by Tauri's setup hook error type)
  - [x] Implement `std::error::Error` for `AppError`
  - [x] See Dev Notes for the exact code

- [x] Task 3: Create `src-tauri/migrations/001_initial_schema.sql` (AC: #2)
  - [x] Create the `settings` table — see Dev Notes for exact DDL
  - [x] Note: `schema_version` is bootstrapped by the migration runner; not in migration SQL to avoid conflict with bootstrap

- [x] Task 4: Create migration runner in `src-tauri/src/migrations.rs` (AC: #2, #3)
  - [x] Declare `MIGRATIONS` as a static slice of `(&str, &str)` tuples: `(version_str, include_str!("../migrations/001_initial_schema.sql"))`
  - [x] `pub fn run_migrations(conn: &rusqlite::Connection) -> Result<(), AppError>`
  - [x] Bootstrap step: `CREATE TABLE IF NOT EXISTS schema_version (...)` — always runs first
  - [x] Read current max version: `SELECT COALESCE(MAX(version), 0) FROM schema_version`
  - [x] For each migration where `migration_version > current_version`: open a `conn.unchecked_transaction()`, run the SQL via `tx.execute_batch(sql)`, insert version record, commit
  - [x] On any error: transaction is automatically rolled back; propagate `AppError`
  - [x] Add `#[cfg(test)]` module — see Dev Notes for test code

- [x] Task 5: Create `src-tauri/src/db.rs` — DB initialization (AC: #1, #4)
  - [x] `pub fn init_database(db_path: &std::path::Path) -> Result<rusqlite::Connection, AppError>`
  - [x] Open connection: `rusqlite::Connection::open(db_path)?`
  - [x] Enable WAL: `conn.execute_batch("PRAGMA journal_mode=WAL;")?`
  - [x] Run integrity check: `PRAGMA integrity_check` — if result != `"ok"` return `AppError { code: "DB_INTEGRITY_FAIL", ... }`
  - [x] Run migration runner: `migrations::run_migrations(&conn)?`
  - [x] Return `conn`

- [x] Task 6: Wire DB state and commands in `src-tauri/src/lib.rs` (AC: #1, #2, #5)
  - [x] Add `pub mod error;`, `pub mod db;`, `pub mod migrations;`, `pub mod commands;`
  - [x] Define `pub struct DbState(pub std::sync::Mutex<rusqlite::Connection>);`
  - [x] In `run()`, add `.setup(|app| { ... })` before `.invoke_handler()`
  - [x] In setup: resolve `app_local_data_dir()`, create dir if absent, call `db::init_database()`, call `app.manage(DbState(Mutex::new(conn)))`
  - [x] Register `commands::get_db_status` in `tauri::generate_handler![]`

- [x] Task 7: Create `src-tauri/src/commands/mod.rs` with `get_db_status` (AC: #5)
  - [x] `pub mod commands;` folder: create `src/commands/mod.rs`
  - [x] Implement `get_db_status` command — returns `Result<serde_json::Value, AppError>` with current schema version and `"status": "ok"`
  - [x] This command is the acceptance-criterion test harness; it is NOT a Zustand store action yet (that comes in Story 1.4)

- [x] Task 8: Create TypeScript `AppError` type in `src/lib/types.ts` (AC: #5)
  - [x] Export `interface AppError { code: string; message: string; }` — this is the canonical error type for all Tauri `invoke()` rejections across the entire app
  - [x] Add a comment: `// All Tauri commands reject with this shape. Import from here everywhere.`

- [x] Task 9: Write Cargo unit tests in `src-tauri/src/migrations.rs` (AC: #2, #3, #6)
  - [x] Test: fresh in-memory DB runs migrations and reports schema_version = 1
  - [x] Test: running migrations twice is idempotent (no error, version stays 1)
  - [x] Test: AppError serializes correctly via `serde_json::to_string`
  - [x] All 4 tests pass: `cargo test` → ok. 4 passed; 0 failed

## Dev Notes

### CRITICAL: Do NOT Use `tauri-plugin-sql` JS API

The architecture spec mentions `tauri-plugin-sql` as the SQLite mechanism, but also states **"React never constructs SQL"** and **"Rust = SQLite access."** `tauri-plugin-sql` is a JavaScript-facing plugin designed for `db.execute('INSERT INTO...')` calls from React — the exact anti-pattern the architecture prohibits.

**This story uses `rusqlite` directly on the Rust side.** This is the correct implementation for the typed-command pattern where React only calls `invoke('command_name', { typed_args })` and Rust handles all SQL. No `@tauri-apps/plugin-sql` JS import. No `Database.load()`. All SQL lives in Rust.

---

### Exact `Cargo.toml` Change

Add one line to `[dependencies]` in `src-tauri/Cargo.toml`:

```toml
[dependencies]
tauri = { version = "2", features = [] }
tauri-plugin-opener = "2"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
rusqlite = { version = "0.32", features = ["bundled"] }
```

The `bundled` feature statically links SQLite into the binary — no system SQLite required. This is critical for Windows deployment where system SQLite is not guaranteed.

---

### `src-tauri/src/error.rs` — Complete Code

```rust
use std::fmt;

#[derive(Debug, serde::Serialize)]
pub struct AppError {
    pub code: String,
    pub message: String,
}

impl fmt::Display for AppError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "[{}] {}", self.code, self.message)
    }
}

impl std::error::Error for AppError {}

impl From<rusqlite::Error> for AppError {
    fn from(e: rusqlite::Error) -> Self {
        AppError {
            code: "DB_ERROR".to_string(),
            message: e.to_string(),
        }
    }
}

impl From<std::io::Error> for AppError {
    fn from(e: std::io::Error) -> Self {
        AppError {
            code: "IO_ERROR".to_string(),
            message: e.to_string(),
        }
    }
}
```

**All future Tauri commands use `AppError` as their error type.** Never return `String` as the error type — React can't type-narrow a plain string error.

---

### `src-tauri/migrations/001_initial_schema.sql` — Exact DDL

```sql
-- Migration 001: Initial Schema
-- Creates: schema_version (version tracking), settings (app configuration)

CREATE TABLE schema_version (
  version    INTEGER PRIMARY KEY,
  applied_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE settings (
  id                  INTEGER PRIMARY KEY CHECK (id = 1),
  pay_frequency       TEXT,
  pay_dates           TEXT,
  savings_target_pct  INTEGER NOT NULL DEFAULT 10,
  data_folder_path    TEXT,
  onboarding_complete INTEGER NOT NULL DEFAULT 0,
  created_at          TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at          TEXT    NOT NULL DEFAULT (datetime('now'))
);
```

**Schema notes:**
- `settings.id CHECK (id = 1)` — enforces single-row; INSERT fails if a second row is attempted
- `pay_dates TEXT` — stores JSON string (e.g., `["1","15"]` for twice-monthly); parsed in Rust, never raw JSON in React
- `savings_target_pct INTEGER DEFAULT 10` — whole percentage (10 = 10%); NOT cents
- `onboarding_complete INTEGER DEFAULT 0` — 0 = false, 1 = true (SQLite boolean pattern per architecture)
- Dates use `DEFAULT (datetime('now'))` — ISO 8601 UTC, consistent with architecture date convention
- Do NOT use `IF NOT EXISTS` — migration runner guarantees each migration runs exactly once

---

### `src-tauri/src/migrations.rs` — Complete Code

```rust
use crate::error::AppError;

/// Each entry: (migration_version: i64, sql: &str)
const MIGRATIONS: &[(i64, &str)] = &[
    (1, include_str!("../migrations/001_initial_schema.sql")),
];

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
        assert_eq!(version, 1, "schema_version should be 1 after first migration");
    }

    #[test]
    fn test_migrations_are_idempotent() {
        let conn = fresh_conn();
        run_migrations(&conn).expect("first run should succeed");
        run_migrations(&conn).expect("second run should also succeed (idempotent)");

        let version: i64 = conn
            .query_row("SELECT MAX(version) FROM schema_version", [], |row| row.get(0))
            .unwrap();
        assert_eq!(version, 1, "version should still be 1 after second run");
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
```

**Note on `unchecked_transaction()`**: rusqlite's `conn.transaction()` takes `&mut Connection`, but our setup passes `&Connection` from an immutable context. Use `conn.unchecked_transaction()` which works with `&Connection` — it starts a BEGIN immediately; `tx.commit()` commits, and dropping without commit auto-rolls back.

---

### `src-tauri/src/db.rs` — Complete Code

```rust
use crate::error::AppError;
use crate::migrations;

pub fn init_database(db_path: &std::path::Path) -> Result<rusqlite::Connection, AppError> {
    let conn = rusqlite::Connection::open(db_path)?;

    // Enable WAL mode for concurrent read safety (NFR5, NFR7)
    conn.execute_batch("PRAGMA journal_mode=WAL;")?;

    // Integrity check on every launch before any data access (Risk 1 mitigation)
    let integrity: String = conn.query_row("PRAGMA integrity_check", [], |row| row.get(0))?;
    if integrity != "ok" {
        return Err(AppError {
            code: "DB_INTEGRITY_FAIL".to_string(),
            message: format!(
                "Database integrity check failed: {}. The database may be corrupted.",
                integrity
            ),
        });
    }

    // Run pending migrations (FR40 — schema migration on version change)
    migrations::run_migrations(&conn)?;

    Ok(conn)
}
```

---

### `src-tauri/src/commands/mod.rs` — Complete Code

```rust
use crate::error::AppError;
use crate::DbState;
use tauri::State;

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
```

---

### `src-tauri/src/lib.rs` — Complete Replacement

```rust
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
        .invoke_handler(tauri::generate_handler![commands::get_db_status])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

**Critical**: The `.setup()` hook runs synchronously before the window opens. Any error returned from `setup` aborts the app cleanly with the error message — this is the correct behavior for migration failure (FR40: "failed upgrades abort cleanly").

---

### `src/lib/types.ts` — TypeScript AppError

```typescript
// All Tauri commands reject with this shape. Import from here everywhere.
// Matches the Rust AppError struct in src-tauri/src/error.rs.
export interface AppError {
  code: string;
  message: string;
}
```

**Usage pattern for all future Tauri `invoke()` calls:**
```typescript
import type { AppError } from '@/lib/types';

try {
  const result = await invoke<DbStatus>('get_db_status');
} catch (error) {
  const appError = error as AppError;
  console.error(`[${appError.code}] ${appError.message}`);
}
```

---

### File Structure After This Story

**New files:**
```
src-tauri/src/error.rs
src-tauri/src/db.rs
src-tauri/src/migrations.rs
src-tauri/src/commands/mod.rs
src-tauri/migrations/001_initial_schema.sql
src/lib/types.ts
```

**Modified files:**
```
src-tauri/Cargo.toml      — add rusqlite dependency
src-tauri/src/lib.rs      — complete replacement (add modules, DbState, setup hook)
```

**NOT modified:**
- `src-tauri/migrations/.gitkeep` — leave in place; git tracks the directory
- `src-tauri/tauri.conf.json` — no plugin config changes needed for rusqlite

---

### Context from Stories 1.1 and 1.2 (Completed)

**What exists in `src-tauri/src/lib.rs` right now:**
```rust
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```
Replace this file entirely. Do NOT preserve the empty `invoke_handler![]`.

**What exists in `src-tauri/Cargo.toml` right now:**
```toml
[dependencies]
tauri = { version = "2", features = [] }
tauri-plugin-opener = "2"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
```
Add `rusqlite` only — do not change any other dependency.

**What `src-tauri/migrations/` contains:** only `.gitkeep`. Create `001_initial_schema.sql` alongside it.

**No frontend changes affect this story** — `src/App.tsx`, `src/styles.css`, and all design system files from Story 1.2 are untouched.

---

### Scope Boundaries — What This Story Does NOT Include

- **`tauri-plugin-sql`** — not used; `rusqlite` bundled is the correct implementation
- **Zustand stores** — Story 1.4 scaffolds all six stores. This story does NOT create any store.
- **TanStack Router** — Story 1.4. No routing changes.
- **`useSettingsStore`** — Story 1.4. `src/lib/types.ts` is the only frontend file added here.
- **Sentinel lock file** — Story 1.7. The DB path here (app local data dir) is a pre-onboarding placeholder; lock file logic is deferred.
- **Onboarding / data folder picker** — Story 1.5 updates the DB path. This story hardcodes `app_local_data_dir()`.
- **User-facing error UI** — Stories 1.4+ wire errors into Zustand. This story only ensures errors surface via the setup hook (app won't start on DB failure).
- **`noUncheckedIndexedAccess` in tsconfig** — deferred to before Story 2.1 per code review notes from Story 1.2.

---

### Architecture Compliance Checklist

- [ ] All monetary amounts stored as INTEGER cents — `savings_target_pct` is a percentage not cents; all future amount columns will use INTEGER cents per architecture
- [ ] Dates as ISO 8601 UTC TEXT — `DEFAULT (datetime('now'))` complies
- [ ] Booleans as INTEGER 0/1 — `onboarding_complete INTEGER DEFAULT 0` complies
- [ ] SQLite table names: plural snake_case — `schema_version`, `settings` comply
- [ ] Column names: snake_case — `pay_frequency`, `data_folder_path`, etc. comply
- [ ] `AppError` shape: `code: String`, `message: String` — complies with ADR-3
- [ ] Components never call `invoke()` directly — `get_db_status` is not yet wired to any component; that's Story 1.4

---

### References

- SQLite WAL mode: [Architecture — Architectural Risk Register — Risk 1]
- `PRAGMA integrity_check` on launch: [Architecture — Risk 1 Mitigation]
- AppError shape: [Architecture — Format Patterns — Tauri Command Response]
- Migration runner approach: [Architecture — Data Architecture — Schema Migrations]
- Financial amounts as INTEGER cents: [Architecture — Format Patterns — Financial Amounts]
- Feature FR39 (atomic writes): [Epics.md — Additional Requirements]
- Feature FR40 (migration abort-on-failure): [Epics.md — Additional Requirements]
- `settings` table is the single data store for all config: [Architecture — ADR-1: Single Data Store]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6 (2026-04-06)

### Debug Log References

- Migration test failure: `001_initial_schema.sql` originally included `CREATE TABLE schema_version` which conflicted with the bootstrap step in `run_migrations` (which creates it with `IF NOT EXISTS`). Fixed by removing `schema_version` from the migration SQL — the bootstrap owns that table, migration 001 only creates `settings`.

### Completion Notes List

- Implemented full SQLite backend with WAL mode, integrity check on launch, and transactional migration runner.
- `AppError { code, message }` is the canonical error type for all Tauri commands — matches ADR-3.
- Migration runner uses `unchecked_transaction()` (works with `&Connection`, auto-rollbacks on drop).
- `get_db_status` command returns `{ schema_version, status: "ok" }` — available for React testing via `invoke()`.
- TypeScript `AppError` interface in `src/lib/types.ts` is the single canonical import for all Tauri error handling.
- All 4 cargo unit tests pass (fresh DB, idempotency, settings table creation, AppError serialization).

### File List

- `src-tauri/Cargo.toml` (modified — added rusqlite 0.32 bundled)
- `src-tauri/src/lib.rs` (modified — complete replacement with modules, DbState, setup hook)
- `src-tauri/src/error.rs` (new)
- `src-tauri/src/db.rs` (new)
- `src-tauri/src/migrations.rs` (new, includes unit tests)
- `src-tauri/src/commands/mod.rs` (new)
- `src-tauri/migrations/001_initial_schema.sql` (new)
- `src/lib/types.ts` (new)

### Review Findings

- [x] [Review][Patch] AC6: Add `upsert_settings` write command — AC6 requires a write command to prove transaction rollback behavior; `get_db_status` is read-only and cannot demonstrate this [`src-tauri/src/commands/mod.rs`]
- [x] [Review][Patch] WAL mode return value never validated — PRAGMA returns the active mode; silent fallback to DELETE mode is possible on read-only volumes [`src-tauri/src/db.rs`]
- [x] [Review][Patch] `integrity_check` reads only the first row — multi-page corruption can pass the check if the first row is "ok" [`src-tauri/src/db.rs`]
- [x] [Review][Patch] CRITICAL: Migration SQL uses `CREATE TABLE` without `IF NOT EXISTS` — if the process crashes after schema_version bootstrap DDL but before the version INSERT, the next launch re-runs migration 1 and fails permanently with "table already exists" [`src-tauri/migrations/001_initial_schema.sql`]
- [x] [Review][Patch] No assertion that MIGRATIONS array is in ascending version order — out-of-order entries are silently skipped [`src-tauri/src/migrations.rs`]
- [x] [Review][Patch] No busy timeout on SQLite connection — a hung query holds the Mutex indefinitely, blocking all subsequent Tauri commands [`src-tauri/src/db.rs`]
- [x] [Review][Patch] `savings_target_pct` has no range CHECK constraint — values outside 0–100 accepted silently [`src-tauri/migrations/001_initial_schema.sql`]
- [x] [Review][Patch] `onboarding_complete` has no `CHECK (onboarding_complete IN (0, 1))` constraint [`src-tauri/migrations/001_initial_schema.sql`]
- [x] [Review][Defer] `updated_at` column never refreshed after row update — no trigger or write commands in this story [deferred, pre-existing]
- [x] [Review][Defer] Migration MAX(version) logic skips back-filled versions — only 1 migration currently; real risk surfaces when migrations 2+ are added [deferred, pre-existing]
- [x] [Review][Defer] Poisoned Mutex has no recovery path — low probability in single-user desktop app [deferred, pre-existing]
- [x] [Review][Defer] `get_db_status` returns opaque DB_ERROR if schema_version is absent — theoretical; command unreachable before setup completes [deferred, pre-existing]
- [x] [Review][Defer] Single Mutex serializes all DB operations — WAL concurrency benefit negated — design choice per spec (connection pool deferred) [deferred, pre-existing]
- [x] [Review][Defer] Raw rusqlite error messages forwarded to frontend — acceptable risk for single-user desktop app; revisit before any telemetry integration [deferred, pre-existing]

## Change Log

- 2026-04-06: Story 1.3 created — SQLite infrastructure, migration runner, AppError pattern.
- 2026-04-06: Story 1.3 implemented — all tasks complete, 4/4 tests passing, status → review.
- 2026-04-06: Code review complete — 8 patches applied, 6 deferred, 7 dismissed. Status → done.
