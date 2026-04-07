# Story 1.8: Auto-Update with User Confirmation

Status: done

## Story

As Tom,
I want the app to check for updates on launch and ask me before installing anything,
So that I'm always on the latest version but never surprised by a silent update.

## Acceptance Criteria

1. **Given** the app launches and a new version is available at the GitHub Releases update manifest **when** `tauri-plugin-updater` detects the update **then** a non-modal inline prompt is shown in the app shell: version number and "Update now?" with a Primary Confirm button and a Ghost Decline button (FR37)

2. **Given** the update prompt is shown **when** the user confirms the update **then** the update downloads, installs, and the app relaunches; the prompt does not appear again for the same version

3. **Given** the update prompt is shown **when** the user declines **then** the app continues normally; the prompt does not appear again in the current session (FR38)

4. **Given** the update check fails (no network, manifest unreachable, or invalid signature) **when** the failure occurs **then** the app continues loading normally; no error or prompt is shown to the user; the failure is logged to console only in development builds (NFR15)

## Tasks / Subtasks

- [x] Task 1: Add dependencies and configure updater plugin
  - [x] Add `tauri-plugin-updater = "2"` and `tauri-plugin-process = "2"` to `src-tauri/Cargo.toml`
  - [x] Add `@tauri-apps/plugin-updater` and `@tauri-apps/plugin-process` to `package.json` dependencies
  - [x] Register both plugins in `src-tauri/src/lib.rs`: `.plugin(tauri_plugin_updater::Builder::new().build())` and `.plugin(tauri_plugin_process::init())`
  - [x] Add updater config to `src-tauri/tauri.conf.json` under `plugins.updater`: `endpoints` array + `pubkey` placeholder + `dialog: false`

- [x] Task 2: Create `useUpdateStore` Zustand slice
  - [x] Create `src/stores/useUpdateStore.ts` with state: `{ pendingUpdate: { version: string } | null, isDismissed: boolean, isInstalling: boolean }`
  - [x] Add action `checkForUpdate(): Promise<void>` — calls JS API `check()`, sets `pendingUpdate` if update found; catches all errors and fails silently (logs in dev only)
  - [x] Add action `dismissUpdate(): void` — sets `isDismissed: true`; prompt will not show again this session
  - [x] Add action `applyUpdate(): Promise<void>` — sets `isInstalling: true`; calls `downloadAndInstall()` then `relaunch()`; catches errors silently

- [x] Task 3: Wire `checkForUpdate()` into app startup
  - [x] Add `useEffect` in `src/App.tsx` that calls `useUpdateStore.getState().checkForUpdate()` once on mount (NOT in `beforeLoad` — update check is a network call and must not block route rendering)
  - [x] The `useEffect` runs only on app shell mount (not on onboarding path — guard with `!isOnboarding`)

- [x] Task 4: Build update prompt UI in `App.tsx`
  - [x] Read `pendingUpdate` and `isDismissed` from `useUpdateStore` in `App.tsx`
  - [x] Render inline update prompt in the main content area, below the read-only banner, when `pendingUpdate && !isDismissed`
  - [x] Prompt shows: "v{version} available — " text + "Update Now" Primary button + "Later" Ghost button
  - [x] "Update Now" button: calls `applyUpdate()`; shows "Installing…" text while `isInstalling` is true; disabled during install
  - [x] "Later" button: calls `dismissUpdate()`
  - [x] Add `data-testid="update-prompt"` on the container; `data-testid="update-confirm-button"` and `data-testid="update-dismiss-button"` on buttons

- [x] Task 5: Write Vitest unit tests
  - [x] Create `src/stores/useUpdateStore.test.ts` — test: `checkForUpdate` sets pendingUpdate when update found; `checkForUpdate` sets no state on error (silent fail); `dismissUpdate` sets isDismissed; `applyUpdate` sets isInstalling
  - [x] Add `App.tsx` render tests to `src/App.update.test.tsx` — test: update prompt shown when pendingUpdate set and not dismissed; prompt not shown when dismissed; confirm and dismiss buttons present

- [x] Task 6: Write Playwright E2E tests
  - [x] Create `e2e/update-prompt.spec.ts` — inject Tauri mock returning a fake update; verify prompt appears; verify "Later" hides prompt; verify prompt absent when no update

## Dev Notes

---

### Dependency Installation

**Rust — `src-tauri/Cargo.toml`:**
```toml
tauri-plugin-updater = "2"
tauri-plugin-process = "2"
```

**JavaScript — run in project root:**
```
npm install @tauri-apps/plugin-updater @tauri-apps/plugin-process
```

**Expected installed versions:** `@tauri-apps/plugin-updater` ^2.x, `@tauri-apps/plugin-process` ^2.x

