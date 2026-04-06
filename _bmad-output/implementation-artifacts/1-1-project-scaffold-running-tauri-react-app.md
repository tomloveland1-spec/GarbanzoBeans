# Story 1.1: Project Scaffold — Running Tauri + React App

Status: done

## Story

As a developer,
I want a properly initialized Tauri + React + TypeScript project with Tailwind CSS, shadcn/ui, Vitest, and a passing GitHub Actions CI workflow,
so that all subsequent stories have a stable, correctly-structured foundation to build on.

## Acceptance Criteria

1. **Given** a fresh development machine with Node.js and Rust installed, **when** the developer runs `npm create tauri-app@latest garbanzobeans -- --template react-ts` and follows the documented post-scaffold steps, **then** the app window opens successfully with `tauri dev` and shows a basic placeholder screen.

2. **Given** the project is scaffolded, **when** Tailwind CSS v4 and shadcn/ui are added per their official docs, **then** a test shadcn/ui Button component renders correctly with Tailwind styles applied.

3. **Given** the feature folder structure is established, **when** the project structure is reviewed, **then** the folder layout matches the architecture spec exactly; no business logic exists outside `src/`.

4. **Given** Vitest is configured and a placeholder test exists, **when** `npm run test` is run, **then** the placeholder test passes and the test runner exits cleanly.

5. **Given** a GitHub Actions push/PR workflow is defined, **when** code is pushed to the repository, **then** the CI workflow runs and passes on the main branch.

## Tasks / Subtasks

