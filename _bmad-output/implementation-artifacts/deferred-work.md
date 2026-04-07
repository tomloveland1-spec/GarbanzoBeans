# Deferred Work

## Deferred from: code review of 1-1-project-scaffold-running-tauri-react-app (2026-04-04)

- **CSP is null** — `tauri.conf.json` has `"csp": null`. Needs a proper restrictive CSP before any public release. Complex to configure correctly for Tauri v2 + Vite dev server. Defer to Story 1.9 (Release Pipeline).
- **Windows-only CI matrix** — CI only runs on `windows-latest`. macOS/Linux builds not tested. Per architecture spec, macOS support is post-MVP. Add matrix when cross-platform work begins.
- **No lint in CI** — No `eslint` (frontend) or `cargo clippy` (Rust) step in the push/PR workflow. Add before first feature story lands.
- **`noUncheckedIndexedAccess` missing from tsconfig** — `strict: true` doesn't enable this. For a financial data app, array index access returning `T` instead of `T | undefined` is a silent error source. Add to `tsconfig.json` before Story 2.1 (first data model).
- **Placeholder icon files** — `src-tauri/icons/` contains 1×1 placeholder PNGs and a minimal 16×16 monochrome ICO. Need real branded icons before any public release or installer build. Defer to Story 1.9 (Release Pipeline).

## Deferred from: code review of 1-2-design-system-foundation-dark-forest-token-set (2026-04-06)

- **Google Fonts network dependency in Tauri app** — Roboto loaded from `fonts.googleapis.com` at runtime; fails silently offline. Per-spec (Task 1 specifies the Google Fonts link), but a local-first finance app should bundle the font. Consider bundling Roboto in a future story before public release.
- **Nav sidebar buttons have no active/selected state** — All four nav items render identically with no active indicator. Intentional placeholder; Story 1.4 replaces these with TanStack Router `<Link>` components that will handle active state.
- **Progress indeterminate state undetectable** — `value || 0` collapses `null`/`undefined` into same visual as `value={0}`. No indeterminate requirement exists in this story; revisit if a loading indicator is ever needed.
- **Google Fonts `<link>` missing `rel="preload"`** — The font stylesheet link is render-blocking with no preload hint. Minor performance issue; no spec requirement. Revisit if FOUT (flash of unstyled text) is observed.

## Deferred from: code review of 1-3-sqlite-infrastructure-database-migrations-and-atomic-writes (2026-04-06)

- **`updated_at` column never refreshed on row update** — `settings.updated_at` defaults to insert time and is never updated. No write commands exist in this story. Add an `AFTER UPDATE` trigger or application-layer update in Story 1.4 when write commands are introduced.
- **Migration MAX(version) logic skips back-filled versions** — The runner uses `MAX(version)` as the high-water mark. If a hotfix migration with a lower version number is added after a higher one is already applied, it is silently skipped forever. Only 1 migration currently; becomes a real risk when migrations 2+ are added. Consider switching to per-version membership checks before adding a second migration.
- **Poisoned Mutex has no recovery path** — If a thread panics while holding `DbState`'s Mutex, all subsequent DB commands return `DB_LOCK_POISON` permanently. Low probability in a single-user desktop app. Revisit if background threads are introduced.
- **`get_db_status` returns opaque DB_ERROR if `schema_version` absent** — If the command is somehow invoked before setup completes, the error code is indistinguishable from any other DB error. Theoretical given Tauri's setup guarantee; add a distinct `DB_NOT_INITIALIZED` code if background pre-fetch commands are added.
- **Single Mutex serializes all DB operations** — WAL mode is enabled for concurrent-read safety but the single `Mutex<Connection>` in `DbState` serializes every command. Connection pool (e.g., `r2d2` + `r2d2_sqlite`) is the correct solution. Deferred as a design decision per spec; revisit before any story that introduces parallel DB access.
- **Raw rusqlite error messages forwarded to frontend** — `From<rusqlite::Error>` uses `e.to_string()` which can expose table names, column names, and SQL fragments. Acceptable for a single-user desktop app with no telemetry. Revisit before adding any crash reporting or remote logging.

