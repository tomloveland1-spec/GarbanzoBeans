/// Sentinel lock file helpers.
///
/// The sentinel file (`garbanzobeans.lock`) in the user's data folder
/// prevents two app instances from writing to the same SQLite database
/// simultaneously.
///
/// Lifecycle:
///   1. First-time onboarding: `init_data_folder` writes the sentinel.
///   2. Normal close: `release` deletes it + `wal_checkpoint` flushes WAL.
///   3. Subsequent launches: `check_and_acquire` writes it if absent
///      (read-write), or detects it and returns read-only if already present.

/// Atomically claim the sentinel lock file.
///
/// Uses `create_new` (O_CREAT | O_EXCL) so the check and claim are a single syscall,
/// eliminating the TOCTOU race between a separate exists() check and a write().
///
/// Returns `false` (read-write) if this instance successfully created the file.
/// Returns `true` (read-only) if the file already exists (another instance owns it)
/// or if any I/O error prevents creation (safe default).
pub fn check_and_acquire(lock_path: &std::path::Path) -> bool {
    use std::io::Write;
    match std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(lock_path)
    {
        Ok(mut f) => {
            let _ = f.write_all(b"locked\n");
            false // we created the file — we own the lock → read-write
        }
        Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => true, // another instance owns it
        Err(_) => true, // I/O error → fail safe (read-only)
    }
}

/// Delete the sentinel lock file. Best-effort; errors are ignored.
pub fn release(lock_path: &std::path::Path) {
    let _ = std::fs::remove_file(lock_path);
}

/// Flush the WAL to the main database file. Best-effort; errors are ignored.
pub fn wal_checkpoint(conn: &rusqlite::Connection) {
    let _ = conn.execute_batch("PRAGMA wal_checkpoint(TRUNCATE)");
}