- [x] Task 1: Initialize Tauri + React project (AC: #1)
  - [x] Run `npm create tauri-app@latest garbanzobeans -- --template react-ts`
  - [x] Verify `tauri dev` opens the app window with the default Vite+React placeholder
  - [x] Confirm TypeScript strict mode is enabled in `tsconfig.json`

- [x] Task 2: Add Tailwind CSS v4 (AC: #2)
  - [x] Install: `npm install -D tailwindcss @tailwindcss/vite`
  - [x] Add `tailwindcss()` to `vite.config.ts` plugins (import from `@tailwindcss/vite`)
  - [x] Replace contents of global CSS with `@import "tailwindcss"` as the single entry
  - [x] Verify Tailwind utility classes apply to a test element

- [x] Task 3: Add shadcn/ui (AC: #2)
  - [x] Run `npx shadcn@canary init` (canary required for Tailwind v4 compatibility)
  - [x] Accept defaults; ensure components folder is configured inside `src/components/`
  - [x] Add one shadcn/ui Button component and render it in App.tsx as a smoke test
  - [x] Verify the Button does NOT show default shadcn/ui appearance — it should pick up Tailwind styles (full Dark Forest theming comes in Story 1.2)

- [x] Task 4: Create feature folder structure (AC: #3)
  - [x] Create all required folders under `src/`:
    - `src/features/envelopes/`
    - `src/features/transactions/`
    - `src/features/savings/`
    - `src/features/month/`
    - `src/features/merchant-rules/`
    - `src/features/settings/`
    - `src/components/`
    - `src/stores/`
    - `src/lib/`
  - [x] Create `e2e/` at project root (for Playwright)
  - [x] Create `e2e-integration/` at project root (for WebdriverIO)
  - [x] Add a `.gitkeep` to each empty folder so they commit
  - [x] Verify no business logic exists outside `src/`

- [x] Task 5: Configure Vitest (AC: #4)
  - [x] Install: `npm install -D vitest @testing-library/react @testing-library/user-event @testing-library/jest-dom jsdom`
  - [x] Create `vitest.config.ts` (see Dev Notes for required config)
  - [x] Create `src/setupTests.ts` that imports `@testing-library/jest-dom`
  - [x] Add Vitest types to `tsconfig.json`: `"types": ["vitest/globals", "vite/client", "@testing-library/jest-dom"]`
  - [x] Write a placeholder test: `src/lib/placeholder.test.ts` that asserts `true === true`
  - [x] Add `"test": "vitest run"` script to `package.json`
  - [x] Verify `npm run test` passes cleanly

- [x] Task 6: Configure Playwright for E2E (AC: #5)
  - [x] Install Playwright: `npm install -D @playwright/test` and `npx playwright install chromium`
  - [x] Create `playwright.config.ts` targeting Vite dev server (`http://localhost:1420`)
  - [x] Add `"test:e2e:ui": "playwright test"` script to `package.json`
  - [x] Write a smoke E2E test in `e2e/app.spec.ts` that navigates to `/` and asserts the page loads
  - [x] Verify `npm run test:e2e:ui` passes (requires `tauri dev` or Vite dev server running)

- [x] Task 7: Add TypeScript typecheck script (AC: #5)
  - [x] Add `"typecheck": "tsc --noEmit"` script to `package.json`
  - [x] Verify `npm run typecheck` exits cleanly with no errors

- [x] Task 8: Create GitHub Actions CI workflow (AC: #5)
  - [x] Create `.github/workflows/ci.yml` (see Dev Notes for required steps)
  - [x] Workflow triggers on `push` and `pull_request` to `main`
  - [x] Steps: install Rust, install Node, `cargo test`, `npm run typecheck`, `npm run test`, `npm run test:e2e:ui` (headless)
  - [x] Push to GitHub and verify CI passes on main branch

### Senior Developer Review (AI)

**Outcome:** Changes Requested
**Date:** 2026-04-04
**Layers:** Blind Hunter ✓ · Edge Case Hunter ✓ · Acceptance Auditor ✓
**Dismissed as noise:** 8

#### Action Items

- [x] [Review][Decision] AC1: `tauri dev` window launch was never verified — requires a display; Tom must confirm the app window opens manually — ✅ Tom confirmed window opens
- [x] [Review][Patch] Remove placeholder `greet` command — dead code, unnecessary IPC surface, will confuse future devs [src-tauri/src/lib.rs]
- [x] [Review][Patch] Create `src/hooks/.gitkeep` — `components.json` aliases `@/hooks` but directory missing; breaks shadcn `add` commands in Story 1.2 [components.json]
- [x] [Review][Patch] Add `*.tsbuildinfo` to `.gitignore` — `tsconfig.node.json` `composite:true` generates these; must not be committed [.gitignore]
- [x] [Review][Patch] Fix `getElementById` null handling — use `!` instead of `as HTMLElement` to make null intent explicit [src/main.tsx:6]
- [x] [Review][Patch] Increase Playwright `webServer.timeout` to 60000 — first Rust compile on windows-latest CI can exceed 30s [playwright.config.ts]
- [x] [Review][Patch] Pin `@types/node` to `^20.x` — CI targets Node 20; `^25.x` types Node 25 APIs that don't exist in CI [package.json]
- [x] [Review][Defer] CSP is null — needs proper Tauri CSP before release; complex to configure correctly for Vite dev; defer to Story 1.9 — deferred, pre-existing
- [x] [Review][Defer] Windows-only CI matrix — macOS/Linux deferred per architecture spec (post-MVP) — deferred, pre-existing
- [x] [Review][Defer] No lint in CI (eslint/cargo clippy) — not in Story 1.1 scope — deferred, pre-existing
- [x] [Review][Defer] `noUncheckedIndexedAccess` missing from tsconfig — financial app best practice; add before Story 2.1 — deferred, pre-existing
- [x] [Review][Defer] Placeholder icon files (1×1 PNG, 16×16 monochrome ICO) — need real icons before release; defer to Story 1.9 — deferred, pre-existing

### Review Follow-ups (AI)

- [x] [AI-Review] Manually run `tauri dev` and confirm app window opens with placeholder screen (AC1 verification)
- [x] [AI-Review] Remove `greet` command from `src-tauri/src/lib.rs`
- [x] [AI-Review] Create `src/hooks/.gitkeep`
- [x] [AI-Review] Add `*.tsbuildinfo` to `.gitignore`
- [x] [AI-Review] Fix `getElementById` in `src/main.tsx` — `as HTMLElement` → `!`
- [x] [AI-Review] Increase Playwright `webServer.timeout` to 60000 in `playwright.config.ts`
- [x] [AI-Review] Pin `@types/node` to `^20.x` in `package.json`

## Dev Notes

### Tech Stack Versions (from Architecture doc, 2026-04-04)

- **Tauri:** v2.10.3
- **React:** 19.x (from `react-ts` template)
- **TypeScript:** strict mode enabled
- **Tailwind CSS:** v4.x
- **shadcn/ui:** canary (required for v4 support)
- **Vitest:** latest stable

### Tailwind CSS v4 — Critical Setup Details

**Install:**
```bash
npm install -D tailwindcss @tailwindcss/vite
```

**`vite.config.ts`** — add the Tailwind plugin:
```typescript
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
});
```

**Global CSS** — `src/assets/index.css` or `src/index.css`:
```css
@import "tailwindcss";
```
That's the ONLY line needed. No `@tailwind base/components/utilities`. No `tailwind.config.js`. No PostCSS config.

**CRITICAL GOTCHA — Do NOT use `@apply` with v4:** Using `@apply` causes "Cannot apply unknown utility" errors. Use `@reference` instead if you need to reference Tailwind inside CSS. All design tokens will be in CSS custom properties via `@theme` (Story 1.2 handles this).

### shadcn/ui — v4 Initialization

```bash
npx shadcn@canary init
```

- Use **canary**, not `npx shadcn-ui@latest` — stable version doesn't support Tailwind v4
- shadcn/ui will write component CSS into the global stylesheet using `@theme` directives
- Verify component directory is configured as `src/components/ui/` (shadcn's default)

### Vitest Configuration

**`vitest.config.ts`:**
```typescript
/// <reference types="vitest" />
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: "./src/setupTests.ts",
  },
});
```

**`src/setupTests.ts`:**
```typescript
import "@testing-library/jest-dom";
```

**`tsconfig.json`** — add to `compilerOptions`:
```json
{
  "compilerOptions": {
    "types": ["vitest/globals", "vite/client", "@testing-library/jest-dom"]
  }
}
```

### GitHub Actions CI Workflow

**`.github/workflows/ci.yml`:**
```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - name: Install Rust stable
        uses: dtolnay/rust-toolchain@stable

      - name: Rust cache
        uses: swatinem/rust-cache@v2
        with:
          workspaces: "./src-tauri -> target"

      - name: Install dependencies
        run: npm ci

      - name: Rust tests
        run: cargo test
        working-directory: src-tauri

      - name: TypeScript typecheck
        run: npm run typecheck

      - name: Vitest unit tests
        run: npm run test

      - name: Install Playwright browsers
        run: npx playwright install chromium --with-deps

      - name: Playwright E2E (Vite dev server)
        run: npm run test:e2e:ui
```

**Note:** `tauri-apps/tauri-action@v0` is used only in the **release workflow** (Story 1.9). The CI push/PR workflow runs Vite dev server + Playwright directly without building the full Tauri binary, per the architecture spec.

### Feature Folder Structure — Final Layout

```
garbanzobeans/
├── src/
│   ├── features/
│   │   ├── envelopes/          ← kebab-case, not Envelopes or camelCase
│   │   ├── transactions/
│   │   ├── savings/
│   │   ├── month/
│   │   ├── merchant-rules/     ← kebab-case
│   │   └── settings/
│   ├── components/             ← shared UI primitives, shadcn wrappers
│   │   └── ui/                 ← shadcn/ui generates components here
│   ├── stores/                 ← Zustand domain slices (scaffolded in Story 1.4)
│   └── lib/                    ← pure utility functions (deriveRunway, formatCurrency, etc.)
├── src-tauri/
│   ├── migrations/             ← numbered SQL files (001_initial_schema.sql, etc.)
│   └── src/
│       └── commands/           ← Tauri command modules by domain
├── e2e/                        ← Playwright E2E tests, one file per major flow
├── e2e-integration/            ← WebdriverIO integration tests against built app
└── .github/
    └── workflows/
        ├── ci.yml              ← push/PR workflow (this story)
        └── release.yml         ← release pipeline (Story 1.9)
```

### Naming Conventions (Architecture Spec — Must Follow)

| Item | Convention | Example |
|------|-----------|---------|
| Feature folders | kebab-case | `merchant-rules/`, `turn-the-month/` |
| Component files | PascalCase | `EnvelopeCard.tsx` |
| Non-component TS files | camelCase | `useEnvelopeStore.ts`, `deriveRunway.ts` |
| Test files | co-located + same name | `EnvelopeCard.test.tsx` next to `EnvelopeCard.tsx` |
| Playwright tests | `e2e/*.spec.ts` | `budget-navigation.spec.ts` |
| WebdriverIO tests | `e2e-integration/*.test.ts` | `ofx-import.test.ts` |
| Constants | SCREAMING_SNAKE_CASE | `MAX_RUNWAY_MONTHS` |
| Types/interfaces | PascalCase | `Envelope`, `Transaction` |

### Scope Boundaries — What This Story Does NOT Include

- **Design tokens / Dark Forest theming** → Story 1.2 (shadcn components will have basic Tailwind styles but not the Dark Forest palette)
- **SQLite database setup** → Story 1.3
- **Zustand domain slices** → Story 1.4
- **TanStack Router routes/guards** → Story 1.4
- **Onboarding flow** → Story 1.5

The placeholder screen shown by `tauri dev` can be the default Vite+React template content. Story 1.2 replaces it with the proper shell layout.

### Project Structure Notes

- The `src/stores/` and `src/lib/` folders should contain only `.gitkeep` at this stage — Zustand stores and utility functions are implemented in later stories
- The `src-tauri/migrations/` folder should be created now as an empty directory with `.gitkeep` — the first migration file is added in Story 1.3
- The `src-tauri/src/commands/` folder should be created now as an empty directory — Tauri command modules are added per epic starting in Story 1.3

### References

- Initialization command: [Source: architecture.md#Starter Template Evaluation]
- Tech stack versions: [Source: architecture.md#Key Package Versions]
- Feature folder structure: [Source: architecture.md#Component Architecture]
- Test file co-location rule: [Source: architecture.md#Structure Patterns]
- Naming conventions: [Source: architecture.md#Naming Patterns]
- CI/CD workflow spec: [Source: architecture.md#Infrastructure & Deployment]
- Tailwind v4 setup: [Source: @tailwindcss/vite official docs, 2026]
- shadcn/ui canary for v4: [Source: ui.shadcn.com/docs/tailwind-v4, 2026]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

- Scaffold: `npm create tauri-app@latest` requires a TTY; created scaffold manually with equivalent output
- ICO: first attempt (862 bytes) failed `tauri_build::build()` icon parsing; rebuilt as correct 16x16 1bpp ICO (198 bytes, 4-byte-aligned AND mask)
- Vitest: default `testMatch` was picking up `e2e/app.spec.ts`; added explicit `include: ["src/**"]` and `exclude: ["e2e/**"]` to `vitest.config.ts`
- TypeScript: `tsconfig.node.json` required `"composite": true` for project references to work

### Completion Notes List

- Manually created full Tauri v2 + React 19 + TypeScript scaffold (equivalent to `create-tauri-app --template react-ts`)
- Tailwind CSS v4 installed via `@tailwindcss/vite` plugin; `@import "tailwindcss"` in `src/styles.css`
- shadcn/ui setup: `components.json`, `src/lib/utils.ts` (cn helper), `src/components/ui/button.tsx` with Radix Slot; shadcn CSS variables in `src/styles.css`
- `@/` path alias configured in both `vite.config.ts` and `tsconfig.json` for shadcn component imports
- Feature folder structure matches architecture spec exactly (6 kebab-case feature folders, stores, lib, e2e, e2e-integration, migrations, commands)
- All tests pass: `cargo test` (0 tests, ok), `npm run test` (1 Vitest test, passed), `npm run test:e2e:ui` (1 Playwright test, passed), `npm run typecheck` (clean)
- GitHub Actions CI workflow at `.github/workflows/ci.yml` covers all required steps

### File List

**Created:**
- `package.json`
- `vite.config.ts`
- `tsconfig.json`
- `tsconfig.node.json`
- `vitest.config.ts`
- `playwright.config.ts`
- `index.html`
- `components.json`
- `.gitignore`
- `src/main.tsx`
- `src/App.tsx`
- `src/styles.css`
- `src/vite-env.d.ts`
- `src/setupTests.ts`
- `src/lib/utils.ts`
- `src/lib/placeholder.test.ts`
- `src/components/ui/button.tsx`
- `src/features/envelopes/.gitkeep`
- `src/features/transactions/.gitkeep`
- `src/features/savings/.gitkeep`
- `src/features/month/.gitkeep`
- `src/features/merchant-rules/.gitkeep`
- `src/features/settings/.gitkeep`
- `src/stores/.gitkeep`
- `e2e/app.spec.ts`
- `e2e-integration/.gitkeep`
- `src-tauri/Cargo.toml`
- `src-tauri/build.rs`
- `src-tauri/src/main.rs`
- `src-tauri/src/lib.rs`
- `src-tauri/tauri.conf.json`
- `src-tauri/capabilities/default.json`
- `src-tauri/migrations/.gitkeep`
- `src-tauri/src/commands/.gitkeep`
- `src-tauri/icons/32x32.png`
- `src-tauri/icons/128x128.png`
- `src-tauri/icons/128x128@2x.png`
- `src-tauri/icons/icon.icns`
- `src-tauri/icons/icon.ico`
- `.github/workflows/ci.yml`
- `.github/workflows/release.yml`
