---
stepsCompleted: [1, 2, 3, 4, 5, 6, 7, 8]
inputDocuments: ['_bmad-output/planning-artifacts/prd.md', '_bmad-output/planning-artifacts/prd-validation-report.md']
workflowType: 'architecture'
project_name: 'GarbanzoBeans'
user_name: 'Tom'
date: '2026-04-04'
lastStep: 8
status: 'complete'
completedAt: '2026-04-04'
---

# Architecture Decision Document

_This document builds collaboratively through step-by-step discovery. Sections are appended as we work through each architectural decision together._

---

## Project Context Analysis

### Requirements Overview

**Functional Requirements:**
40 FRs across 7 capability areas:
1. **Data Import & Transaction Management** (FR1–FR5): OFX import, dual cleared/working balance ledger, manual transaction entry, auto-match, transaction editing
2. **Merchant Categorization & Rules** (FR6–FR11): Auto-categorization, unknown merchant queue, rule creation from transactions, payee substring matching, rule management screen, per-transaction category override
3. **Envelope Budgeting** (FR12–FR19): Typed envelopes (Rolling/Bill/Goal), Need/Should/Want priority, traffic-light states with tooltips, monthly allocation, borrow flow with savings borrow confirmation, borrow history
4. **Savings & Wealth Tracking** (FR20–FR25): Savings category with distinct visual treatment, deposit/withdrawal directional indicator, savings balance bootstrap, runway calculation, arc gauge visual, savings flow bar chart (persistent in collapsible top pane)
5. **Monthly Planning & Turn the Month** (FR26–FR31): Turn the Month mode gate, closeout summary, drift detection (2-month overspend flag), bill date confirmation, income timing confirmation, guided envelope allocation
6. **Onboarding & Configuration** (FR32–FR36): Data folder selection, pay frequency/dates, savings target, settings mutability without historical impact, read-only mode on lock detection
7. **App Infrastructure** (FR37–FR40): Auto-update with user confirmation, update decline, atomic writes, schema migration on version upgrade

**Non-Functional Requirements:**
- **Performance:** 2s app launch; 3s OFX import (500 transactions); 200ms all UI interactions; 500ms max during concurrent data operations
- **Reliability:** Atomic writes (all-or-nothing); graceful shutdown recovery; migration abort-on-failure without data modification
- **Design Quality:** Custom design system pre-approved before implementation; all components styled against it (no default library appearance); immediate envelope state updates post-action
- **Privacy:** Zero outbound data during normal operation; no telemetry; user folder is only write target; auto-update check is sole network call
- **Portability:** Single-folder data portability; cloud-sync agnostic (OneDrive, Dropbox, Google Drive, local)

**Scale & Complexity:**
- Primary domain: Desktop application (Tauri + React, Windows-first, fully offline)
- Complexity level: High (data integrity, complex derived state, financial accuracy requirements)
- Estimated architectural components: ~8–10 major subsystems

### Technical Constraints & Dependencies

- **Tech stack is fixed:** Tauri (Rust backend) + React (TypeScript frontend), shadcn/ui + Tailwind CSS, SQLite via tauri-plugin-sql, tauri-plugin-updater for auto-updates
- **Windows 10/11 MVP target;** macOS support is a future concern but Tauri is cross-platform, so decisions should not block it
- **No server infrastructure** except a static GitHub Releases update manifest
- **Rust/React boundary philosophy:** Rust = file I/O, SQLite access, update checks; React = all business logic, state management, derivations (keep business logic testable and JS-native)
- **Single data store: SQLite only.** All data — transactions, envelope definitions, merchant rules, user settings, month history, savings reconciliations — lives in one SQLite database. Rationale: uniform atomicity across all write paths, single file to lock, cross-entity queries possible, merchant rules are written frequently enough to warrant ACID guarantees. No JSON config files.
- **Savings sign convention enforced throughout:** negative amounts = deposits to savings (outflow from checking); positive = withdrawals from savings
- **Schema migrations** must be versioned, non-destructive, and abort-safe
- **Charting library: Recharts** — handles arc gauge and savings flow bar chart; acceptable bundle size for a local desktop binary

### Cross-Cutting Concerns Identified

1. **Data integrity** — Atomic SQLite transactions required across all write paths (import, borrow, month close, migration). Single data store eliminates split-write complexity.
2. **Derived state management** — Runway metric, envelope states, and savings balance are computed from raw data at query time; React-layer memoization via Zustand; invalidated on every write commit
3. **App-mode gating** — "Turn the Month" mode blocks normal app access; enforced at the routing/initialization layer with sub-state persistence so crashes mid-ritual are resumable
4. **File-system IPC** — All SQLite access goes through Tauri's Rust backend via typed commands; IPC design determines testability and coupling
5. **Multi-device concurrency** — Sentinel lock file protects a single SQLite database file across OneDrive sync delays
6. **Schema versioning** — Every data structure change requires a migration path; migration runner executes before any data access on launch
7. **Merchant rule engine** — Pattern matching subsystem with CRUD, history isolation, rule versioning, and conflict detection
8. **Savings reconciliation** — Savings balance is maintained through two separate mechanisms (categorized transactions + user reconciliations) that must be queried together consistently

### Key Architectural Decisions

#### ADR-1: Single Data Store — SQLite Only
**Decision:** All application data (transactions, envelope definitions, merchant rules, user settings, month history, savings reconciliations) stored in SQLite. No JSON config files.
**Rationale:** Uniform atomicity across all write paths; single file to lock for multi-device sentinel; merchant rules written frequently enough to require ACID guarantees; cross-entity queries possible; eliminates split-write complexity between two data stores.

#### ADR-2: Derived State — Compute On-Demand with Zustand Memoization
**Decision:** Runway metric, envelope traffic-light states, and savings balance are computed as pure JS functions over Zustand store data. No persisted summary tables in SQLite.
**Rationale:** Single source of truth in SQLite; no sync problem between raw data and stale summaries; derived values are independently testable without Tauri or SQLite; Zustand invalidates on every write commit via `isWriting` flag that suppresses UI updates during active Tauri commands and releases as a batch on resolution.

