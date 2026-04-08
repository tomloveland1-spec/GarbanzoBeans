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
///
/// Stale lock recovery:
///   The lock file contains the owning process PID. If the file exists but the
///   PID is no longer running (i.e. the previous instance was killed without a
///   clean close), the lock is considered stale and this instance claims it.

/// Check whether a PID corresponds to a running process.
/// Uses only `std` — no additional dependencies required.
fn pid_is_running(pid: u32) -> bool {
    #[cfg(target_os = "windows")]
    {
        // On Windows: attempt to open the process with SYNCHRONIZE (0x00100000).
        // If OpenProcess returns a non-null handle, the process is alive.
        // We call CloseHandle to avoid a handle leak.
        extern "system" {
            fn OpenProcess(desired_access: u32, inherit_handle: i32, pid: u32) -> isize;
            fn CloseHandle(handle: isize) -> i32;
        }
        const SYNCHRONIZE: u32 = 0x00100000;
        // SAFETY: standard Windows API with well-defined semantics.
        let handle = unsafe { OpenProcess(SYNCHRONIZE, 0, pid) };
        if handle == 0 {
            return false;
        }
        unsafe { CloseHandle(handle) };
        true
    }
    #[cfg(not(target_os = "windows"))]
    {
        // On Unix: /proc/<pid> exists iff the process is alive.
        std::path::Path::new(&format!("/proc/{}", pid)).exists()
    }
}

/// Atomically claim the sentinel lock file.
///
/// Uses `create_new` (O_CREAT | O_EXCL) so the check and claim are a single syscall,
/// eliminating the TOCTOU race between a separate exists() check and a write().
///
/// Returns `false` (read-write) if this instance successfully created the file.
/// Returns `true` (read-only) if the file exists AND its PID is still running.
/// Reclaims a stale lock (dead PID) and returns `false` (read-write).
pub fn check_and_acquire(lock_path: &std::path::Path) -> bool {
    use std::io::Write;
    let my_pid = std::process::id();

    match std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(lock_path)
    {
        Ok(mut f) => {
            let _ = write!(f, "{}\n", my_pid);
            false // we created the file — we own the lock → read-write
        }
        Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => {
            // File exists — check if the owning PID is still alive.
            let stale = match std::fs::read_to_string(lock_path) {
                Ok(contents) => {
                    let owner_pid: Option<u32> = contents.trim().parse().ok();
                    match owner_pid {
                        Some(pid) => !pid_is_running(pid),
                        None => true, // unreadable PID — treat as stale
                    }
                }
                Err(_) => true, // can't read the file — treat as stale
            };

            if stale {
                // Reclaim: overwrite with our PID.
                if let Ok(mut f) = std::fs::OpenOptions::new()
                    .write(true)
                    .truncate(true)
                    .open(lock_path)
                {
                    let _ = write!(f, "{}\n", my_pid);
                }
                false // stale lock reclaimed → read-write
            } else {
                true // live owner → read-only
            }
        }
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