## Deferred from: code review of 1-4-app-state-foundation-zustand-stores-tanstack-router (2026-04-06)

- **Root loader silently continues on `loadSettings` failure** — `loadSettings` catches all errors internally; root loader resolves successfully even if DB is unavailable. App proceeds with `settings: null` and no user feedback. Consistent with arch "errors in error field" pattern; error display UI deferred to feature stories.
- **AC5 `isWriting` UI suppression scaffold only** — `isWriting` flag is correctly scaffolded but no feature component yet consumes it to suppress UI updates. Full suppression pattern implemented when feature components arrive in Epics 2–6.
- **`upsert_settings` COALESCE cannot clear nullable fields** — `COALESCE(?1, existing_col)` means passing `null` for a nullable field preserves the existing value rather than clearing it. Moot if `upsert_settings` is removed per D2 decision; if kept, Story 1.5 must address NULL-clearing behavior.
- **`onboarding_complete` accepts non-canonical `Option<i64>` values** — `UpsertSettingsInput.onboarding_complete: Option<i64>` accepts any integer; no clamping to 0/1. Moot if `upsert_settings` removed; if kept, add validation in Story 1.5.
- **`savings_target_pct` INSERT default undefined when passed as None** — Fresh INSERT with `input.savings_target_pct = None` sends SQL NULL; behavior depends on schema constraint. Moot if `upsert_settings` removed; if kept, add explicit default or enforce NOT NULL in Story 1.5.

## Deferred from: code review of 1-5-onboarding-first-launch-setup (2026-04-06)

- **`loadSettings` sets `isWriting: true` for read operations** — Misleading flag name causes spurious "Saving…" spinner during reads. Pre-existing from Story 1.3; rename to `isLoading` or use separate flags in a future refactor story.
- **`upsert_settings` COALESCE prevents field nullification once set** — Acceptable for onboarding where all fields are always provided; spec documents this limitation. Story 1.6 (Settings Screen) must handle explicit clearing differently if needed.
- **`pastTwelveMonths` uses local time** — One-month shift at midnight/month-boundary for users in non-UTC zones. Low real-world impact; revisit if user-reported date confusion emerges.
- **E2E double `addInitScript` ordering** — `injectTauriMock` in `beforeEach` plus in-test `addInitScript` override on `__TAURI_INTERNALS__`. Playwright guarantees registration order so not currently broken; refactor into a single mock factory when E2E suite grows.
- **`budget_name` non-breaking space (U+00A0) passes `.trim()`** — Stored as invisible whitespace. Niche input edge case; add Unicode-aware trim in a future input hardening pass.
- **`guardTurnTheMonth` does not handle `'closed'` monthStatus** — Pre-existing from Story 1.4; no current story produces `'closed'` state. Address in Epic 6 (Turn the Month).
- **`unchecked_transaction` in migrations — theoretical interleave** — `unchecked_transaction()` does not verify no transaction is active. Not a bug given current call pattern (always autocommit); add a defensive assertion if background DB threads are introduced.
- **`guardOnboarding` exported from router module** — Exported to enable unit-test import; exposes an internal routing guard on the module's public surface. Refactor to a co-located `router.test.ts` if the module API surface needs to be tightened.

## Deferred from: Story 1.7 sentinel-lock-read-only-mode (2026-04-06)

- **`settings.spec.ts` navigate-away E2E test fails with "expected 30, received 10"** — `page.goto()` causes a full page reload; `addInitScript` re-runs with the original serialized settings, resetting the mock's in-memory `storedSettings`. The save mutation is lost on reload. Pre-existing failure (was already timing out before Story 1.7). Fix: use Playwright's `page.evaluate()` to mutate the live `__TAURI_INTERNALS__` mock after save, or add `get_read_only_state` to the mock and avoid reloads. [`e2e/settings.spec.ts:98`]
- **`e2e-integration/sentinel-lock.test.ts` is a stub** — Full WebdriverIO + tauri-driver setup required to run real two-instance sentinel detection against the built binary. Setup instructions documented in the stub file. Defer to Story 1.9 (Release Pipeline) when CI build infrastructure is in place. [`e2e-integration/sentinel-lock.test.ts`]