#### ADR-3: Tauri IPC — Typed Commands Per Domain Operation
**Decision:** ~15–20 typed Tauri commands cover all write operations (importTransactions, borrowFromEnvelope, closeMonth, recordSavingsReconciliation, etc.). React never constructs SQL.
**Rationale:** Transaction boundaries enforced in Rust; atomic import guaranteed at the command level; typed commands testable in isolation on the Rust side; business logic stays in React.

#### ADR-4: Month Lifecycle — Explicit State Machine
**Decision:** A `months` table with explicit lifecycle status: `open` / `closing:step-N` / `closed`. Each Turn the Month step commits atomically and marks its sub-state before proceeding.
**Rationale:** Enables crash recovery — on launch, `closing:step-N` status triggers resume from the last incomplete step, not restart from step 1. Prevents Turn the Month from becoming a dread ritual due to lost progress.

#### ADR-5: State Management — Zustand Domain Slices
**Decision:** Zustand with domain slices (envelopes, transactions, savings, merchant rules). Load relevant data on launch; compute all derived values as pure JS functions; write-through to SQLite on mutations via typed Tauri commands; optimistic updates with rollback on command failure.
**Rationale:** Business logic lives entirely in JS — fully testable without Tauri. Derived values recompute reactively. Optimistic updates satisfy 200ms UI NFR without round-trip latency.

#### ADR-6: Savings — Two Distinct Metrics
**Decision:** Track two separate savings metrics:
1. **Savings account balance** — maintained via user reconciliations (user enters current real account balance; app calculates and stores delta). Used for runway calculation. Stored in `savings_reconciliations` table: `(date, entered_balance, previous_tracked_balance, delta, note)`.
2. **App-tracked savings flow** — sum of transactions categorized to the savings envelope. Used for the bar chart, streaks, and motivational display.
**Rationale:** These answer different questions. Balance answers "how long can I survive?" Flow answers "is my behavior improving?" They diverge legitimately (pre-app savings, tax refunds deposited directly, interest). Users should not need to understand +/− direction — they enter what their account shows; the app calculates the rest. The onboarding bootstrap is the first reconciliation entry; no separate flow needed.

### Architectural Risk Register

#### Risk 1: SQLite Corruption via OneDrive Mid-Write
**Mitigation:** Enable WAL (Write-Ahead Logging) mode explicitly on database open. Run `PRAGMA integrity_check` on every launch before any data access. Sentinel lock file written before database open, released after close with WAL checkpoint flush.

#### Risk 2: Stale Derived State Causing Wrong Numbers
**Mitigation:** One canonical SQL query per derived value (envelope balance, runway, savings balance) — used everywhere with no variations. Savings sign convention enforced at the SQLite layer via CHECK constraint, not only in application code. Invariant check after every write: sum of envelope allocations equals available income for the month; surface discrepancies immediately.

#### Risk 3: Turn the Month Crash Recovery
**Mitigation:** Sub-state persistence in `months` table (`closing:step-N`). Each step commits its own changes atomically before marking progress. On launch, `closing` status resumes from last incomplete step.

#### Risk 4: Merchant Rule Maintenance Burden
**Mitigation:** Rules table stores `created_date`, `last_matched_date`, `match_count` — makes rules screen useful and sortable. Rule application is forward-only: edits create a new rule version; past transactions store which rule version matched them. On import, two rules matching the same payee surface as a conflict rather than silent resolution.

### UI Architecture Notes

#### Wealth Panel (Top Pane)
- Persistent, collapsible top pane visible across all budget views
- **Runway display:** Primary number (e.g., "2.4 months") with delta line (+0.3 ↑ this month) in directional color. Arc gauge provides color-coded zone context (red/yellow/green). No needle — filled arc with threshold markers.
- **Savings reconciliation:** Accessible directly from the wealth panel. User enters current savings account balance; app displays current tracked balance for reference and calculates delta automatically. Optional note field for legibility ("Tax refund 2026").
- **Savings flow bar chart:** Monthly net savings, current month's bar grows as transactions are categorized. Animation triggers on write commit, not per-transaction.

#### Envelope Tooltip Content
- `getEnvelopeStateExplanation(type, state)` — pure JS function in Zustand layer
- Up to 9 distinct explanations (3 types × 3 states); authored as content before UI build begins
- No hardcoded strings in components; no database storage required

#### Turn the Month Observations
- Drift detection result (FR28) displayed as a single persistent line above the envelope list during Turn the Month summary step
- No modal, no animation — presence is the signal; disappears when step is confirmed

---

## Starter Template Evaluation

### Primary Technology Domain

Desktop application — Tauri v2 + React + TypeScript, Windows-first.
Tech stack fully specified in PRD; no discovery required at this step.

### Starter Options Considered

| Option | Includes | Decision |
|---|---|---|
| Official `create-tauri-app` | Vite, React, TypeScript, Tauri v2 | Selected — authoritative, maintained |
| MrLightful/create-tauri-react | Above + Tailwind, shadcn/ui, Biome | Considered — community starter, maintenance risk |
| kitlib/tauri-app-template | Above + titlebar, tray, multi-window | Rejected — excess features to undo |

### Selected Starter: Official create-tauri-app + manual Tailwind/shadcn/ui

**Rationale:** Official starter stays on the Tauri team's maintained release path. Tailwind CSS and shadcn/ui setup is a documented, low-risk manual step (~15 min). Community starters trade short-term convenience for long-term maintenance uncertainty on a solo, long-lived project.

**Initialization Command:**

```bash
npm create tauri-app@latest garbanzobeans -- --template react-ts
```

Then add Tailwind and shadcn/ui per their official docs after scaffolding.

**Architectural Decisions Provided by Starter:**

**Language & Runtime:**
TypeScript throughout (frontend). Rust (Tauri backend). Strict TypeScript config.

**Build Tooling:**
Vite for frontend bundling and HMR. Cargo for Rust compilation. `tauri dev` for development; `tauri build` for production binary.

