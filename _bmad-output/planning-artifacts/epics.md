---
stepsCompleted: ['step-01-validate-prerequisites', 'step-02-design-epics', 'step-03-create-stories', 'step-04-final-validation']
inputDocuments:
  - _bmad-output/planning-artifacts/prd.md
  - _bmad-output/planning-artifacts/architecture.md
  - _bmad-output/planning-artifacts/ux-design-specification.md
---

# GarbanzoBeans - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for GarbanzoBeans, decomposing the requirements from the PRD, UX Design, and Architecture requirements into implementable stories.

## Requirements Inventory

### Functional Requirements

FR1: User can import an OFX file and have its transactions added to the ledger
FR2: User can view all transactions in a ledger with cleared and working balance displayed separately
FR3: User can manually enter a transaction that starts in uncleared/working state
FR4: System automatically matches imported OFX transactions against existing uncleared entries and marks them cleared
FR5: User can edit any individual transaction's category, amount, date, or payee without affecting merchant rules
FR6: System automatically categorizes imported transactions using stored merchant rules
FR7: User can view a queue of uncategorized transactions and assign a category to each
FR8: User can create a merchant rule from any transaction, defining which part of the payee string identifies the merchant
FR9: System applies the new merchant rule to all future imports automatically
FR10: User can view, edit, and delete all merchant rules from a dedicated rules screen
FR11: User can override a transaction's category without modifying the underlying merchant rule
FR12: User can create budget categories with a type (Rolling, Bill, or Goal)
FR13: User can assign a priority (Need, Should, or Want) to each category
FR14: System displays each envelope's current state (green/orange/red) based on type-specific funding logic
FR15: System displays a tooltip on every envelope explaining why it is in its current state
FR16: User can allocate money to envelopes during the monthly planning session
FR17: User can borrow money from one or more funded envelopes to cover a shortfall in another
FR18: User can borrow from the savings envelope with a distinct confirmation step
FR19: System records borrow events and surfaces them in the month closeout summary
FR20: User can designate a category as the savings category; the savings category is displayed with a distinct visual style — separate section placement, unique color treatment, and a persistent label — that differentiates it from standard budget envelopes throughout the app
FR20a: Savings transactions display a directional indicator (deposit or withdrawal) showing whether money moved into or out of savings, consistent throughout the ledger and wealth calculations
FR21: User can enter a starting savings account balance as a one-time bootstrap value
FR22: System calculates and displays a financial runway metric (months of essential spending covered) based on savings balance and spending patterns
FR23: System displays the runway metric as a fuel gauge visual with color-coded zones
FR24: System displays a savings flow bar chart showing net savings per month (positive = saved, negative = drew down)
FR24a: The runway fuel gauge and savings flow chart are displayed persistently alongside the envelope list on the main screen — not in a separate report or navigable view; both are visible whenever the budget view is open
FR25: System updates the derived savings balance automatically as savings transactions are imported
FR26: System enters "Turn the Month" mode on first app open after month end and requires completion before normal use
FR27: User can review a closeout summary for the prior month including budget performance, savings flow, and runway change
FR28: System surfaces recurring overspend patterns in the closeout summary (same category over budget 2+ months)
FR29: User can confirm or adjust bill due dates for the new month, with suggested dates based on history
FR30: User can confirm expected income timing for the new month
FR31: User can fill envelopes for the new month in a guided allocation flow
FR32: User can specify a data folder location at first launch where all app data will be stored
FR33: User can configure pay frequency and pay dates during onboarding
FR34: User can set a savings target (suggested default: 10% of income, user-adjustable)
FR35: User can update pay frequency, pay dates, and savings target at any time without affecting historical data
FR36: System displays read-only mode when another instance of the app has the data folder locked
FR37: System checks for available updates on launch and prompts the user to install if found
FR38: User can decline an update and continue using the current version
FR39: All data write operations complete fully or not at all; on failure, the data store remains in its last consistent state
FR40: The app upgrades its data storage format automatically on version change without data loss; failed upgrades abort cleanly

### NonFunctional Requirements

NFR1: The app launches and is fully usable within 2 seconds on a modern Windows machine (Windows 10/11, SSD, 8GB+ RAM)
NFR2: OFX import of up to 500 transactions completes within 3 seconds
NFR3: All user interactions (envelope state updates, ledger scroll, allocation changes) respond within 200ms
NFR4: The UI remains responsive during all data persistence operations — all UI interactions during import or month close respond within 500ms
NFR5: All data write operations are atomic; any failure leaves the data store in its prior consistent state with no partial writes
NFR6: OFX import is atomic — either all transactions from a file are committed, or none are
NFR7: The app handles unexpected shutdown gracefully; the database must be readable and consistent on next launch
NFR8: Data format upgrades on version change complete successfully or abort without modifying existing data
NFR9: The app's visual appearance is defined by a custom design system established before implementation begins; all components are styled against this system and default library appearances are not used in the shipped app; visual direction is approved by Tom before any implementation phase begins
NFR10: All envelope state changes (traffic light colors, tooltip text) must be immediately visible after any user action without requiring a manual refresh
NFR11: Every envelope state has a tooltip that explains why it is that color — no color is ever left unexplained
NFR12: The "Turn the Month" ritual must be completable in under 5 minutes for an experienced user
NFR13: No user data leaves the local machine during normal operation
NFR14: No telemetry, analytics, or crash reporting that transmits financial data
NFR15: Auto-update checks are the only outbound network calls; they must fail gracefully with no impact on app function
NFR16: All user data is stored in a user-specified folder; the app never writes data outside that folder (except temporary files during import, which are cleaned up immediately)
NFR17: All user data is portable via a single folder copy — moving the folder to a new machine produces a fully functional app instance
NFR18: The data folder is cloud-sync agnostic; it must work correctly when stored in OneDrive, Dropbox, Box, Google Drive, or a local drive

### Additional Requirements

- **Starter template:** Project initialized via `npm create tauri-app@latest garbanzobeans -- --template react-ts`, then Tailwind CSS v4 and shadcn/ui added manually per official docs. This is Epic 1 Story 1.
- **Financial amounts:** All monetary amounts stored as INTEGER representing cents in SQLite (never REAL/float). Conversion to display string via `formatCurrency()` only at the UI boundary.
- **Date storage:** All dates stored as ISO 8601 strings in UTC in SQLite.
- **SQLite WAL mode:** Enabled explicitly on database open; `PRAGMA integrity_check` runs on every launch before any data access.
- **Sentinel lock file:** Written before database open, released after WAL checkpoint flush on close. Read-only mode enforced when lock is held by another instance.
- **Schema migrations:** Numbered SQL files in `src-tauri/migrations/` (e.g. `001_initial_schema.sql`). Migration runner checks an internal version table; runs only unapplied migrations; failure aborts launch without modifying existing data.
- **Tauri IPC pattern:** ~15–20 typed Tauri commands by domain (transactions, envelopes, savings, months, merchant_rules, settings, migrations). All commands return `Result<T, AppError>` with consistent error shape (`code` + `message`). React never constructs SQL.
- **Store-first IPC:** Components NEVER call `invoke()` directly. All Tauri interactions go through Zustand store actions.
- **Zustand domain slices:** `useEnvelopeStore`, `useTransactionStore`, `useSavingsStore`, `useMerchantRuleStore`, `useMonthStore`, `useSettingsStore`. `isWriting` flag per store suppresses UI updates during active Tauri commands; releases as a batch on resolution.
- **Derived state:** Runway metric, envelope traffic-light states, and savings balance computed as pure JS functions in Zustand layer — no persisted summary tables in SQLite.
- **getEnvelopeStateExplanation():** Pure JS function authored before any envelope component is built. Up to 9 distinct explanations (3 types × 3 states).
- **Feature folder structure:** `src/features/` (envelopes, transactions, savings, month, merchant-rules, settings), `src/components/` (shared UI primitives), `src/stores/`, `src/lib/` (pure utility functions). Feature folders are kebab-case.
- **Test co-location:** Test files co-located with source (e.g. `EnvelopeCard.test.tsx` next to `EnvelopeCard.tsx`). Playwright tests in `e2e/`; WebdriverIO integration tests in `e2e-integration/`.
- **Recharts:** Used for Arc Gauge and Savings Flow Chart; color values passed from design token system.
- **TanStack Router:** Type-safe route guards enforce Turn the Month mode gate (blocks all routes except `/turn-the-month` when month status is `closing:*`) and read-only mode.
- **Month lifecycle state machine:** `months` table with explicit states: `open` / `closing:step-N` / `closed`. Each Turn the Month step commits atomically and marks sub-state. On launch, `closing:step-N` triggers resume from last incomplete step.
- **Savings two-metric architecture:** (1) Savings account balance maintained via `savings_reconciliations` table (user enters real balance; app calculates delta) — used for runway. (2) App-tracked savings flow via categorized transactions — used for bar chart and streaks.
- **Code signing:** Azure Trusted Signing (~$10/month); required before any public release. GitHub Actions secret; signing during release workflow.
- **CI/CD:** GitHub Actions with two workflows: push/PR (cargo test, typecheck, vitest, playwright) and release tag v* (full Tauri build, WebdriverIO, code signing, GitHub Releases upload, update manifest).