## Deferred from: code review of 1-7-sentinel-lock-read-only-mode (2026-04-06)

- **`isReadOnly` not refreshed if the other instance closes during the session** — `is_read_only` is frozen at startup; if the second instance closes mid-session, the first stays read-only until restarted. Spec acknowledges detection is init-only; add a session-refresh mechanism if this proves frustrating in practice. [`src-tauri/src/lib.rs:58-63`]
- **`.ok()` silently discards non-`QueryReturnedNoRows` rusqlite errors in sentinel query** — The `.optional().ok().flatten().flatten()` chain converts any rusqlite error (schema mismatch, I/O) to `None`, skipping the sentinel check and defaulting to read-write on a broken database. Low practical risk given current single-connection setup. [`src-tauri/src/lib.rs:47-56`]
- **E2E integration stub uses `browser.closeWindow()` which may not trigger Tauri `CloseRequested`** — The "deletes lock file after normal close" test calls `browser.closeWindow()` (WebdriverIO window-level); Tauri's `CloseRequested` event fires on OS-level close. The close handler may not run, making the test ineffective. Revisit when activating stub in Story 1.9. [`e2e-integration/sentinel-lock.test.ts:84`]

## Deferred from: code review of 1-8-auto-update-with-user-confirmation (2026-04-06)

- **WAL checkpoint silently skipped under lock contention** — `try_lock()` on `DbState` in `CloseRequested` handler silently skips `wal_checkpoint` if any command is in-flight. Data is not lost (WAL replay on next launch), but database stays non-checkpointed permanently under sustained contention. Pre-existing from Story 1-7 sentinel design. [`src-tauri/src/lib.rs:91`]
- **DataFolderState stale after `upsert_settings` changes data folder path** — `DataFolderState` is populated once at startup and never updated. If the user changes their data folder via Settings, the close handler calls `sentinel::release` on the old path, leaving the new path's lock file intact and causing next-launch read-only mode. Pre-existing from Story 1-7 sentinel design. [`src-tauri/src/lib.rs:69`]
- **Sentinel latent trap — DataFolderState stored unconditionally for read-only instances** — Path is managed unconditionally; correctness of not releasing the sentinel depends entirely on the `!is_read_only` guard remaining intact. A future refactor weakening that guard would silently release a lock owned by another instance. Pre-existing from Story 1-7 sentinel design. [`src-tauri/src/lib.rs:105`]

## Deferred from: code review of 2-1-envelope-schema-data-model (2026-04-06)

- **Implicit transaction rollback without explicit rollback** — rusqlite correctly rolls back on drop, but the absence of an explicit `tx.rollback()` before early-return errors is a copy-paste trap. If future inner functions perform multiple writes before a `changes()` check, partial writes will silently roll back. [`src-tauri/src/commands/mod.rs`]
- **`isWriting` used for `loadEnvelopes` read operation** — `loadEnvelopes` sets `isWriting: true` for a SELECT, not a mutation. Any UI disabling write controls on `isWriting` will incorrectly block creates/updates during a read. Pre-existing pattern; same as `loadSettings`. Consider renaming to `isBusy` or adding a separate `isLoading` in a future refactor. [`src/stores/useEnvelopeStore.ts`]
- **`loadEnvelopes` fires on every navigation in `beforeLoad`** — `rootRoute.beforeLoad` runs on every navigation, re-fetching all envelopes on every route change. Consistent with `loadSettings` pattern per spec; revisit if list grows or a staleness check is needed. [`src/router.tsx`]
- **Rollback snapshot stale on concurrent writes** — `prev` snapshot captured before optimistic update; if a concurrent write completes between snapshot and error, the rollback overwrites the intervening result. Mitigated by `isWriting` UI guard per spec; revisit if any code path bypasses the guard. [`src/stores/useEnvelopeStore.ts`]
- **Whitespace name renders blank during optimistic window** — A whitespace-only name passes into the optimistic update and displays as blank before Rust rejects it and the store rolls back. Correct end state; brief visual artifact only. [`src/stores/useEnvelopeStore.ts`]
- **`unchecked_transaction()` bypasses borrow-check transaction safety** — Required by `&Connection` signatures used for testability; safe under current single-connection setup. Revisit if helpers are refactored to accept `&mut Connection`. [`src-tauri/src/commands/mod.rs`]
- **`update_envelope` COALESCE cannot clear `month_id` to NULL** — `month_id = COALESCE(?6, month_id)` treats `None` as "no change"; there is no way to explicitly null-out `month_id`. TypeScript optimistic update applies `null` locally, so store and DB diverge on a clear operation. Zero practical impact until month assignment UI is built (Epic 2.4+). **Requires an explicit fix when month assignment feature is implemented — Epic 6 FK wiring alone will not resolve this.** [`src-tauri/src/commands/mod.rs`, `src/stores/useEnvelopeStore.ts`]