**Styling Solution:**
None from starter — manually add Tailwind CSS v4 + shadcn/ui. Design system established before any component implementation (per PRD NFR).

**Testing Framework:**
None from starter — add Vitest for React unit/integration tests. Rust unit tests via Cargo's built-in test runner.

**Code Organization:**
Standard Vite + React project structure. Zustand domain slices in `src/stores/`. Typed Tauri commands in `src-tauri/src/commands/`. See ADR-3.

**Development Experience:**
Hot module replacement via Vite. Tauri devtools in development builds.

**Key Package Versions (as of 2026-04-04):**
- tauri: v2.10.3
- tauri-plugin-sql: v2.3.2
- tauri-plugin-updater: v2.x (official plugins workspace)
- React: 19.x (from Vite template)
- Tailwind CSS: v4.x
- shadcn/ui: latest

**Note:** Project initialization is the first implementation story.

---

## Core Architectural Decisions

### Decision Priority Analysis

**Critical Decisions (Block Implementation):**
- Schema migration approach: numbered SQL files in `migrations/`
- Routing: TanStack Router with type-safe route guards
- Testing: Vitest + Playwright + WebdriverIO + Cargo
- CI/CD: GitHub Actions with tauri-apps/tauri-action
- Code signing: Azure Trusted Signing

**Deferred Decisions (Post-MVP):**
- macOS build pipeline (Tauri supports it; CI workflow addition only)
- E2E test expansion beyond critical integration scenarios
- EV certificate upgrade if SmartScreen reputation requires it

### Data Architecture

**Schema Migrations**
- Approach: Numbered SQL files in `src-tauri/migrations/` (e.g. `001_initial_schema.sql`, `002_add_note_to_reconciliations.sql`)
- Applied by Rust on launch before any data access
- Migration runner checks an internal version table; runs only unapplied migrations
- Failure aborts launch cleanly without modifying existing data (per PRD NFR)
- Rationale: readable git history per migration, easy to diff, clear audit trail

### Authentication & Security

**Authentication:** Not applicable — local-first, single-user, no accounts, no network auth

**Code Signing:** Azure Trusted Signing (~$10/month)
- Satisfies PRD requirement: auto-update binaries signed to prevent tampering in transit
- Native GitHub Actions integration — no hardware token required
- Builds Windows SmartScreen reputation over time
- Certificate stored as GitHub Actions secret; signing happens during release workflow

**Encryption at rest:** Deferred to post-MVP per PRD (BitLocker/FileVault = user responsibility)

### API & Communication Patterns

**Tauri IPC:** ~15–20 typed Tauri commands organized by domain:
- `transactions::` — import_ofx, create_transaction, update_transaction
- `envelopes::` — create_envelope, update_envelope, borrow_from_envelope
- `savings::` — record_reconciliation
- `months::` — open_month, advance_turn_the_month_step, close_month
- `merchant_rules::` — create_rule, update_rule, delete_rule
- `settings::` — update_settings
- `migrations::` — run_pending (called automatically on launch)

**Error handling:** Commands return `Result<T, String>` (Rust). React receives typed rejections; Zustand store rolls back optimistic update on failure. Errors surfaced to user via inline messaging, never modals.

**Logging:** `tauri-plugin-log` in development builds — local log file only, no financial data logged, stripped from production builds.

### Frontend Architecture

**Routing:** TanStack Router
- Type-safe route params and search params throughout
- Route guards enforce Turn the Month mode gate (blocks all routes except `/turn-the-month` when month status is `closing:*`)
- Route guard enforces read-only mode when sentinel lock is held by another instance
- ~5–6 routes: `/` (Budget), `/ledger`, `/merchant-rules`, `/settings`, `/turn-the-month`, `/onboarding`

**State Management:** Zustand domain slices
- `useEnvelopeStore` — envelope definitions, traffic-light states, borrow state
- `useTransactionStore` — current month transactions, import queue
- `useSavingsStore` — reconciliation history, tracked savings flow, runway
- `useMerchantRuleStore` — rules, conflict detection
- `useMonthStore` — current month status, Turn the Month step progress
- `useSettingsStore` — pay frequency, savings target, data folder path
- `isWriting` flag per store — suppresses UI updates during active Tauri commands

**Component Architecture:** Feature-based folder structure
```
src/
  features/
    envelopes/       — envelope cards, borrow overlay, allocation flow
    transactions/    — ledger view, OFX import, merchant queue
    savings/         — wealth panel, arc gauge, bar chart, reconciliation form
    month/           — Turn the Month wizard, closeout summary
    merchant-rules/  — rules screen, rule editor
    settings/        — onboarding, configuration
  components/        — shared UI primitives (shadcn/ui wrappers, layout)
  stores/            — Zustand domain slices
  lib/               — pure utility functions (derived value computations,
                       getEnvelopeStateExplanation, OFX parser)
```

**Testing:**
- **Vitest + React Testing Library** — unit/integration tests for stores, pure functions, and components (especially derived value computations and getEnvelopeStateExplanation)
- **Playwright** — UI E2E flows against Vite dev server (navigation guards, envelope state changes, form validation, Turn the Month wizard steps)
- **WebdriverIO + tauri-driver** — critical integration E2E against built app (OFX import atomicity, month close, savings reconciliation, sentinel lock)
- **Cargo tests** — Rust command unit tests (migration runner, SQL correctness)

### Infrastructure & Deployment

**CI/CD:** GitHub Actions with two workflows:

*On push/PR:*
- `cargo test` (Rust unit tests)
- `npm run typecheck` (TypeScript)
- `npm run test` (Vitest)
- `npm run test:e2e:ui` (Playwright against Vite dev server)

*On release tag (`v*`):*
- Full Tauri build for Windows (x64)
- WebdriverIO integration tests against built app
- Azure Trusted Signing code signing step
- Upload installer to GitHub Releases
- Update Tauri update manifest JSON

**Update Infrastructure:** GitHub Releases hosts both the installer and the update manifest JSON consumed by tauri-plugin-updater on app launch.