---

### Plugin Registration — `src-tauri/src/lib.rs`

Add to the builder chain (alongside existing `tauri_plugin_dialog` and `tauri_plugin_opener`):

```rust
tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_opener::init())
    .plugin(tauri_plugin_updater::Builder::new().build())
    .plugin(tauri_plugin_process::init())
    .setup(|app| { ... })
```

---

### Updater Config — `src-tauri/tauri.conf.json`

Add a `plugins` key at the top level (alongside `bundle`, `app`, `build`):

```json
{
  "plugins": {
    "updater": {
      "endpoints": [
        "https://github.com/tomloveland1-spec/GarbanzoBeans/releases/latest/download/update-manifest.json"
      ],
      "dialog": false,
      "pubkey": "PLACEHOLDER_PUBKEY_SET_BY_STORY_1_9"
    }
  }
}
```

- `dialog: false` — disables the built-in Tauri update dialog; we handle UI ourselves
- `pubkey` — placeholder until Story 1.9 generates the signing keypair; the updater will fail signature verification gracefully (AC4 — fail gracefully)
- The endpoint URL is the GitHub Releases manifest that Story 1.9 will publish

**Note:** With a placeholder pubkey, every update check in dev will produce a signature error and fail silently — this is the correct AC4 behavior. Do not try to make the check succeed in dev; it's OK for it to always fail in the current environment.

---

### `useUpdateStore` Implementation

```typescript
// src/stores/useUpdateStore.ts
import { create } from 'zustand';
import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';

interface UpdateState {
  pendingUpdate: { version: string } | null;
  isDismissed: boolean;
  isInstalling: boolean;

  checkForUpdate: () => Promise<void>;
  dismissUpdate: () => void;
  applyUpdate: () => Promise<void>;
}

export const useUpdateStore = create<UpdateState>((set, get) => ({
  pendingUpdate: null,
  isDismissed: false,
  isInstalling: false,

  checkForUpdate: async () => {
    try {
      const update = await check();
      if (update) {
        set({ pendingUpdate: { version: update.version } });
      }
    } catch (err) {
      // Fail silently — NFR15: update check failures must not impact app function
      if (import.meta.env.DEV) {
        console.warn('[updater] check failed:', err);
      }
    }
  },

  dismissUpdate: () => set({ isDismissed: true }),

  applyUpdate: async () => {
    set({ isInstalling: true });
    try {
      const update = await check();
      if (update) {
        await update.downloadAndInstall();
        await relaunch();
      }
    } catch (err) {
      if (import.meta.env.DEV) {
        console.warn('[updater] install failed:', err);
      }
      set({ isInstalling: false });
    }
  },
}));
```