## Deferred from: code review of 2-2-create-and-manage-envelopes (2026-04-06)

- **FK constraint errors on `DELETE` surface as generic rusqlite errors** — Once Epic 6 enables `PRAGMA foreign_keys = ON`, deleting an envelope with child rows will raise a constraint error with no domain-specific code (no `CONSTRAINT_VIOLATION` or similar). `delete_envelope_inner` has no match on error type. [`src-tauri/src/commands/mod.rs`]
- **All-`None` `UpdateEnvelopeInput` performs a no-op UPDATE that returns success** — Calling `update_envelope_inner` with only `id` set (all other fields `None`) runs a COALESCE no-op, returns `changes()=1`, and returns the unchanged envelope as if it was updated. Semantic oddity; no visible bug today. [`src-tauri/src/commands/mod.rs`]
- **`aria-label="Envelope settings"` on ⋯ button is misleading** — Button only opens a delete confirmation dialog, not a settings panel. Screen reader users will be confused. Minor UX debt. [`src/features/envelopes/EnvelopeCard.tsx`]
- **`formatCurrency` silently renders `NaN`/`Infinity` for corrupt `allocatedCents`** — `Intl.NumberFormat.format(NaN/100)` renders `"NaN"` in the UI. No guard or test for this case. [`src/lib/currency.ts`]

## Deferred from: code review of 1-6-settings-screen-update-configuration-anytime (2026-04-06)

- **`useState` stale on async settings load** — All form state initialized from `settings` at first render; if store updates while component is mounted, form won't reflect changes. Mitigated by `guardOnboarding()` ensuring `settings` is non-null before `/settings` is reachable; unmount/remount pattern is intentional per spec (AC4). [`src/features/settings/SettingsPage.tsx`]
- **`handleSave` concurrent invocation race** — `isWriting` store flag prevents double-submit in most cases, but flag update is not guaranteed before a second synchronous click event. Theoretical; pre-existing pattern used throughout the codebase. [`src/features/settings/SettingsPage.tsx`]
- **`buildPayDates` accepts empty strings with no internal guard** — A pure utility function with no defensive validation; relies entirely on caller's `isSaveDisabled` check. By design (pure transform); no call site bypasses the guard. [`src/lib/pay-dates.ts`]
- **E2E test doesn't assert `upsert_settings` called with correct payload** — The navigate-away-and-return test verifies user-visible behavior but not the persistence contract. A no-op `upsertSettings` that cached in memory would still pass. Minor coverage gap. [`e2e/settings.spec.ts`]
- **`parsePayDates` format mismatch produces silent empty fields** — If stored `payFrequency` / `payDatesJson` format diverges (e.g., from a manual DB edit or a future migration), `parsePayDates` returns empty strings with no user explanation. Defensive fallback behavior; no mismatched data is written by the current codebase. [`src/lib/pay-dates.ts`]