### Decision Impact Analysis

**Implementation Sequence:**
1. Project initialization (`create-tauri-app` + Tailwind + shadcn/ui)
2. SQLite setup + migration runner + initial schema (`001_initial_schema.sql`)
3. Zustand store scaffolding (empty domain slices)
4. TanStack Router setup + route definitions + guards
5. Tauri command scaffolding (typed stubs, no logic yet)
6. Feature implementation (per epic/story order)
7. CI/CD pipeline (GitHub Actions workflows)
8. Azure Trusted Signing setup (before first public release)

**Cross-Component Dependencies:**
- Migration runner must complete before any Zustand store hydrates from SQLite
- TanStack Router guards depend on `useMonthStore` month status
- All Zustand write operations depend on typed Tauri commands
- Recharts (arc gauge + bar chart) depends on `useSavingsStore` derived values
- `getEnvelopeStateExplanation()` authored before any envelope component is built

---

## Implementation Patterns & Consistency Rules

### Critical Conflict Points Identified

8 areas where AI agents could make different choices without explicit rules:
financial amount storage, SQLite naming, Tauri error shapes, store vs. direct
Tauri calls, date formats, file naming, test location, and component responsibility.

### Naming Patterns

**SQLite Table & Column Naming: snake_case throughout**
- Tables: plural snake_case — `transactions`, `envelopes`, `merchant_rules`, `savings_reconciliations`, `months`, `settings`
- Columns: snake_case — `created_at`, `envelope_id`, `matched_rule_version`
- Foreign keys: `{table_singular}_id` — `envelope_id`, `month_id`
- Indexes: `idx_{table}_{column}` — `idx_transactions_month_id`

```sql
-- CORRECT
CREATE TABLE merchant_rules (
  id INTEGER PRIMARY KEY,
  payee_substring TEXT NOT NULL,
  envelope_id INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  match_count INTEGER DEFAULT 0
);

-- WRONG
CREATE TABLE MerchantRules (ruleId INTEGER, payeeSubstring TEXT);
```

**Tauri Command Naming: snake_case in Rust, invoked via camelCase in React**
Tauri automatically translates. Define commands as `import_ofx` in Rust; invoke as `invoke('import_ofx', {...})` in React. Never use PascalCase for commands.

```rust
// CORRECT
#[tauri::command]
fn import_ofx(path: String) -> Result<Vec<Transaction>, String> { ... }

// WRONG
#[tauri::command]
fn ImportOFX(filePath: String) -> Result<Vec<Transaction>, String> { ... }
```

**TypeScript / React Code Naming:**
- Components: PascalCase — `EnvelopeCard`, `WealthPanel`, `BorrowOverlay`
- Component files: PascalCase — `EnvelopeCard.tsx`, `WealthPanel.tsx`
- Non-component files: camelCase — `useEnvelopeStore.ts`, `deriveRunway.ts`
- Functions: camelCase — `getEnvelopeStateExplanation`, `deriveRunway`
- Constants: SCREAMING_SNAKE_CASE — `MAX_RUNWAY_MONTHS`, `SAVINGS_SIGN_CONVENTION`
- Types/interfaces: PascalCase — `Envelope`, `Transaction`, `MonthStatus`
- Zustand stores: camelCase hook — `useEnvelopeStore`, `useSavingsStore`

**Feature Folder Naming: kebab-case**
```
src/features/
  envelopes/
  merchant-rules/      ← kebab-case, not merchantRules or MerchantRules
  turn-the-month/
  savings/
```

### Structure Patterns

**Test File Location: co-located with source**
```
src/features/envelopes/
  EnvelopeCard.tsx
  EnvelopeCard.test.tsx      ← co-located, not in __tests__/
  useEnvelopeStore.ts
  useEnvelopeStore.test.ts
src/lib/
  deriveRunway.ts
  deriveRunway.test.ts
```

**Playwright tests:** `e2e/` folder at project root, one file per major flow
```
e2e/
  budget-navigation.spec.ts
  turn-the-month.spec.ts
  envelope-borrow.spec.ts
```

**WebdriverIO tests:** `e2e-integration/` folder at project root
```
e2e-integration/
  ofx-import.test.ts
  month-close.test.ts
  sentinel-lock.test.ts
```

**Shared utilities location:**
```
src/lib/
  deriveRunway.ts                    — pure derivation functions
  deriveEnvelopeState.ts             — envelope traffic-light logic
  getEnvelopeStateExplanation.ts     — tooltip content function
  parseOFX.ts                        — OFX file parser
  formatCurrency.ts                  — display formatting (cents → display string)
```

### Format Patterns

**CRITICAL — Financial Amounts: INTEGER cents in SQLite, never REAL**
All monetary amounts stored as INTEGER representing cents (or smallest currency unit).
Conversion to display string happens only at the UI boundary via `formatCurrency()`.

```typescript
// CORRECT: store as cents
const amount = 1234; // = $12.34

// CORRECT: display formatting only at UI boundary
formatCurrency(amount); // → "$12.34"

// WRONG: never store or compute with floats
const amount = 12.34; // floating point arithmetic errors accumulate
```

**Date/Time Storage: ISO 8601 strings in SQLite**
SQLite has no native date type. Store all dates as ISO 8601 strings in UTC.

```sql
-- CORRECT
created_at TEXT NOT NULL DEFAULT (datetime('now'))  -- "2026-04-04T12:00:00Z"

-- WRONG
created_at INTEGER  -- Unix timestamp (less readable, harder to debug)
```

**Booleans in SQLite: INTEGER 0/1**
```sql
is_cleared INTEGER NOT NULL DEFAULT 0  -- 0 = false, 1 = true
```

**Tauri Command Response: Result<T, AppError>**
All commands return a typed Result. Error shape is consistent across all commands:

```rust
// Rust side — consistent error type
#[derive(Debug, serde::Serialize)]
pub struct AppError {
    pub code: String,      // machine-readable: "IMPORT_DUPLICATE", "DB_LOCKED"
    pub message: String,   // human-readable for display
}

// All commands use this pattern
#[tauri::command]
fn import_ofx(path: String) -> Result<ImportResult, AppError> { ... }
```