**Important:** `applyUpdate` re-calls `check()` because the `Update` object returned by the initial `check()` cannot be serialized into Zustand state (it's a class instance with methods, not a plain object). The second `check()` fetches fresh update metadata.

---

### `App.tsx` Wiring

**Read store values:**
```typescript
import { useUpdateStore } from '@/stores/useUpdateStore';

function App() {
  const isReadOnly = useSettingsStore((s) => s.isReadOnly);
  const { pendingUpdate, isDismissed, isInstalling, checkForUpdate, dismissUpdate, applyUpdate } = useUpdateStore();
  const isOnboarding = useRouterState({ select: (s) => s.location.pathname === '/onboarding' });

  // Check for updates once on non-onboarding mount
  useEffect(() => {
    if (!isOnboarding) {
      useUpdateStore.getState().checkForUpdate();
    }
  }, [isOnboarding]);
  // ...
}
```

**Update prompt JSX** (place below read-only banner, above `<Outlet />`):
```tsx
{pendingUpdate && !isDismissed && (
  <div
    data-testid="update-prompt"
    className="shrink-0 flex items-center justify-between px-4 py-2"
    style={{
      backgroundColor: 'var(--color-bg-surface)',
      borderBottom: '1px solid var(--color-border)',
    }}
  >
    <span className="type-label" style={{ color: 'var(--color-text-primary)' }}>
      v{pendingUpdate.version} available
    </span>
    <div className="flex gap-2">
      <Button
        size="sm"
        onClick={applyUpdate}
        disabled={isInstalling}
        data-testid="update-confirm-button"
      >
        {isInstalling ? 'Installing…' : 'Update Now'}
      </Button>
      <Button
        size="sm"
        variant="ghost"
        onClick={dismissUpdate}
        disabled={isInstalling}
        data-testid="update-dismiss-button"
      >
        Later
      </Button>
    </div>
  </div>
)}
```

**Prompt placement in layout:**
```
main content area
  ├── [read-only banner — shown when isReadOnly]
  ├── [update prompt — shown when pendingUpdate && !isDismissed]  ← new
  └── <div flex-1 overflow-auto><Outlet /></div>
```

---

### Mocking in Tests

**Vitest — mock the updater JS module:**
```typescript
vi.mock('@tauri-apps/plugin-updater', () => ({
  check: vi.fn(),
}));
vi.mock('@tauri-apps/plugin-process', () => ({
  relaunch: vi.fn(),
}));
```

**Playwright — mock via `__TAURI_INTERNALS__`:**
In `e2e/update-prompt.spec.ts`, add `get_updater_available` or intercept `check` via the Tauri mock. The simplest approach: set up a mock that returns a fake update object when `check` is called.

Since `check()` uses Tauri IPC under the hood, you can mock it by injecting into `__TAURI_INTERNALS__.invoke` similar to other E2E mocks in this project:

```typescript
await page.addInitScript(() => {
  (window as any).__TAURI_INTERNALS__ = {
    invoke: async (cmd: string) => {
      if (cmd === 'plugin:updater|check') return { version: '1.2.3', body: '', date: '' };
      // ... other commands
    },
    // ... rest of mock
  };
});
```

Check the exact IPC command name for the updater plugin. If mocking at this level proves unreliable, an alternative is to add an `import.meta.env.VITE_MOCK_UPDATE_VERSION` env variable checked in `checkForUpdate()` so tests can inject a fake version without deep Tauri mocking.

---

### UX Constraints (Dark Forest Design System)

- **No modal** — the prompt is an inline bar in the app shell (same layer as the read-only banner), not a `<dialog>` or overlay
- **Non-blocking** — check happens in `useEffect`, never in `beforeLoad`; the app always renders immediately
- **Single session dismiss** — `isDismissed` is Zustand in-memory state only; not persisted to settings; reappears on next launch if still pending
- **Color:** Use `var(--color-bg-surface)` + `var(--color-border)` for the bar background — distinct from the amber read-only banner; avoid using accent green (`var(--color-sidebar-active)`) for the container (reserve that for buttons only)
- **Prompt copy:** "v{version} available" + "Update Now" (Primary) + "Later" (Ghost) — exactly as spec'd in FR37; do not add explanatory text about what's new

---

### Architecture Compliance

- **Rust/React boundary**: JS `check()` call is correct — update check and install are handled by the Tauri plugin JS bindings; no custom Rust commands needed for this story
- **No new SQLite tables or migrations** — update state is in-memory Zustand only
- **No new routes** — update prompt is in App.tsx shell, not a route
- **Fail open** — every error path in `checkForUpdate` and `applyUpdate` catches and continues; the app never blocks on update failures
- **No `beforeLoad` use** — update check is async/network; must not block TanStack Router's initialization sequence (contrast with `checkSentinel` which is a local IPC call)

---

### Onboarding Path

The `useEffect` in `App.tsx` guards on `!isOnboarding`. When the user is on `/onboarding`, `checkForUpdate()` is NOT called. This is correct because:
1. Pre-onboarding users haven't configured a data folder; no sentinel is held; the app is already in a minimal state
2. An update prompt during onboarding would be confusing UX
3. After onboarding completes, the router redirects to `/` which remounts App's non-onboarding path, triggering the check

---

### Story 1.9 Dependency Note

Story 1.8 installs the update mechanism but the update manifest does not exist yet (created in Story 1.9). During development:
- Every `check()` call will fail (signature verification error, manifest 404, or network error)
- All failures are silenced per AC4
- The update prompt will NEVER appear in development — this is expected and correct
- Full end-to-end testing requires Story 1.9 to be complete

This means **all Story 1.8 tests must use mocks** — no test can rely on a real live update being available.

---

### Previous Story Learnings (from Stories 1.6 and 1.7)

1. **`useEffect` dependency arrays** — Use `[isOnboarding]` as the dependency so the effect re-fires if the user transitions from onboarding to main app in the same session. Guard with `if (!isOnboarding)` inside.
2. **Tauri plugin trait import** — When adding new Tauri plugins to `lib.rs`, check if the plugin crate requires any trait imports (e.g., `use tauri::Manager;` is needed for `app_handle()` access). For `.plugin(tauri_plugin_updater::Builder::new().build())` no extra imports needed.
3. **Avoid re-export or backwards-compat shims** — Do not add `useUpdateStore` re-exports to other stores; import it directly.
4. **Store reset in Vitest** — Reset store state in `beforeEach`: `useUpdateStore.setState({ pendingUpdate: null, isDismissed: false, isInstalling: false })`.
5. **`import.meta.env.DEV` in tests** — Vitest sets `import.meta.env.DEV = true` by default; console.warn calls in the catch block will fire during tests. Use `vi.spyOn(console, 'warn').mockImplementation(() => {})` if you want to suppress them.

---

### File List

#### New Files
- `src/stores/useUpdateStore.ts`
- `src/stores/useUpdateStore.test.ts`
- `e2e/update-prompt.spec.ts`

#### Modified Files
- `src-tauri/Cargo.toml` — add `tauri-plugin-updater = "2"` and `tauri-plugin-process = "2"`
- `src-tauri/tauri.conf.json` — add `plugins.updater` config
- `src-tauri/src/lib.rs` — register both new plugins
- `src/App.tsx` — add `useEffect` for check, add update prompt JSX
- `package.json` — add `@tauri-apps/plugin-updater` and `@tauri-apps/plugin-process`

## Dev Agent Record

### Completion Notes

Implemented all 6 tasks per story spec:
- Added `tauri-plugin-updater` and `tauri-plugin-process` to Rust and JS dependencies; registered both in `lib.rs`; added `plugins.updater` config with placeholder pubkey to `tauri.conf.json`
- Created `useUpdateStore` with `checkForUpdate`, `dismissUpdate`, `applyUpdate` actions — all error paths fail silently per AC4/NFR15
- Wired `useEffect` in `App.tsx` (guarded on `!isOnboarding`) to call `checkForUpdate()` once on non-onboarding mount
- Built inline update prompt bar (below read-only banner, above `<Outlet>`) with `data-testid` attributes for test targeting; "Installing…" state disables both buttons
- 13 Vitest unit tests for store (all pass) + 6 Vitest render tests for App prompt (all pass); 57 total suite tests green
- Playwright E2E tests written for update-prompt; mocks via `__TAURI_INTERNALS__.invoke` following established sentinel test pattern
- TypeScript typecheck passes clean

### File List

#### New Files
- `src/stores/useUpdateStore.ts`
- `src/stores/useUpdateStore.test.ts`
- `src/App.update.test.tsx`
- `e2e/update-prompt.spec.ts`

#### Modified Files
- `src-tauri/Cargo.toml` — added `tauri-plugin-updater = "2"` and `tauri-plugin-process = "2"`
- `src-tauri/tauri.conf.json` — added `plugins.updater` config block
- `src-tauri/src/lib.rs` — registered `tauri_plugin_updater` and `tauri_plugin_process`
- `src/App.tsx` — added `useEffect` for update check + inline update prompt JSX
- `package.json` — added `@tauri-apps/plugin-updater` and `@tauri-apps/plugin-process`

### Review Findings

- [x] [Review][Decision] D1: Verify GitHub endpoint URL — `tomloveland1-spec` confirmed correct
- [x] [Review][Decision] D2: AC2 vs UX Constraints contradiction — UX Constraints win; in-memory dismiss is correct; AC2 wording imprecise
- [x] [Review][Decision] D3: FR37 button copy contradiction — "Update Now" (UX Constraints) confirmed correct
- [x] [Review][Decision] D4: `isDismissed` not version-aware — session-wide dismiss is acceptable; no fix needed
- [x] [Review][Decision] D5: Install failure feedback — resolved as patch: log in all builds + show inline error text — fixed
- [x] [Review][Patch] P1: `applyUpdate` null-update branch leaves `isInstalling` stuck true — fixed: added `else { set({ isInstalling: false }) }` [`src/stores/useUpdateStore.ts`]
- [x] [Review][Patch] P2: `applyUpdate` has no concurrent-call guard — fixed: added `if (get().isInstalling) return` guard; store creator changed to `(set, get)` [`src/stores/useUpdateStore.ts`]
- [x] [Review][Patch] P3: E2E missing "Update Now" confirm path — fixed: added test for confirm button click and error feedback [`e2e/update-prompt.spec.ts`]
- [x] [Review][Defer] W1: WAL checkpoint silently skipped under lock contention [`src-tauri/src/lib.rs:91`] — deferred, pre-existing (Story 1-7 sentinel design)
- [x] [Review][Defer] W2: DataFolderState stale after `upsert_settings` changes data folder path [`src-tauri/src/lib.rs:69`] — deferred, pre-existing (Story 1-7 sentinel design)
- [x] [Review][Defer] W3: Sentinel latent trap — DataFolderState stored unconditionally; correctness depends entirely on `!is_read_only` guard staying intact [`src-tauri/src/lib.rs:105`] — deferred, pre-existing (Story 1-7 sentinel design)

### Change Log

- 2026-04-06: Story created — Auto-update check on launch, non-modal confirmation prompt, graceful failure handling.
- 2026-04-06: Story implemented — All tasks complete, 57 tests passing, TypeScript clean.
- 2026-04-06: Code review complete — 5 decision-needed, 3 patch, 3 deferred, 2 dismissed.
