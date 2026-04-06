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