```typescript
// React side — consistent handling
try {
  const result = await invoke<ImportResult>('import_ofx', { path });
  store.setImportResult(result);
} catch (error) {
  const appError = error as AppError;
  store.setError(appError.message); // surface message to UI
  store.rollback();                 // always rollback on failure
}
```

### Communication Patterns

**Zustand State Updates: immutable updates via Zustand's set()**
Never mutate state directly. All updates via Zustand's `set()` function.

```typescript
// CORRECT
set((state) => ({
  envelopes: state.envelopes.map(e =>
    e.id === id ? { ...e, allocated: newAmount } : e
  )
}));

// WRONG
state.envelopes[0].allocated = newAmount; // direct mutation
```

**Component → Store → Tauri: never skip the store**
Components NEVER call `invoke()` directly. All Tauri interactions go through
store actions. Components read from stores and call store actions only.

```typescript
// CORRECT — component calls store action
const { importOFX } = useTransactionStore();
await importOFX(filePath);

// WRONG — component calls Tauri directly
const result = await invoke('import_ofx', { path: filePath });
```

**Optimistic Updates: isWriting flag pattern**
Every store write operation follows this sequence:
1. Set `isWriting: true` on the store
2. Apply optimistic update to store state
3. Invoke Tauri command
4. On success: set `isWriting: false`, confirm state
5. On failure: set `isWriting: false`, rollback to pre-optimistic state, set error

### Process Patterns

**Error Handling: inline, never modal**
User-facing errors appear inline adjacent to the action that caused them.
No error modals. Use toast only for non-blocking confirmations ("Import complete — 23 transactions added").

```typescript
// Store exposes error per domain area
interface EnvelopeStore {
  borrowError: string | null;       // shown inline in BorrowOverlay
  allocationError: string | null;   // shown inline in allocation form
}
```

**Loading States: per-operation, not per-store**
Each store tracks `isWriting` for write operations in progress. Components show
loading UI only during operations they initiated.

**Savings Sign Convention: enforced at every layer**
- SQLite: schema comment documents convention on every relevant table
- Rust: assert sign before insert
- TypeScript: typed constant `SAVINGS_DEPOSIT_SIGN = -1`
- Never rely on application logic alone

```sql
-- Negative amount = deposit to savings (outflow from checking)
-- Positive amount = withdrawal from savings
amount INTEGER NOT NULL
```

### Enforcement Guidelines

**All implementation sessions MUST:**
- Store all monetary amounts as INTEGER cents — never REAL or string
- Store all dates as ISO 8601 TEXT — never Unix integers
- Route all Tauri invocations through Zustand store actions
- Follow the optimistic update + rollback pattern for all writes
- Return `Result<T, AppError>` from all Tauri commands with consistent AppError shape
- Co-locate test files with source files (except E2E)
- Use PascalCase for component files, camelCase for everything else
- Use snake_case for all SQLite tables and columns

**Anti-Patterns (explicitly forbidden):**
```typescript
// ❌ Float money
const balance = 1234.56;

// ❌ Direct Tauri invoke from component
const data = await invoke('get_envelopes');

// ❌ Modal for data errors
showErrorModal("Import failed"); // use inline error instead

// ❌ camelCase SQLite columns
CREATE TABLE envelopes (envelopeId INTEGER, budgetAmount REAL);

// ❌ Deriving values outside the store
// In a component:
const runway = transactions.reduce(...); // belongs in useSavingsStore
```

---

## Project Structure & Boundaries

### Requirements to Structure Mapping

| FR Category | Lives In |
|---|---|
| FR1–5: Data Import & Transaction Management | `src/features/transactions/` + `src-tauri/src/commands/transactions.rs` |
| FR6–11: Merchant Categorization & Rules | `src/features/merchant-rules/` + `src-tauri/src/commands/merchant_rules.rs` |
| FR12–19: Envelope Budgeting | `src/features/envelopes/` + `src-tauri/src/commands/envelopes.rs` |
| FR20–25: Savings & Wealth Tracking | `src/features/savings/` + `src-tauri/src/commands/savings.rs` |
| FR26–31: Monthly Planning & Turn the Month | `src/features/turn-the-month/` + `src-tauri/src/commands/months.rs` |
| FR32–36: Onboarding & Configuration | `src/features/settings/` + `src-tauri/src/commands/settings.rs` |
| FR37–40: App Infrastructure & Updates | `src-tauri/src/db/` + `src-tauri/migrations/` + `.github/workflows/` |

**Cross-Cutting Concerns:**

| Concern | Location |
|---|---|
| Derived value computations | `src/lib/` (pure functions, tested independently) |
| Shared TypeScript types | `src/types/` |
| SQLite connection, WAL, integrity check | `src-tauri/src/db/connection.rs` |
| Migration runner | `src-tauri/src/db/migrations.rs` |
| Sentinel lock file | `src-tauri/src/db/sentinel.rs` |
| AppError type | `src-tauri/src/models/app_error.rs` |
| shadcn/ui primitives | `src/components/ui/` |
| App layout (top pane, shell) | `src/components/layout/` |

### Complete Project Directory Structure