### UX Design Requirements

UX-DR1: Design token system fully defined and Tom-approved before any component implementation begins — includes all semantic color tokens (Dark Forest palette: sidebar #0F2218, app BG #111214, surface #1C1E21, lime #C0F500, amber #F5A800, red #ff5555), full typography scale, spacing system (4px base), border radius values, and shadow levels
UX-DR2: All shadcn/ui components (Button, Card, Dialog, Input, Select, Badge, Tooltip, Separator, Progress) themed against the Dark Forest token set before any screen ships — no default shadcn/ui appearance in the shipped app
UX-DR3: Custom Envelope Card component: 4px color-coded left state bar, envelope name, progress bar (56px wide, 3px tall), amount display, state badge — states: funded (lime), on-track (lime), caution (amber), overspent (red), hover (opacity shift); `role="button"`, `aria-label="[name]: [state], [amount]"`, keyboard focusable
UX-DR4: Custom Arc Gauge (Runway Meter) component: SVG semicircle with 3 colored zones (red/amber/lime), filled arc showing current runway percentage, center Display-weight number with "months runway" label, delta indicator (e.g. "↑ +0.3 this month"); arc animates on update; built with SVG paths using design tokens only
UX-DR5: Custom Savings Flow Chart component: 6-month Recharts BarChart, positive bars in savings-positive (#90c820), negative bars in red (#ff5555), current month bar in lime (#C0F500), month labels below, no axes or gridlines
UX-DR6: Custom Import Drop Zone component: 5 states — idle (dashed border, text prompt), drag-over (lime border + background tint), processing (spinner + count text), complete (transitions to import results), error (red border + message + retry affordance)
UX-DR7: Custom Unknown Queue Item component: payee name (interactive text for substring selection), date, amount, themed Select for category, "Save as rule" toggle — inline Substring Rule Builder with lime highlight on selection and pattern preview before confirming
UX-DR8: Custom Substring Rule Builder: payee text rendered as interactive spans, lime background on highlighted selection, live "Match: [pattern]" preview, confirm/dismiss inline — no modal; rule confirmed without leaving the queue item
UX-DR9: Custom Turn the Month Stepper shell: step counter ("Step N of M"), step title, content slot, back/forward affordances; Escape key does not dismiss (full-screen overlay mode); each step's data saved as user advances; back is always non-destructive
UX-DR10: Custom Savings Card component: visually distinct from Envelope Card — "SAVINGS" label (lime, uppercase), account name, deposit status with directional indicator ("↓ $300 deposited"), streak indicator ("3-month streak"), lime border tint; no progress bar or state badge
UX-DR11: Wealth panel: persistent collapsible top pane (~220px height) in the main view — Arc Gauge and Savings Flow Chart visible side by side; visible on every session without navigation; wealth panel houses savings reconciliation entry accessible directly from it
UX-DR12: Two-panel desktop layout: fixed-width sidebar (~220px, Forest Deep background), main content area split into wealth panel (top, ~220px, collapsible) + scrollable envelope list; 8–12 envelopes visible without scroll at 1080p resolution
UX-DR13: Roboto typeface with `font-variant-numeric: tabular-nums` for all financial amounts; type scale: Display 28px/700, H1 20px/600, H2 16px/600, Body 14px/400, Label 12px/500, Caption 11px/400; line-height 1.5 body, 1.2 headings
UX-DR14: Button hierarchy fully themed — Primary (lime bg, dark text), Secondary (lime outline, lime text), Ghost (no border, muted text), Destructive (red outline); one primary button per view maximum; no gray defaults
UX-DR15: Feedback patterns — no celebration modals or toast notifications for positive outcomes; envelope state transitions ambient (lime state bar/badge appears); import completes with queue emptying naturally + ledger summary line; runway arc advances visibly without modal
UX-DR16: Confirmation dialogs (borrow from savings, close month, delete envelope/account): action-stating title ("Borrow $80 from Savings"), consequence body (new balance, new runway), supportive copy tone ("This is exactly what it's for"), Primary confirm (lime) + Ghost cancel with cancel on left
UX-DR17: Tooltip pattern: hover-triggered 300ms delay, max 240px width, appears above (flips below if clipped), required on every color-coded envelope state
UX-DR18: WCAG AA text contrast for all text tokens; focus rings: lime #C0F500 2px/2px-offset on content area interactive elements, white 2px on sidebar items; minimum font size 11px (Caption level)
UX-DR19: Inline editing for envelope names and amounts — single click activates edit mode, Enter or blur confirms, Escape cancels; no explicit "Edit" button
UX-DR20: Onboarding flow: welcome screen (1 sentence, no feature tour) → name budget + start month → add accounts (name + current balance, addable) → create envelopes (suggested categories offered, user customizes amounts) → import transactions (OFX drop with skip option); gets user to value within first session

### FR Coverage Map

| FR | Epic | Description |
|---|---|---|
| FR1 | Epic 3 | OFX file import → transactions added to ledger |
| FR2 | Epic 3 | Dual cleared/working balance ledger view |
| FR3 | Epic 3 | Manual transaction entry (uncleared/working state) |
| FR4 | Epic 3 | Auto-match imported OFX against existing uncleared entries |
| FR5 | Epic 3 | Edit individual transaction without affecting merchant rules |
| FR6 | Epic 4 | Auto-categorize transactions via stored merchant rules |
| FR7 | Epic 4 | Unknown merchant queue + category assignment |
| FR8 | Epic 4 | Create merchant rule from transaction (payee substring) |
| FR9 | Epic 4 | Apply new rule to all future imports |
| FR10 | Epic 4 | View/edit/delete merchant rules screen |
| FR11 | Epic 4 | Override transaction category without modifying rule |
| FR12 | Epic 2 | Create budget categories with Rolling/Bill/Goal type |
| FR13 | Epic 2 | Assign Need/Should/Want priority to each category |
| FR14 | Epic 2 | Traffic-light envelope states based on type-specific funding logic |
| FR15 | Epic 2 | Tooltip on every envelope explaining its state |
| FR16 | Epic 2 | Allocate money to envelopes in planning session |
| FR17 | Epic 2 | Borrow from funded envelopes to cover a shortfall |
| FR18 | Epic 2 | Borrow from savings with distinct confirmation step |
| FR19 | Epic 2 | Record borrow events; surface in closeout summary |
| FR20 | Epic 5 | Savings category with distinct visual treatment (label, placement, color) |
| FR20a | Epic 5 | Savings transactions directional indicator (deposit/withdrawal) |
| FR21 | Epic 5 | Bootstrap starting savings account balance |
| FR22 | Epic 5 | Calculate and display runway metric |
| FR23 | Epic 5 | Fuel gauge visual for runway with color-coded zones |
| FR24 | Epic 5 | Savings flow bar chart (net savings per month) |
| FR24a | Epic 5 | Wealth panel persistent on main screen (not in reports) |
| FR25 | Epic 5 | Auto-update derived savings balance from savings transactions |
| FR26 | Epic 6 | Turn the Month mode gate on first open after month end |
| FR27 | Epic 6 | Closeout summary (budget performance, savings flow, runway change) |
| FR28 | Epic 6 | Drift detection (same category over budget 2+ months) |
| FR29 | Epic 6 | Confirm/adjust bill due dates with suggested dates from history |
| FR30 | Epic 6 | Confirm expected income timing for new month |
| FR31 | Epic 6 | Guided envelope fill flow for new month |
| FR32 | Epic 1 | Data folder location selection at first launch |
| FR33 | Epic 1 | Configure pay frequency and pay dates during onboarding |
| FR34 | Epic 1 | Set savings target (default 10%, user-adjustable) |
| FR35 | Epic 1 | Update settings at any time without historical impact |
| FR36 | Epic 1 | Read-only mode when another instance holds the lock |
| FR37 | Epic 1 | Check for updates on launch, prompt to install if found |
| FR38 | Epic 1 | Decline update and continue on current version |
| FR39 | Epic 1 | Atomic data write operations |
| FR40 | Epic 1 | Auto-upgrade data storage format on version change |

## Epic List

### Epic 1: App Foundation — A Launchable, Beautiful Shell
Tom can install and open GarbanzoBeans, complete first-time setup (data folder, pay frequency, savings target), and land on a correctly-themed two-panel main screen with the full design system applied. The app handles updates, atomic writes, and schema migrations reliably from session 1.
**FRs covered:** FR32, FR33, FR34, FR35, FR36, FR37, FR38, FR39, FR40

### Epic 2: Envelope Budgeting — A Budget Tom Can Actually See
Tom can create typed envelopes (Rolling, Bill, Goal), assign Need/Should/Want priorities, allocate money, and see live traffic-light states with explanatory tooltips on the main screen. He can also handle shortfalls through the borrow flow — including borrowing from savings with a caring confirmation dialog.
**FRs covered:** FR12, FR13, FR14, FR15, FR16, FR17, FR18, FR19

### Epic 3: OFX Import & Ledger — Real Transactions, Real Balances
Tom can drag in an OFX file and watch transactions populate his ledger with both cleared and working balances visible. Transactions auto-match against existing uncleared entries, and he can manually enter or edit any transaction without disturbing merchant rules.
**FRs covered:** FR1, FR2, FR3, FR4, FR5

### Epic 4: Merchant Rules & Smart Categorization — The App Learns Tom's Life
Tom can clear a queue of uncategorized transactions, create merchant rules by highlighting payee substrings, and watch future imports auto-categorize familiar merchants. The weekly session gets shorter every week.
**FRs covered:** FR6, FR7, FR8, FR9, FR10, FR11

### Epic 5: Savings & Wealth Tracking — Runway Always in View
Tom can designate his savings category with distinct visual treatment, bootstrap his savings balance, and see his financial runway (fuel gauge arc) and savings trend (bar chart) persistently alongside the envelope list on every session — making every allocation decision with long-term trajectory in view.
**FRs covered:** FR20, FR20a, FR21, FR22, FR23, FR24, FR24a, FR25

### Epic 6: Turn the Month — The Monthly Ceremony
Tom can complete the guided month-closing ritual: review last month's budget performance with drift detection, confirm bill dates and income timing for the new month, and fill envelopes in a guided flow — all completable in under 5 minutes.
**FRs covered:** FR26, FR27, FR28, FR29, FR30, FR31

---

## Epic 1: App Foundation — A Launchable, Beautiful Shell

Tom can install and open GarbanzoBeans, complete first-time setup (data folder, pay frequency, savings target), and land on a correctly-themed two-panel main screen with the full design system applied. The app handles updates, atomic writes, and schema migrations reliably from session 1.

### Story 1.1: Project Scaffold — Running Tauri + React App

As a developer,
I want a properly initialized Tauri + React + TypeScript project with Tailwind CSS, shadcn/ui, Vitest, and a passing GitHub Actions CI workflow,
So that all subsequent stories have a stable, correctly-structured foundation to build on.

**Acceptance Criteria:**

**Given** a fresh development machine with Node.js and Rust installed
**When** the developer runs `npm create tauri-app@latest garbanzobeans -- --template react-ts` and follows the documented post-scaffold steps
**Then** the app window opens successfully with `tauri dev` and shows a basic placeholder screen

**Given** the project is scaffolded
**When** Tailwind CSS v4 and shadcn/ui are added per their official docs
**Then** a test shadcn/ui Button component renders correctly with Tailwind styles applied

**Given** the feature folder structure is established (`src/features/`, `src/components/`, `src/stores/`, `src/lib/`, `e2e/`, `e2e-integration/`)
**When** the project structure is reviewed
**Then** the folder layout matches the architecture spec exactly; no business logic exists outside `src/`

**Given** Vitest is configured and a placeholder test exists
**When** `npm run test` is run
**Then** the placeholder test passes and the test runner exits cleanly

**Given** a GitHub Actions push/PR workflow is defined with `cargo test`, `npm run typecheck`, `npm run test`
**When** code is pushed to the repository
**Then** the CI workflow runs and passes on the main branch

---

### Story 1.2: Design System Foundation — Dark Forest Token Set

As Tom,
I want the app's visual design system — color tokens, typography, spacing, and themed base components — to be fully implemented and applied to the app shell layout,
So that every subsequent screen inherits the correct visual identity from the start and no default component appearance ever ships.

**Acceptance Criteria:**

**Given** the Dark Forest palette is approved (sidebar `#0F2218`, app BG `#111214`, surface `#1C1E21`, lime `#C0F500`, amber `#F5A800`, red `#ff5555`)
**When** the design token CSS custom properties are defined in the global stylesheet
**Then** all 27 semantic tokens from the UX spec are present as CSS variables and resolve to their specified values

**Given** Roboto is loaded as the primary typeface
**When** any text renders in the app
**Then** the correct type scale is applied: Display 28px/700, H1 20px/600, H2 16px/600, Body 14px/400, Label 12px/500, Caption 11px/400; all financial-display text uses `font-variant-numeric: tabular-nums`

**Given** the shadcn/ui component library is installed
**When** Button, Card, Dialog, Input, Select, Badge, Tooltip, Separator, and Progress components render
**Then** none show their default shadcn/ui appearance; all reflect Dark Forest token values for background, text, border, and interactive states

**Given** the button hierarchy is implemented
**When** each button variant renders
**Then** Primary = lime bg + dark text; Secondary = lime outline + lime text; Ghost = no border + muted text; Destructive = red outline; exactly one Primary allowed per view

**Given** the two-panel layout shell is implemented
**When** the app window opens
**Then** a fixed-width sidebar (~220px, Forest Deep `#0F2218` background) and main content area are present; the layout is stable and correct at 1920×1080 and 1366×768 resolutions

**Given** focus states are defined
**When** a user tabs through interactive elements in the content area
**Then** a 2px lime `#C0F500` focus ring with 2px offset is visible; sidebar interactive items show a white 2px focus ring

---

### Story 1.3: SQLite Infrastructure — Database, Migrations, and Atomic Writes

As a developer,
I want a fully operational SQLite backend with WAL mode, a migration runner, an initial schema, and a consistent Tauri command error pattern,
So that all subsequent stories can write data with guaranteed atomicity and the schema can evolve without data loss.

**Acceptance Criteria:**

**Given** `tauri-plugin-sql` is installed and configured
**When** the app launches
**Then** the SQLite database file is created in the user-selected data folder (or a temporary location pre-onboarding); WAL mode is enabled via `PRAGMA journal_mode=WAL`

**Given** the app launches
**When** the migration runner executes before any data access
**Then** it checks the internal `schema_version` table; runs only unapplied numbered migration files from `src-tauri/migrations/`; `001_initial_schema.sql` creates the `settings` and `schema_version` tables

**Given** a migration fails mid-run
**When** the migration runner detects the failure
**Then** the launch aborts cleanly; no partial migration is committed; the database remains in its last consistent state; the user sees an error message explaining the issue (FR40)

**Given** `PRAGMA integrity_check` runs on every launch before any data access
**When** the database is healthy
**Then** the check completes and returns `ok`; the app proceeds to load normally

**Given** all Tauri commands are structured to return `Result<T, AppError>`
**When** a command is defined
**Then** the `AppError` struct has `code: String` and `message: String` fields; all command errors use this shape; React receives typed rejections

**Given** a write operation fails mid-execution
**When** the Rust command catches the error
**Then** the SQLite transaction is rolled back; the data store remains in its prior consistent state; no partial write is committed (FR39)

---

### Story 1.4: App State Foundation — Zustand Stores + TanStack Router

As a developer,
I want all Zustand domain slices scaffolded and TanStack Router configured with type-safe routes and mode guards,
So that all subsequent feature stories can wire state and navigation into a ready infrastructure without architectural rework.

**Acceptance Criteria:**

**Given** Zustand is installed
**When** the app initializes
**Then** six domain slices exist as importable hooks: `useSettingsStore`, `useEnvelopeStore`, `useTransactionStore`, `useSavingsStore`, `useMerchantRuleStore`, `useMonthStore`; each has an `isWriting: boolean` flag initialized to `false`

**Given** TanStack Router is installed and configured
**When** the app loads
**Then** all six routes are defined and reachable: `/onboarding`, `/` (Budget), `/ledger`, `/merchant-rules`, `/settings`, `/turn-the-month`; route params and search params are type-safe

**Given** the Turn the Month route guard is in place
**When** `useMonthStore` reports month status as `closing:*`
**Then** all routes except `/turn-the-month` redirect to `/turn-the-month`; navigating away from Turn the Month while in `closing:*` status is blocked

**Given** the read-only route guard is in place
**When** the sentinel lock indicates another instance holds the lock
**Then** the app enters read-only mode and the UI reflects this state visually; write actions are disabled

**Given** a Tauri command is invoked via a store action
**When** the command is in-flight
**Then** the store's `isWriting` flag is `true`; UI updates that depend on that store's data are suppressed until the command resolves; on resolution the flag clears and the UI updates as a batch

---

### Story 1.5: Onboarding — First Launch Setup

As Tom,
I want a fast, friction-free first-launch setup that asks me only what's necessary (data folder, pay frequency, savings target),
So that I'm ready to use the app within minutes without sitting through a methodology lecture.

**Acceptance Criteria:**

**Given** the app is launched for the first time (no data folder configured)
**When** the app opens
**Then** it displays the onboarding welcome screen with a single-sentence description; no feature tour or methodology explanation is shown

**Given** the onboarding welcome screen is shown
**When** the user proceeds through the flow
**Then** the steps are presented in order: (1) name your budget + set start month, (2) select data folder location, (3) configure pay frequency and pay dates, (4) set savings target; a step counter ("Step N of 4") is visible throughout

**Given** the user is on the data folder selection step
**When** they click to browse for a folder
**Then** a native OS folder picker dialog opens via Tauri; the selected path is displayed before the user confirms; the sentinel lock file is written to that folder on confirmation (FR32)

**Given** the user sets pay frequency (weekly / bi-weekly / twice monthly / monthly) and pay dates
**When** they confirm the setting
**Then** the configuration is stored in the `settings` table in SQLite (FR33)

**Given** the user sets a savings target
**When** they enter a value or leave the default
**Then** 10% is pre-populated in the input field; the entered value is stored in the `settings` table (FR34)

**Given** the user completes all onboarding steps
**When** they confirm the final step
**Then** they land on the main Budget screen (`/`); onboarding is not shown again on subsequent launches

---

### Story 1.6: Settings Screen — Update Configuration Anytime

As Tom,
I want to update my pay frequency, pay dates, and savings target from the Settings screen at any time,
So that my configuration stays accurate as my financial situation changes without altering any historical data.

**Acceptance Criteria:**

**Given** the user navigates to `/settings`
**When** the settings screen renders
**Then** current pay frequency, pay dates, and savings target are pre-populated with their stored values

**Given** the user changes pay frequency and saves
**When** the change is committed to SQLite
**Then** the new setting applies from that point forward; no historical transaction records, month records, or envelope allocations are modified (FR35)

**Given** the user changes the savings target and saves
**When** the change is committed
**Then** the new target is stored; past months are unaffected; future calculations use the new value

**Given** the user navigates away from Settings without saving
**When** they return to the screen
**Then** the screen shows the last saved values, not the unsaved edits

---

### Story 1.7: Sentinel Lock + Read-Only Mode

As Tom,
I want the app to detect when another instance already has the data folder open and gracefully switch to read-only mode,
So that two instances can never corrupt the database by writing simultaneously.

**Acceptance Criteria:**

**Given** the app opens and no sentinel lock file exists in the data folder
**When** initialization completes
**Then** the sentinel lock file is written to the data folder; the app opens in normal read-write mode

**Given** the app opens and a sentinel lock file already exists in the data folder
**When** initialization detects the existing lock
**Then** the app opens in read-only mode; a persistent, clearly visible indicator ("Read-Only — another instance is open") is displayed; all write actions are disabled (FR36)

**Given** the app is in read-only mode
**When** the user attempts a write action
**Then** the action is blocked; an inline message explains why; no modal is shown

**Given** the app closes normally
**When** the close event fires
**Then** a WAL checkpoint flush is executed; the sentinel lock file is deleted from the data folder

---

### Story 1.8: Auto-Update with User Confirmation

As Tom,
I want the app to check for updates on launch and ask me before installing anything,
So that I'm always on the latest version but never surprised by a silent update.

**Acceptance Criteria:**

**Given** the app launches and a new version is available at the GitHub Releases update manifest
**When** `tauri-plugin-updater` detects the update
**Then** a non-modal prompt is shown: version number, "Update now?" with a Primary Confirm and Ghost Decline button (FR37)

**Given** the update prompt is shown
**When** the user confirms the update
**Then** the update downloads, installs, and the app relaunches; the prompt does not appear again for the same version

**Given** the update prompt is shown
**When** the user declines
**Then** the app continues loading normally; the prompt does not appear again in the current session (FR38)

**Given** the update check fails (no network or manifest unreachable)
**When** the failure occurs
**Then** the app continues loading normally; no error is shown to the user; the failure is logged in development builds only (NFR15)

---

### Story 1.9: Release Pipeline — CI/CD and Code Signing

As a developer,
I want a complete GitHub Actions release pipeline that builds, signs, and publishes GarbanzoBeans to GitHub Releases with a Tauri update manifest,
So that auto-update works end-to-end and the shipped binary is properly code-signed.

**Acceptance Criteria:**

**Given** a git tag matching `v*` is pushed
**When** the release GitHub Actions workflow runs
**Then** it executes: full Tauri Windows x64 build, Azure Trusted Signing code signing step, upload of the installer to GitHub Releases, and update of the Tauri update manifest JSON

**Given** the release workflow runs
**When** code signing is applied via Azure Trusted Signing
**Then** the signed binary passes the signing step; the certificate is stored as a GitHub Actions secret and never committed to source

**Given** the update manifest is generated
**When** `tauri-plugin-updater` on a user machine fetches it
**Then** the manifest contains a valid version string, download URL, and signature that the updater can verify

**Given** the push/PR workflow is defined
**When** a pull request is opened
**Then** it runs: `cargo test`, `npm run typecheck`, `npm run test` (Vitest), and `npm run test:e2e:ui` (Playwright against Vite dev server); all checks must pass before merge

---

## Epic 2: Envelope Budgeting — A Budget Tom Can Actually See

Tom can create typed envelopes (Rolling, Bill, Goal), assign Need/Should/Want priorities, allocate money, and see live traffic-light states with explanatory tooltips on the main screen. He can also handle shortfalls through the borrow flow — including borrowing from savings with a caring confirmation dialog.

### Story 2.1: Envelope Schema + Data Model

As a developer,
I want the SQLite schema and Zustand store for envelopes, along with the typed Tauri commands for creating and updating envelopes,
So that all envelope feature stories have a correct, atomic data layer to build on.

**Acceptance Criteria:**

**Given** the migration runner runs on launch
**When** `002_envelopes.sql` is applied
**Then** the `envelopes` table exists with columns: `id`, `name`, `type` (Rolling/Bill/Goal), `priority` (Need/Should/Want), `allocated_cents` (INTEGER), `month_id` (INTEGER FK), `created_at` (ISO 8601 TEXT); all monetary amounts stored as INTEGER cents

**Given** the `useEnvelopeStore` Zustand slice is populated
**When** the app loads
**Then** envelopes are hydrated from SQLite via the `get_envelopes` Tauri command; the store holds the canonical envelope list

**Given** a `create_envelope` Tauri command is invoked
**When** the command executes
**Then** the new envelope is inserted in a SQLite transaction; on success the store updates; on failure the transaction rolls back and the store's `isWriting` flag clears with an error

**Given** an `update_envelope` Tauri command is invoked
**When** the command executes
**Then** the envelope record is updated atomically; the store reflects the change immediately (optimistic update rolled back on failure)

---

### Story 2.2: Create and Manage Envelopes

As Tom,
I want to create budget categories with a type (Rolling, Bill, or Goal) and a priority (Need, Should, or Want),
So that my budget structure reflects how I actually think about my spending.

**Acceptance Criteria:**

**Given** Tom is on the Budget screen
**When** he clicks "Add Envelope"
**Then** an inline creation form appears (no modal) with fields: name, type selector (Rolling/Bill/Goal), priority selector (Need/Should/Want); a Secondary "Save" button and Ghost "Cancel" are shown

**Given** Tom fills in the form and saves
**When** the `create_envelope` command succeeds
**Then** the new envelope appears in the envelope list immediately; the creation form closes; the list does not require a refresh (FR12, FR13)

**Given** Tom clicks directly on an envelope name
**When** the click occurs
**Then** the name field enters inline edit mode; pressing Enter or blurring confirms; pressing Escape cancels without saving (UX-DR19)

**Given** Tom wants to delete an envelope
**When** he accesses the delete action in envelope settings
**Then** a Destructive confirmation dialog appears; confirming removes the envelope and its allocation; cancelling makes no change

---

### Story 2.3: Envelope State Logic — Traffic Lights + Tooltips

As Tom,
I want every envelope to show a clear color-coded state (green/amber/red) with a tooltip explaining exactly why it's that color,
So that I always know where I stand without having to figure it out.

**Acceptance Criteria:**

**Given** `getEnvelopeStateExplanation(type, state)` is authored as a pure JS function in `src/lib/`
**When** the function is called with any valid type/state combination
**Then** it returns one of 9 distinct text explanations (3 types × 3 states); the function has unit test coverage for all 9 cases

**Given** envelopes are displayed on the Budget screen
**When** an envelope's allocated/spent ratio changes
**Then** the Envelope Card immediately shows the correct state bar color: lime (funded/on-track), amber (caution), red (overspent); the update is visible without a manual refresh (NFR10)

**Given** a Rolling envelope has been fully allocated and spending is under budget
**When** the card renders
**Then** state bar is lime; badge reads "Funded"; tooltip explains on-track status against rolling budget (FR14, FR15)

**Given** a Bill envelope is partially funded or overdue
**When** the card renders
**Then** state bar is amber; badge shows due date; tooltip explains the bill date and funding status

**Given** any envelope is overspent
**When** the card renders
**Then** state bar is red; amount displayed in red; badge reads "Over budget"; tooltip explains the shortfall amount

**Given** a user hovers over a state badge
**When** the tooltip trigger fires (300ms delay)
**Then** the tooltip appears above the badge (flips below if clipped), max 240px wide, with the plain-text explanation from `getEnvelopeStateExplanation` (UX-DR17)

---

### Story 2.4: Envelope Allocation — Monthly Planning Session

As Tom,
I want to allocate money to my envelopes for the month in a guided flow,
So that my budget is funded and ready before the month's spending begins.

**Acceptance Criteria:**

**Given** Tom opens the monthly allocation flow
**When** the flow renders
**Then** all envelopes are shown with their current allocated amount and an editable input; the available balance to allocate is shown at the top and updates live as amounts are entered (FR16)

**Given** Tom types an amount into an envelope's allocation input
**When** he moves to the next field (blur or Tab)
**Then** the input validates on blur, not on keystroke; invalid inputs (non-numeric, negative) show a red border + inline error message below the field; no modal

**Given** Tom confirms the allocation
**When** the `allocate_envelopes` Tauri command succeeds
**Then** all envelope balances update immediately; envelope states (traffic light) recalculate and render without a refresh; the sum of allocations cannot exceed available income

**Given** Tom's allocations sum to more than available income
**When** he attempts to confirm
**Then** the save is blocked with an inline message identifying the overage; the form remains open for correction

---

### Story 2.5: Borrow Flow — Covering a Shortfall

As Tom,
I want to borrow money from other funded envelopes to cover a shortfall in one envelope,
So that I can handle unexpected expenses without the app making me feel bad about it.

**Acceptance Criteria:**

**Given** an envelope is at $0 or overspent
**When** Tom clicks "Borrow"
**Then** a borrow overlay opens showing funded envelopes sorted by priority: Want envelopes first, then Should, then Need; savings envelope appears last, visually separated (FR17)

**Given** the borrow overlay is open
**When** Tom selects an amount to borrow from an envelope
**Then** the source envelope's available balance decreases in real time; the target envelope's balance increases; the borrow is not committed until Tom confirms

**Given** Tom selects the savings envelope as a source
**When** the selection is made
**Then** a distinct confirmation dialog opens (FR18); title states the action ("Borrow $X from Savings"); body shows resulting savings balance and runway estimate; copy reads supportively ("This is exactly what it's for"); Primary Confirm + Ghost Cancel with Cancel on the left (UX-DR16)

**Given** Tom confirms the borrow
**When** the `borrow_from_envelope` Tauri command succeeds
**Then** the source envelope's balance is reduced; the target envelope turns green; the borrow event is recorded in SQLite for the closeout summary (FR19); the overlay closes; no follow-up modal

**Given** Tom cancels the borrow at any point
**When** cancellation occurs
**Then** no data is changed; both envelopes return to their previous states

---

## Epic 3: OFX Import & Ledger — Real Transactions, Real Balances

Tom can drag in an OFX file and watch transactions populate his ledger with both cleared and working balances visible. Transactions auto-match against existing uncleared entries, and he can manually enter or edit any transaction without disturbing merchant rules.

### Story 3.1: Transaction Schema + Data Model

As a developer,
I want the SQLite schema and Zustand store for transactions, along with the core Tauri commands for reading and writing transactions,
So that all transaction feature stories have a correct, atomic data layer to build on.

**Acceptance Criteria:**

**Given** the migration runner runs on launch
**When** `003_transactions.sql` is applied
**Then** the `transactions` table exists with columns: `id`, `payee`, `amount_cents` (INTEGER), `date` (ISO 8601 TEXT), `envelope_id` (INTEGER FK, nullable), `is_cleared` (INTEGER 0/1), `import_batch_id` (TEXT, nullable), `created_at` (ISO 8601 TEXT); index `idx_transactions_month_id` exists

**Given** the `useTransactionStore` Zustand slice is populated
**When** the app loads
**Then** transactions for the current month are hydrated from SQLite via `get_transactions`; the store holds cleared and uncleared transactions separately

**Given** any Tauri command writes transactions
**When** the command executes
**Then** all writes use SQLite transactions; partial writes are never committed; on failure the store rolls back the optimistic update

---

### Story 3.2: OFX Import — File Ingestion and Atomic Commit

As Tom,
I want to drag an OFX file onto the app and have all its transactions imported atomically,
So that either my full import succeeds or nothing changes — no partial state.

**Acceptance Criteria:**

**Given** Tom drags an OFX file onto the app window
**When** the file lands on the Import Drop Zone
**Then** the drop zone transitions from idle state (dashed border) to drag-over state (lime border + background tint) during the drag, then to processing state (spinner + "Parsing N transactions…") on drop (UX-DR6)

**Given** the OFX file is valid and parsed
**When** the `import_ofx` Tauri command runs
**Then** all transactions from the file are inserted in a single SQLite transaction; if any insertion fails, the entire import rolls back and zero transactions are committed (NFR6); import of up to 500 transactions completes within 3 seconds (NFR2)

**Given** the OFX file is invalid or unrecognized
**When** parsing fails
**Then** the drop zone shows the error state: red border, inline error message describing the problem, retry affordance; no transactions are added

**Given** the import succeeds
**When** the commit completes
**Then** the drop zone closes/collapses naturally (no completion modal); an import summary line appears in the ledger header ("Import — Oct 12 — 23 transactions"); envelope states update to reflect the new transactions (FR1)

---

### Story 3.3: Dual Balance Ledger View

As Tom,
I want to see all my transactions in a ledger with both cleared and working balances shown separately,
So that I always know what my bank has confirmed versus what I've entered myself.

**Acceptance Criteria:**

**Given** Tom navigates to `/ledger`
**When** the ledger view renders
**Then** transactions are displayed in reverse-chronological order with columns: date, payee, category, amount; the header shows two distinct balance figures: cleared balance (sum of is_cleared=1 transactions) and working balance (sum of all transactions) (FR2)

**Given** both balance figures are displayed
**When** the values render
**Then** all amounts use `font-variant-numeric: tabular-nums` and are right-aligned; `formatCurrency()` converts cent values to display strings at the UI boundary only

**Given** the ledger contains more transactions than fit in the viewport
**When** Tom scrolls
**Then** the scroll response is within 200ms; the header with balance totals remains fixed (NFR3)

**Given** a transaction is imported
**When** it appears in the ledger
**Then** it is initially shown as uncleared (is_cleared=0); cleared transactions are visually distinguished from uncleared ones

---

### Story 3.4: Auto-Match — Clearing Imported Transactions

As Tom,
I want imported OFX transactions to automatically match and clear against existing uncleared entries I've already entered manually,
So that I don't have to manually reconcile what I've already recorded.

**Acceptance Criteria:**

**Given** an OFX file is imported containing a transaction that matches an existing uncleared entry (same payee substring, same amount, date within 3 days)
**When** the `import_ofx` command runs its matching logic
**Then** the existing uncleared transaction is marked as cleared (is_cleared=1) and linked to the imported record; a duplicate is not created (FR4)

**Given** an imported transaction has no match in existing uncleared entries
**When** the import commits
**Then** the transaction is inserted as a new cleared entry

**Given** multiple existing uncleared entries could match the same imported transaction
**When** the matching logic runs
**Then** the closest match by date is selected; ties resolved by amount; no silent double-match occurs

---

### Story 3.5: Manual Transaction Entry and Editing

As Tom,
I want to manually enter a transaction and edit any transaction's details without affecting merchant rules,
So that I can record spending before it clears and correct mistakes freely.

**Acceptance Criteria:**

**Given** Tom clicks "Add Transaction" in the ledger
**When** the inline entry form appears
**Then** fields are shown for: payee, amount, date (defaulting to today), category (envelope selector); the transaction saves as uncleared (is_cleared=0) on confirm (FR3)

**Given** Tom clicks on any field of an existing transaction row
**When** the click occurs
**Then** that field enters inline edit mode; Enter or blur confirms the change; Escape cancels (UX-DR19)

**Given** Tom changes a transaction's category
**When** the `update_transaction` command succeeds
**Then** the transaction's envelope_id is updated; the affected envelopes' balances and states recalculate immediately; the merchant rule for that payee is not modified (FR5)

**Given** Tom changes a transaction's amount
**When** the update commits
**Then** the cleared and working balance totals in the ledger header update immediately without a refresh

---

## Epic 4: Merchant Rules & Smart Categorization — The App Learns Tom's Life

Tom can clear a queue of uncategorized transactions, create merchant rules by highlighting payee substrings, and watch future imports auto-categorize familiar merchants. The weekly session gets shorter every week.

### Story 4.1: Merchant Rules Schema + Data Model

As a developer,
I want the SQLite schema and Zustand store for merchant rules, along with the typed Tauri commands for CRUD operations on rules,
So that all merchant rule feature stories have a correct, versioned, conflict-aware data layer to build on.

**Acceptance Criteria:**

**Given** the migration runner runs on launch
**When** `004_merchant_rules.sql` is applied
**Then** the `merchant_rules` table exists with columns: `id`, `payee_substring` (TEXT), `envelope_id` (INTEGER FK), `version` (INTEGER), `created_at` (ISO 8601 TEXT), `last_matched_at` (ISO 8601 TEXT, nullable), `match_count` (INTEGER DEFAULT 0)

**Given** the `useMerchantRuleStore` Zustand slice is populated
**When** the app loads
**Then** all merchant rules are hydrated from SQLite via `get_merchant_rules`; the store holds the full rule list

**Given** two rules in the store share an overlapping `payee_substring`
**When** an import is processed
**Then** the conflict is detected and surfaced to the user as an inline warning rather than silently resolved

**Given** any rule write command executes
**When** it commits
**Then** the write is atomic; `match_count` and `last_matched_at` are updated when a rule matches during import

---

### Story 4.2: Auto-Categorization on Import

As Tom,
I want imported transactions to be automatically categorized using my stored merchant rules,
So that familiar payees require zero manual work on future imports.

**Acceptance Criteria:**

**Given** merchant rules exist in the store
**When** an OFX file is imported
**Then** the `import_ofx` command applies each rule by checking if its `payee_substring` appears in the transaction's payee string (case-insensitive); matching transactions are assigned the rule's `envelope_id` automatically (FR6)

**Given** a transaction is auto-categorized
**When** it appears in the import results
**Then** a "→ Groceries via Kroger rule" inline label is shown on the transaction row; the matched rule's `match_count` increments and `last_matched_at` updates

**Given** a transaction's payee matches no stored rule
**When** the import completes
**Then** the transaction is added to the unknown merchant queue with `envelope_id` null; it is not auto-categorized

**Given** auto-categorized transactions are committed
**When** the import resolves
**Then** affected envelope balances and states update immediately without a refresh (NFR10)

---

### Story 4.3: Unknown Merchant Queue — Manual Categorization

As Tom,
I want to see a queue of uncategorized transactions after an import and assign a category to each one,
So that every transaction is categorized before I close the import session.

**Acceptance Criteria:**

**Given** an import contains uncategorized transactions
**When** the import completes
**Then** the unknown merchant queue is displayed showing count ("4 transactions need a category"); each queue item shows: payee name, date, amount, category Select (UX-DR7)

**Given** Tom selects a category from the dropdown for a queue item
**When** the selection is made
**Then** the `update_transaction` command assigns the envelope_id; the transaction is removed from the queue; the affected envelope's balance and state update in real time (FR7)

**Given** the last item in the queue is categorized
**When** it resolves
**Then** the queue empties naturally with no completion modal; the import view closes or collapses; a summary line appears in the ledger (UX-DR15)

**Given** the category Select is open
**When** Tom navigates it
**Then** it is keyboard-navigable (arrow keys, Enter to select, Escape to dismiss); most recently used categories float to the top of the list

---

### Story 4.4: Substring Rule Builder — Creating Rules Inline

As Tom,
I want to highlight part of a payee name to define a merchant matching rule right within the import queue,
So that future transactions from the same merchant categorize automatically without any extra steps.

**Acceptance Criteria:**

**Given** Tom is on an Unknown Queue Item
**When** he toggles "Save as rule"
**Then** the Substring Rule Builder activates inline: the payee text is rendered as interactive character spans; Tom can highlight a substring via mouse drag or keyboard selection (UX-DR8)

**Given** Tom highlights a substring of the payee name
**When** the selection is active
**Then** the highlighted text shows a lime background; a live preview reads "Match: [pattern] → [selected category]" before any save action

**Given** Tom confirms the rule
**When** the `create_merchant_rule` command succeeds
**Then** the rule is stored with the selected `payee_substring` and `envelope_id`; a new rule version is created; the confirmation is inline — no modal or settings navigation required (FR8)

**Given** Tom dismisses the rule builder without saving
**When** dismissal occurs
**Then** the transaction is still categorized with the manually selected category; no rule is created; no data is changed

---

### Story 4.5: Rule Application — Forward-Only on Future Imports

As Tom,
I want new merchant rules to apply automatically to all future imports without requiring any action from me,
So that the app gets smarter without me having to manage it.

**Acceptance Criteria:**

**Given** a merchant rule exists for "KROGER" → Groceries
**When** the next OFX import runs and includes a transaction with "KROGER #0423" as the payee
**Then** the transaction is auto-categorized to Groceries; the rule's `match_count` increments; `last_matched_at` updates (FR9)

**Given** a merchant rule is created or edited
**When** the change is committed
**Then** the rule applies only from that point forward; past transactions that previously matched are not retroactively recategorized; historical records are immutable

**Given** two rules both match the same payee on an import
**When** the conflict is detected
**Then** an inline conflict warning is shown on the affected transaction in the queue; the transaction is not silently resolved; Tom must manually select the correct category

---

### Story 4.6: Merchant Rules Screen — View, Edit, Delete

As Tom,
I want a dedicated screen to view all my merchant rules, see how often each one fires, and edit or delete them,
So that I can keep my ruleset clean and accurate over time.

**Acceptance Criteria:**

**Given** Tom navigates to `/merchant-rules`
**When** the rules screen renders
**Then** all merchant rules are listed with: payee substring, mapped category, match count, last matched date; the list is sortable by match count and last matched date (FR10)

**Given** Tom clicks on a rule to edit it
**When** the edit form opens
**Then** he can modify the payee substring and/or the mapped envelope; saving creates a new rule version; past transactions store a reference to the rule version that matched them; historical categorizations are unaffected

**Given** Tom deletes a rule
**When** the `delete_merchant_rule` command succeeds
**Then** the rule is removed from the store and the list; future imports no longer apply it; past transactions that matched the rule retain their categorization

**Given** Tom overrides a transaction's category in the ledger
**When** the `update_transaction` command executes
**Then** the transaction's `envelope_id` is updated; the underlying merchant rule is not modified (FR11)

---

## Epic 5: Savings & Wealth Tracking — Runway Always in View

Tom can designate his savings category with distinct visual treatment, bootstrap his savings balance, and see his financial runway (fuel gauge arc) and savings trend (bar chart) persistently alongside the envelope list on every session — making every allocation decision with long-term trajectory in view.

### Story 5.1: Savings Schema + Two-Metric Data Model

As a developer,
I want the SQLite schema and Zustand store for both savings metrics — reconciliation-based balance and transaction-flow tracking — along with the Tauri commands to read and write them,
So that runway and savings flow can be derived from clean, separate data sources.

**Acceptance Criteria:**

**Given** the migration runner runs on launch
**When** `005_savings.sql` is applied
**Then** the `savings_reconciliations` table exists with columns: `id`, `date` (ISO 8601 TEXT), `entered_balance_cents` (INTEGER), `previous_tracked_balance_cents` (INTEGER), `delta_cents` (INTEGER), `note` (TEXT, nullable); the `envelopes` table has an `is_savings` (INTEGER 0/1) column added via migration

**Given** the `useSavingsStore` Zustand slice is populated
**When** the app loads
**Then** reconciliation history is hydrated from `savings_reconciliations`; the store derives current tracked savings balance from the most recent reconciliation entry plus subsequent savings transactions

**Given** savings transactions follow the sign convention
**When** any savings transaction amount is stored or read
**Then** negative amounts represent deposits to savings (outflow from checking); positive amounts represent withdrawals; a SQLite CHECK constraint enforces the sign convention

**Given** any savings write command executes
**When** it commits
**Then** the write is atomic; the store's derived savings balance recalculates immediately after commit

---

### Story 5.2: Savings Category — Distinct Visual Treatment

As Tom,
I want to designate one envelope as my savings category and have it look and behave distinctly from regular envelopes,
So that I always know my savings is in a different class from my spending budget.

**Acceptance Criteria:**

**Given** Tom designates an envelope as the savings category (via the `update_envelope` command setting `is_savings=1`)
**When** the Budget screen renders
**Then** the savings envelope is displayed in a visually separate section from the standard envelope list; it uses the Savings Card component: "SAVINGS" label (lime, uppercase), account name, no progress bar, lime border tint (FR20, UX-DR10)

**Given** savings transactions appear in the ledger
**When** a savings transaction renders
**Then** a directional indicator is shown: "↓ deposited" for negative amounts (deposits), "↑ withdrew" for positive amounts (withdrawals); consistent throughout the ledger and wealth calculations (FR20a)

**Given** only one envelope can be the savings category
**When** Tom tries to designate a second envelope as savings
**Then** the action is blocked with an inline message; the existing savings designation is not changed

---

### Story 5.3: Savings Balance Bootstrap and Reconciliation

As Tom,
I want to enter my current real savings account balance so the app can track my runway from day one,
So that I don't have to reconstruct my savings history before getting useful data.

**Acceptance Criteria:**

**Given** Tom reaches the Budget screen for the first time with no reconciliation entry
**When** the wealth panel renders
**Then** it displays "—" in place of a runway number; a prompt invites Tom to enter his current savings balance to activate runway tracking

**Given** Tom enters his current savings balance in the reconciliation input in the wealth panel
**When** the `record_reconciliation` command succeeds
**Then** a `savings_reconciliations` entry is created with `entered_balance_cents` = Tom's input, `previous_tracked_balance_cents` = 0, `delta_cents` = the entered amount; this serves as the bootstrap entry (FR21)

**Given** a reconciliation entry already exists
**When** Tom enters a new real balance
**Then** the app displays the current tracked balance alongside Tom's entered value for reference; `delta_cents` is calculated automatically; an optional note field is available; Tom does not need to compute or enter the delta

**Given** a reconciliation is saved
**When** the commit resolves
**Then** the runway metric recalculates immediately; the wealth panel updates without a refresh

---

### Story 5.4: Runway Metric — Derive and Display

As Tom,
I want the app to calculate how many months of essential spending my savings covers and show that number prominently,
So that every session I can see at a glance whether I'm building a real financial runway.

**Acceptance Criteria:**

**Given** a savings balance and at least one month of spending history exist
**When** `deriveRunway(savingsBalance, essentialSpendingAverage)` is called
**Then** it returns months of runway as a decimal (e.g. 2.4); essential spending = average of Need-priority envelope spend over available months; the function is a pure JS computation in `src/lib/deriveRunway.ts` with unit test coverage (FR22)

**Given** the runway value is computed
**When** it renders in the wealth panel
**Then** the primary Display-weight number shows the months value; a label reads "months runway"; a delta line shows change since last month (e.g. "↑ +0.3 this month") in directional color

**Given** no savings balance has been entered
**When** the wealth panel renders
**Then** the runway display shows "—"; no calculation is attempted on null data

---

### Story 5.5: Arc Gauge — Runway Visualized

As Tom,
I want to see my financial runway as a fuel gauge arc with color-coded zones,
So that I can understand my financial health at a glance without reading a number.

**Acceptance Criteria:**

**Given** a runway value exists
**When** the Arc Gauge component renders
**Then** a SVG semicircle arc displays three zones: red (<1 month), amber (1–3 months), lime (3+ months); the filled arc represents the current runway value; center shows the Display-weight months number; "months runway" label appears below (FR23, UX-DR4)

**Given** the runway falls in the red zone (<1 month)
**When** the arc renders
**Then** the filled arc uses `--color-runway-critical` (`#ff5555`); background track uses `--color-gauge-track` (`#26282C`)

**Given** the runway falls in the amber zone (1–3 months)
**When** the arc renders
**Then** the filled arc uses `--color-runway-caution` (`#F5A800`)

**Given** the runway falls in the lime zone (3+ months)
**When** the arc renders
**Then** the filled arc uses `--color-runway-healthy` (`#C0F500`)

**Given** the runway value changes after a savings event
**When** the new value is committed
**Then** the arc fill animates to the new position; the animation triggers on write commit, not per-transaction

---

### Story 5.6: Savings Flow Chart — Monthly Trend

As Tom,
I want to see a bar chart of my monthly savings deposits and withdrawals for the last 6 months,
So that I can tell at a glance whether my savings behavior is trending in the right direction.

**Acceptance Criteria:**

**Given** savings transactions exist across multiple months
**When** the Savings Flow Chart renders
**Then** a Recharts BarChart shows up to 6 monthly bars; positive bars use `--color-savings-positive` (`#90c820`); negative bars use `--color-savings-negative` (`#ff5555`); the current month's bar uses lime `#C0F500`; month labels appear below; no axes or gridlines shown (FR24, UX-DR5)

**Given** a savings transaction is imported or committed in the current month
**When** the store updates
**Then** the current month's bar grows to reflect the new net flow without a refresh (FR25)

**Given** fewer than 6 months of data exist
**When** the chart renders
**Then** only available months are shown; no empty zero bars for missing months

---

### Story 5.7: Wealth Panel — Persistent on Main Screen

As Tom,
I want the Arc Gauge and Savings Flow Chart to be permanently visible alongside my envelope list on the main Budget screen,
So that every allocation decision I make happens with my long-term trajectory in view.

**Acceptance Criteria:**

**Given** Tom is on the Budget screen (`/`)
**When** the view renders
**Then** the wealth panel is present as a persistent top section (~220px height) above the envelope list; Arc Gauge and Savings Flow Chart are visible side by side without any navigation required (FR24a, UX-DR11)

**Given** Tom scrolls the envelope list
**When** the list scrolls
**Then** the wealth panel remains fixed; only the envelope list scrolls below it

**Given** Tom collapses the wealth panel
**When** the collapse action occurs
**Then** the panel collapses to a minimal header; the envelope list expands to fill the space; the collapsed state is remembered across sessions

**Given** the savings reconciliation input is needed
**When** Tom accesses it
**Then** it is reachable directly from the wealth panel without navigating away from the Budget screen

---

## Epic 6: Turn the Month — The Monthly Ceremony

Tom can complete the guided month-closing ritual: review last month's budget performance with drift detection, confirm bill dates and income timing for the new month, and fill envelopes in a guided flow — all completable in under 5 minutes.

### Story 6.1: Month Lifecycle Schema + State Machine

As a developer,
I want the SQLite schema and Zustand store for the month lifecycle state machine, along with the Tauri commands to advance and close months,
So that Turn the Month can commit each step atomically and resume from any point after a crash.

**Acceptance Criteria:**

**Given** the migration runner runs on launch
**When** `006_months.sql` is applied
**Then** the `months` table exists with columns: `id`, `year` (INTEGER), `month` (INTEGER), `status` (TEXT: `open` / `closing:step-N` / `closed`), `opened_at` (ISO 8601 TEXT), `closed_at` (ISO 8601 TEXT, nullable)

**Given** the `useMonthStore` Zustand slice is populated
**When** the app loads
**Then** the current month record is hydrated; if status is `closing:step-N`, the Turn the Month route guard immediately redirects to `/turn-the-month` and the stepper resumes from step N

**Given** an `advance_turn_the_month_step` Tauri command runs
**When** it executes
**Then** the step's data changes are committed atomically in the same SQLite transaction as the status update to `closing:step-N+1`; on failure the transaction rolls back and the step remains at N

**Given** the `close_month` Tauri command runs
**When** it executes
**Then** the current month record status changes to `closed`; a new month record is created with status `open`; envelopes reset per their type rules; the month store updates; the Turn the Month route guard clears

---

### Story 6.2: Turn the Month Mode Gate

As Tom,
I want the app to enter Turn the Month mode on first open after month end and block normal use until I complete the ritual,
So that I never skip the closing ceremony and start a new month with stale data.

**Acceptance Criteria:**

**Given** Tom opens the app for the first time after the calendar month has ended
**When** the app initializes and the month store hydrates
**Then** if the current month record has no `closed_at` and the calendar date is past month end, the status transitions to `closing:step-1`; the TanStack Router route guard redirects to `/turn-the-month` (FR26)

**Given** the app is in `closing:*` status
**When** Tom attempts to navigate to any route other than `/turn-the-month`
**Then** the route guard intercepts and redirects back to `/turn-the-month`; no normal app use is possible until the ritual completes

**Given** the app crashes mid-ritual (status is `closing:step-2`)
**When** Tom relaunches the app
**Then** the month store hydrates with `closing:step-2`; the Turn the Month stepper opens at step 2; no data from step 1 is lost; Tom does not restart from step 1

---

### Story 6.3: Closeout Summary — Last Month in Review

As Tom,
I want to see a summary of last month's budget performance, savings flow, and runway change before closing it,
So that I understand how the month went and can make informed decisions for the next one.

**Acceptance Criteria:**

**Given** Turn the Month opens at step 1
**When** the closeout summary step renders
**Then** it displays: overall budget result (stayed in budget or total overspend), net savings flow for the month (positive = saved, negative = drew down), runway change (delta from month start to end) (FR27)

**Given** the same envelope has been over budget for 2 or more consecutive months
**When** the closeout summary renders
**Then** a single plain-language observational note appears above the envelope list: "Dining Out has run over budget 2 months in a row — worth adjusting the target?"; presented as information, not a warning; no modal, no animation (FR28)

**Given** the drift detection note is shown
**When** Tom confirms the step
**Then** the observation is dismissed; no action is forced; Tom can proceed without changing anything

**Given** Tom confirms the closeout summary step
**When** the `advance_turn_the_month_step` command runs
**Then** the month status advances to `closing:step-2` atomically; the stepper moves to step 2

---

### Story 6.4: Bill Date Confirmation

As Tom,
I want to confirm or adjust the bill due dates for the new month before it opens,
So that my Bill envelopes have accurate due dates and the right state colors from day one.

**Acceptance Criteria:**

**Given** Turn the Month is at step 2
**When** the bill date confirmation step renders
**Then** all Bill-type envelopes are listed with their suggested due dates for the new month; suggested dates are derived from historical due dates for that envelope (FR29)

**Given** Tom confirms without changes
**When** the step commits
**Then** the suggested dates are accepted as-is; the step advances to `closing:step-3` atomically

**Given** Tom adjusts a bill due date
**When** he edits inline and confirms the step
**Then** the new date is stored for that envelope for the new month; the prior month's due dates are not altered; the change commits atomically with the step advance

**Given** a Bill envelope has no historical due date data
**When** the step renders
**Then** the date field for that envelope is blank with a placeholder; Tom can enter a date or leave it blank and confirm

---

### Story 6.5: Income Timing Confirmation

As Tom,
I want to confirm my expected pay dates for the new month,
So that my allocation flow knows when income arrives and can reflect that in envelope funding status.

**Acceptance Criteria:**

**Given** Turn the Month is at step 3
**When** the income timing step renders
**Then** Tom's pay dates for the new month are shown based on his configured pay frequency and pay dates from settings; expected income amounts (if configured) are displayed alongside each date (FR30)

**Given** Tom confirms the income timing without changes
**When** confirmation occurs
**Then** the pay dates are recorded for the new month; the step commits atomically and advances to `closing:step-4`

**Given** Tom adjusts an income date or amount
**When** he edits inline and confirms
**Then** the adjusted values are stored for the new month only; the settings pay frequency configuration is not modified

---

### Story 6.6: Guided Envelope Fill — Opening the New Month

As Tom,
I want to fill my envelopes for the new month in a guided allocation flow that is the final step of Turn the Month,
So that the new month opens with a funded budget and the ceremony feels complete.

**Acceptance Criteria:**

**Given** Turn the Month is at step 4
**When** the envelope fill step renders
**Then** all envelopes are shown with editable allocation inputs; available income is displayed at the top and updates live as amounts are entered; the savings envelope is shown at the top of the list with a distinct style and a soft prompt ("Even $50 keeps your streak alive") (FR31)

**Given** Tom fills his envelopes and confirms
**When** the `close_month` command runs
**Then** all allocations are committed in the same transaction as the month status change to `closed` and the new month opening; on failure the entire commit rolls back; no partial month close is persisted

**Given** the month closes successfully
**When** the close commits
**Then** the Turn the Month stepper closes naturally with no completion modal; Tom lands on the main Budget screen; the wealth panel shows the updated runway; envelopes show their new allocated states; the route guard clears (UX-DR15)

**Given** the new month opens
**When** the Budget screen renders
**Then** the Savings Card shows updated deposit status and streak count if applicable; the Arc Gauge reflects any runway change from the month's savings flow