```
garbanzobeans/
├── .github/
│   └── workflows/
│       ├── ci.yml                     — test on every push/PR
│       └── release.yml                — build, sign, release on v* tag
├── e2e/                               — Playwright UI tests (Vite dev server)
│   ├── budget-navigation.spec.ts
│   ├── envelope-borrow.spec.ts
│   ├── merchant-queue.spec.ts
│   ├── savings-reconciliation.spec.ts
│   └── turn-the-month.spec.ts
├── e2e-integration/                   — WebdriverIO + tauri-driver (built app)
│   ├── month-close.test.ts
│   ├── ofx-import.test.ts
│   ├── savings-reconciliation.test.ts
│   └── sentinel-lock.test.ts
├── src/
│   ├── main.tsx                       — React entry point
│   ├── App.tsx                        — Root component, router outlet
│   ├── router.tsx                     — TanStack Router: routes + guards
│   ├── index.css                      — Tailwind base styles
│   ├── features/
│   │   ├── envelopes/
│   │   │   ├── EnvelopeCard.tsx       — Single envelope display (type, state, tooltip)
│   │   │   ├── EnvelopeCard.test.tsx
│   │   │   ├── EnvelopeList.tsx       — Full envelope list with scroll
│   │   │   ├── AllocationForm.tsx     — Monthly allocation input
│   │   │   ├── AllocationForm.test.tsx
│   │   │   ├── BorrowOverlay.tsx      — Borrow flow (Need/Should/Want sort)
│   │   │   ├── BorrowOverlay.test.tsx
│   │   │   ├── useEnvelopeStore.ts    — Zustand: envelopes, states, borrow
│   │   │   └── useEnvelopeStore.test.ts
│   │   ├── transactions/
│   │   │   ├── LedgerView.tsx         — Dual cleared/working balance ledger
│   │   │   ├── LedgerView.test.tsx
│   │   │   ├── TransactionRow.tsx     — Single transaction display + edit
│   │   │   ├── OFXImporter.tsx        — File drop/pick + import trigger
│   │   │   ├── OFXImporter.test.tsx
│   │   │   ├── MerchantQueue.tsx      — Unknown merchant categorization queue
│   │   │   ├── MerchantQueue.test.tsx
│   │   │   ├── useTransactionStore.ts — Zustand: transactions, import queue
│   │   │   └── useTransactionStore.test.ts
│   │   ├── savings/
│   │   │   ├── WealthPanel.tsx        — Collapsible top pane container
│   │   │   ├── WealthPanel.test.tsx
│   │   │   ├── RunwayGauge.tsx        — Arc gauge + number + delta display
│   │   │   ├── RunwayGauge.test.tsx
│   │   │   ├── SavingsFlowChart.tsx   — Monthly bar chart (Recharts)
│   │   │   ├── SavingsFlowChart.test.tsx
│   │   │   ├── ReconciliationForm.tsx — "What is your savings balance?" input
│   │   │   ├── ReconciliationForm.test.tsx
│   │   │   ├── useSavingsStore.ts     — Zustand: reconciliations, flow, runway
│   │   │   └── useSavingsStore.test.ts
│   │   ├── turn-the-month/
│   │   │   ├── TurnTheMonthWizard.tsx — Step-gated ritual container
│   │   │   ├── TurnTheMonthWizard.test.tsx
│   │   │   ├── CloseoutSummary.tsx    — Prior month summary + drift observation
│   │   │   ├── CloseoutSummary.test.tsx
│   │   │   ├── BillDateConfirmation.tsx — Confirm/adjust bill dates
│   │   │   ├── IncomeTimingStep.tsx   — Confirm income timing
│   │   │   ├── EnvelopeFillFlow.tsx   — Guided allocation for new month
│   │   │   ├── useMonthStore.ts       — Zustand: month status, TTM step progress
│   │   │   └── useMonthStore.test.ts
│   │   ├── merchant-rules/
│   │   │   ├── MerchantRulesScreen.tsx — Rules list (sortable by match_count, date)
│   │   │   ├── RuleEditor.tsx          — Create/edit rule, substring selector
│   │   │   ├── RuleEditor.test.tsx
│   │   │   ├── RuleConflictBanner.tsx  — Surfaces rule conflicts on import
│   │   │   ├── useMerchantRuleStore.ts — Zustand: rules, conflict detection
│   │   │   └── useMerchantRuleStore.test.ts
│   │   └── settings/
│   │       ├── OnboardingFlow.tsx      — First-launch: folder, pay freq, savings %
│   │       ├── OnboardingFlow.test.tsx
│   │       ├── DataFolderPicker.tsx    — Folder selection dialog (Tauri dialog API)
│   │       ├── SettingsScreen.tsx      — Pay frequency, savings target, etc.
│   │       ├── useSettingsStore.ts     — Zustand: all user settings
│   │       └── useSettingsStore.test.ts
│   ├── components/
│   │   ├── ui/                        — shadcn/ui generated components (do not edit)
│   │   ├── layout/
│   │   │   ├── AppShell.tsx           — Root layout: top pane + main content
│   │   │   ├── TopPane.tsx            — WealthPanel container (collapsible)
│   │   │   ├── NavBar.tsx             — Primary navigation
│   │   │   └── ReadOnlyBanner.tsx     — Shown when sentinel lock held by another instance
│   │   └── shared/
│   │       ├── CurrencyDisplay.tsx    — Formatted cent → "$X.XX" display
│   │       └── InlineError.tsx        — Consistent inline error display
│   ├── lib/
│   │   ├── deriveRunway.ts            — (savings_balance, monthly_essentials) → months
│   │   ├── deriveRunway.test.ts
│   │   ├── deriveEnvelopeState.ts     — (envelope, transactions) → 'green'|'orange'|'red'
│   │   ├── deriveEnvelopeState.test.ts
│   │   ├── getEnvelopeStateExplanation.ts  — (type, state) → tooltip string (9 variants)
│   │   ├── getEnvelopeStateExplanation.test.ts
│   │   ├── parseOFX.ts                — OFX file → Transaction[]
│   │   ├── parseOFX.test.ts
│   │   ├── formatCurrency.ts          — cents (INTEGER) → display string
│   │   └── formatCurrency.test.ts
│   └── types/
│       ├── envelope.ts                — Envelope, EnvelopeType, EnvelopePriority, EnvelopeState
│       ├── transaction.ts             — Transaction, TransactionType
│       ├── savings.ts                 — SavingsReconciliation, SavingsFlow
│       ├── month.ts                   — Month, MonthStatus (open/closing:N/closed)
│       ├── merchant-rule.ts           — MerchantRule, RuleVersion
│       └── app-error.ts              — AppError (code, message)
├── src-tauri/
│   ├── Cargo.toml
│   ├── Cargo.lock
│   ├── build.rs
│   ├── tauri.conf.json                — Tauri config: plugins, window, updater endpoint
│   ├── icons/                         — App icons (generated by Tauri)
│   ├── migrations/
│   │   └── 001_initial_schema.sql     — Full initial schema (all tables, indexes, constraints)
│   └── src/
│       ├── main.rs                    — Tauri app builder, plugin registration
│       ├── lib.rs                     — Command registration
│       ├── commands/
│       │   ├── mod.rs
│       │   ├── transactions.rs        — import_ofx, create_transaction, update_transaction
│       │   ├── envelopes.rs           — create_envelope, update_envelope, borrow_from_envelope
│       │   ├── savings.rs             — record_reconciliation
│       │   ├── months.rs              — open_month, advance_turn_the_month_step, close_month
│       │   ├── merchant_rules.rs      — create_rule, update_rule, delete_rule
│       │   └── settings.rs            — update_settings, get_settings
│       ├── db/
│       │   ├── mod.rs
│       │   ├── connection.rs          — DB open, WAL mode, PRAGMA integrity_check on launch
│       │   ├── migrations.rs          — Migration runner (reads migrations/, tracks versions)
│       │   └── sentinel.rs            — Sentinel lock file write/read/release
│       └── models/
│           ├── mod.rs
│           ├── transaction.rs
│           ├── envelope.rs
│           ├── savings.rs
│           ├── month.rs
│           ├── merchant_rule.rs
│           └── app_error.rs           — AppError { code: String, message: String }
├── components.json                    — shadcn/ui configuration
├── package.json
├── tsconfig.json
├── tsconfig.node.json
├── vite.config.ts
├── tailwind.config.ts
├── playwright.config.ts               — Playwright config (baseURL: Vite dev server)
├── vitest.config.ts
├── wdio.conf.ts                       — WebdriverIO config (Tauri app binary path)
└── .gitignore
```

### Architectural Boundaries

**Rust/React Boundary (Tauri IPC)**
- Everything in `src-tauri/src/commands/` is callable from React via `invoke()`
- React never touches `src-tauri/` source directly
- All SQLite access happens in Rust — React has no direct DB connection
- AppError is the only error type that crosses this boundary

**Store/Component Boundary**
- Components in `src/features/**/` read state from stores and call store actions
- Components never import from other features' stores directly
- Shared state between features flows through the relevant Zustand store

**Pure Function Boundary**
- Everything in `src/lib/` is a pure function with zero side effects
- No Tauri invocations, no store imports, no React hooks
- These functions are the single source of truth for all derived values

### Data Flow

```
OFX File (user filesystem)
  → OFXImporter.tsx (triggers)
  → useTransactionStore.importOFX() (store action)
    → invoke('import_ofx', { path }) (Tauri IPC)
      → transactions.rs (Rust command)
        → SQLite (atomic write via tauri-plugin-sql)
      → returns ImportResult
    → store updates (optimistic confirm or rollback)
  → deriveEnvelopeState() recalculates (pure function)
  → deriveRunway() recalculates (pure function)
  → WealthPanel re-renders (Zustand subscription)
  → EnvelopeList re-renders (Zustand subscription)
```

### Launch Sequence (Architectural Order)

1. `connection.rs` — open SQLite, enable WAL, run `PRAGMA integrity_check`
2. `migrations.rs` — apply any unapplied numbered SQL files
3. `sentinel.rs` — attempt to acquire lock; set read-only mode if held
4. React mounts — `useSettingsStore` hydrates (checks if onboarding needed)
5. `useMonthStore` hydrates — checks month status (`closing:*` → route to Turn the Month)
6. TanStack Router applies guards — redirects to `/onboarding` or `/turn-the-month` if needed
7. Normal app renders

---

## Architecture Validation Results

### Coherence Validation ✅

**Decision Compatibility:**
All 6 technology layers are version-compatible and confirmed to work together as of 2026-04-04: Tauri v2.10.3 + React 19 + Vite + Tailwind v4 + shadcn/ui + tauri-plugin-sql v2.3.2. TanStack Router and Zustand are both React 19-compatible. Recharts works as a standard React component library. Azure Trusted Signing integrates natively with GitHub Actions. No version conflicts detected.

**Pattern Consistency:**
The three-layer pattern (Component → Store → Tauri) is uniformly applied across all six feature domains. The `isWriting` flag + optimistic update + rollback pattern is specified once and referenced consistently. Error handling (inline only, never modal) is enforced via the store's per-operation error fields. The savings sign convention is explicitly enforced at three independent layers (SQLite schema comment, Rust assert, TypeScript constant) — no single point of failure. Naming conventions (snake_case SQL, camelCase TS, PascalCase components, kebab-case feature folders) have no overlaps or contradictions.

**Structure Alignment:**
The feature folder structure mirrors the Zustand domain slice structure which mirrors the Rust command domain structure — all three layers are isomorphic. `src/lib/` pure functions are correctly isolated with zero side effects. The `db/` subsystem cleanly separates `connection.rs`, `migrations.rs`, and `sentinel.rs` concerns. The E2E split (Playwright for UI against Vite, WebdriverIO for integration against built binary) matches the testing rationale.

---

### Requirements Coverage Validation ✅

**Functional Requirements (7 categories, 40 FRs):**

| FR Category | Architectural Coverage |
|---|---|
| FR1–5: Transactions & Import | `features/transactions/` + `commands/transactions.rs` + `parseOFX.ts` + `OFXImporter.tsx` |
| FR6–11: Merchant Rules | `features/merchant-rules/` + `commands/merchant_rules.rs` + risk register risk 4 (rule versioning, conflict detection) |
| FR12–19: Envelope Budgeting | `features/envelopes/` + `commands/envelopes.rs` + `deriveEnvelopeState.ts` + `getEnvelopeStateExplanation.ts` |
| FR20–25: Savings & Wealth | `features/savings/` + `commands/savings.rs` + ADR-6 (two metrics) + `deriveRunway.ts` + Recharts arc gauge + bar chart |
| FR26–31: Monthly Planning & TTM | `features/turn-the-month/` + `commands/months.rs` + ADR-4 (state machine + crash recovery) |
| FR32–36: Onboarding & Config | `features/settings/` + `commands/settings.rs` + `OnboardingFlow.tsx` |
| FR37–40: App Infrastructure | `db/connection.rs` (WAL, integrity_check) + `db/migrations.rs` + `.github/workflows/release.yml` (updater) |

All 40 FRs have clear architectural homes.

**Non-Functional Requirements:**

- **Performance** (2s launch / 3s OFX import / 200ms UI): WAL mode removes read/write lock contention; optimistic updates eliminate round-trip latency for UI interactions; derived values computed in JS without extra Tauri round-trips. Achievable.
- **Reliability** (atomic writes, crash recovery, abort-safe migration): All SQLite writes in Tauri commands (atomic by construction); `closing:step-N` sub-state for crash recovery; migration runner aborts without modifying data. All three covered.
- **Design Quality** (custom design system pre-approved): Enforced procedurally — `getEnvelopeStateExplanation()` authored before components; design system decision documented.
- **Privacy** (zero outbound data during normal operation): Architecture has no server, no telemetry path, single network call is `tauri-plugin-updater`. Covered.
- **Portability** (single-folder portability): SQLite single-file + sentinel lock design. Covered.

---

### Implementation Readiness Validation ✅

**Decision Completeness:**
All 6 ADRs include rationale. Package versions are pinned (date-stamped). The implementation sequence (8 steps) provides a concrete bootstrap order. Critical decision: financial amounts as INTEGER cents — documented with working and anti-pattern code examples.

**Structure Completeness:**
Every directory and file in the project tree is named and annotated with its purpose. The tree covers frontend, Rust backend, E2E tests, CI/CD workflows, and config files. Nothing is left as "TBD folder." Requirements-to-structure mapping table connects all 7 FR categories to file locations.

**Pattern Completeness:**
8 conflict-prone areas are explicitly addressed: financial storage, SQLite naming, Tauri error shapes, store-vs-direct invoke, date formats, file naming, test location, component responsibility. Each has a CORRECT / WRONG code example pair. Anti-patterns section is a concrete forbidden list.

---

### Gap Analysis Results

**Critical Gaps: None**

**Important Gaps:**

1. **OFX auto-match algorithm location (FR4)** — The architecture establishes `parseOFX.ts` for parsing and `merchant_rules.rs` for rule application, but the function that matches parsed transactions against the rules table during import is not explicitly named or located. Suggested placement: a `matchTransactions.ts` pure function in `src/lib/`, called from `useTransactionStore.importOFX()` after receiving the `ImportResult` from Tauri. This fits existing patterns; no new patterns required.

2. **Update endpoint URL not documented** — `tauri-plugin-updater` requires a configured update manifest URL in `tauri.conf.json`. The architecture confirms GitHub Releases as the host but does not specify the `endpoints` value format. Agents will need: `https://github.com/{owner}/{repo}/releases/latest/download/update-manifest.json` when configuring `tauri.conf.json`.

**Nice-to-Have Gaps:**

- **Initial schema SQL sketch** — `001_initial_schema.sql` is referenced but not sketched. A table list with column types in the architecture doc would give agents a canonical reference. Not blocking — agents will derive this from ADRs and type files.

---

### Architecture Completeness Checklist

**✅ Requirements Analysis**
- [x] Project context thoroughly analyzed
- [x] Scale and complexity assessed
- [x] Technical constraints identified
- [x] Cross-cutting concerns mapped (8 areas)

**✅ Architectural Decisions**
- [x] Critical decisions documented with rationale (ADR-1 through ADR-6)
- [x] Technology stack fully specified with versions
- [x] Integration patterns defined (IPC command list)
- [x] Performance considerations addressed

**✅ Implementation Patterns**
- [x] Naming conventions established (SQL, Rust, TypeScript, feature folders)
- [x] Structure patterns defined (test co-location, shared utilities, E2E separation)
- [x] Communication patterns specified (Component → Store → Tauri, isWriting flag)
- [x] Process patterns documented (error handling, loading states, sign convention enforcement)

**✅ Project Structure**
- [x] Complete directory structure defined (annotated file tree)
- [x] Component boundaries established (3 boundary types: Rust/React, Store/Component, Pure Function)
- [x] Integration points mapped (data flow diagram, launch sequence)
- [x] Requirements to structure mapping complete

---

### Architecture Readiness Assessment

**Overall Status: READY FOR IMPLEMENTATION**

**Confidence Level: High** — all 40 FRs are architecturally supported, no contradictions exist across 6 ADRs, and implementation patterns are specific enough to prevent agent drift on the 8 highest-risk conflict points.

**Key Strengths:**
- The three-layer isomorphism (feature folder = Zustand store = Rust command domain) makes navigation predictable for any agent working on any feature
- INTEGER cents + CHECK constraint + sign convention enforced at 3 layers is unusually robust for a financial app
- ADR-4 (`closing:step-N` sub-state) is a non-obvious crash recovery pattern, well-documented and rationale-explained
- Anti-patterns section with CORRECT/WRONG code examples is highly actionable for AI agents

**Areas for Future Enhancement:**
- Post-MVP: macOS CI workflow addition (Tauri already cross-platform, just CI wiring needed)
- Post-MVP: EV certificate upgrade if SmartScreen reputation requires it
- Post-MVP: E2E test expansion beyond critical integration scenarios
- Encryption at rest (deferred per PRD)

### Implementation Handoff

**AI Agent Guidelines:**
- Follow all architectural decisions exactly as documented
- Use implementation patterns consistently across all components
- Respect project structure and boundaries
- Refer to this document for all architectural questions
- When in doubt on money: INTEGER cents, never REAL
- When in doubt on data access: store action, never direct invoke

**First Implementation Priority:**
```bash
npm create tauri-app@latest garbanzobeans -- --template react-ts
```
Then: Tailwind v4 → shadcn/ui → SQLite plugin → migration runner → initial schema.
