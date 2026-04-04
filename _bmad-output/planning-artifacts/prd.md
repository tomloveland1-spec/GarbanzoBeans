---
stepsCompleted: ['step-01-init', 'step-02-discovery', 'step-02b-vision', 'step-02c-executive-summary', 'step-03-success', 'step-04-journeys', 'step-05-domain', 'step-06-innovation', 'step-07-project-type', 'step-08-scoping', 'step-09-functional', 'step-10-nonfunctional', 'step-11-polish', 'step-12-complete', 'step-e-01-discovery', 'step-e-02-review', 'step-e-03-edit']
lastEdited: '2026-04-04'
editHistory:
  - date: '2026-04-04'
    changes: 'Replaced unmeasurable visual quality NFR ("feel visually polished") with testable design system requirement'
  - date: '2026-04-04'
    changes: 'Added Compliance Scope subsection to Domain-Specific Requirements; moved compliance rationale from frontmatter into document body'
  - date: '2026-04-04'
    changes: 'Removed implementation leakage from FRs and NFRs: rewrote FR39, FR40, and 3 NFRs to use capability language without naming SQLite or schema migration patterns'
inputDocuments: ['_bmad-output/brainstorming/brainstorming-session-2026-04-02.md']
workflowType: 'prd'
classification:
  projectType: desktop_app
  domain: fintech
  complexity: high
  projectContext: greenfield
  complianceNote: Personal finance only — no banking APIs, payment processing, KYC/AML, or regulated transactions. Local-first, offline tool.
---

# Product Requirements Document - GarbanzoBeans

**Author:** Tom
**Date:** 2026-04-03

## Executive Summary

GarbanzoBeans is a local-first desktop budget application that replaces the YNAB subscription model with a one-time purchase and replaces YNAB's methodology-first approach with a wealth-building-first UI. The target user is the financially aware individual — currently a YNAB user or anyone stuck in the monthly survival loop — who wants to spend less time managing a budget and more time actually building wealth. The core problem: YNAB charges annually for a system that helps you survive the month. GarbanzoBeans eliminates the cost and shifts the product's north star from "did I stay in budget?" to "am I building a financial runway?"

The app is beautiful, useful, and satisfying to use. It is built on the belief that the right behavior should be the easy behavior — and that the app's job is to make wealth-building visible, encouraging, and inevitable over time.

### What Makes This Special

Three compounding differentiators:

1. **Business model as product identity.** No subscription, no account, no server. A one-time purchase that pays for itself within the first year compared to YNAB. The pricing decision is a statement about whose side the product is on.

2. **The app actually pushes toward wealth.** The savings envelope, fuel gauge runway metric, and savings flow chart live on the main screen — not buried in reports. Every allocation decision is made with long-term trajectory visible. The app celebrates any savings progress, from baby steps upward, rather than enforcing arbitrary targets.

3. **It learns your life so you don't have to teach it twice.** Merchant categorization rules, bill dates, pay frequency — all learned once from your behavior and refined over time. The longer you use it, the less work each session takes. Your personal ruleset is a locally-owned asset that compounds in value.

## Project Classification

- **Project Type:** Desktop application (Tauri + React, Windows-first)
- **Domain:** Personal fintech — no banking APIs, payment processing, KYC/AML, or regulated transactions
- **Complexity:** High (product and data integrity complexity; minimal regulatory burden)
- **Project Context:** Greenfield

## Success Criteria

### User Success

- A user can import an OFX file, categorize all transactions, and have a complete picture of their month in under 10 minutes on first use; under 5 minutes after merchant rules are established.
- The app feels satisfying to use for routine tasks. Reconciling an account, filling an envelope, or closing a month produces visible, ambient feedback (color, state change, visual progress) — not modal notifications.
- A user who stays in budget for a month can see that clearly at a glance. A user who stays in budget *and* saves can see that the difference matters — the wealth panel reflects meaningful progress.
- After 3 months of use, the merchant rule engine requires near-zero manual input per import session.

### Business Success

- Tom uses it exclusively instead of YNAB within 3 months of MVP completion.
- If distributed publicly: $1,000 net revenue in the first 12 months of availability constitutes market validation.

### Technical Success

- Transactional data stored in SQLite; configuration stored as JSON. No cloud dependency, no account required.
- App opens and is usable in under 2 seconds on a modern Windows machine.
- File locking works reliably across at least 2 devices without data corruption when folder is cloud-synced.
- No data loss under any normal usage scenario (import, edit, month close, settings change).

### Measurable Outcomes

- **Month 1 success:** User stays in budget
- **Fantastic month:** Stayed in budget + net positive savings flow
- **Long-term success:** Rising runway metric over 6+ months

## User Journeys

### Journey 1: Tom Sets Up for the First Time

Tom has been a YNAB user for two years. He's frustrated — another $15 charge hit his card, and he just found out they raised prices again. He downloads GarbanzoBeans, pays once, and opens it.

The onboarding asks him three things: what's his name, how does he get paid (twice monthly, on the 1st and 15th), and what's his savings goal (he sets 10%). That's it. No methodology lecture.

He imports 3 months of OFX files from his bank. The app analyzes his transactions and auto-creates a starter set of categories based on what it sees — Groceries, Gas, Netflix, Rent, Electric. Tom reviews them, renames a couple, and moves on. The merchant rules engine has already learned his most common payees.

He sets up his envelopes: Rent is a Bill (due the 1st), Groceries is Rolling, and Savings is a Goal. He enters his current savings account balance — $3,200. The app calculates: at his current essential spending rate, that's 1.8 months of runway. The fuel gauge shows the needle in yellow, pointed toward green.

He closes the app and feels something he hasn't felt with YNAB in a while: that setup was actually easy.

**This journey reveals requirements for:** onboarding flow, OFX import, auto-category suggestion, envelope creation, savings balance bootstrap, runway calculation on first load.

---

### Journey 2: Tom's Weekly Import (The Routine)

It's Sunday morning. Tom opens GarbanzoBeans with his coffee. He exports OFX from his bank and drags it in.

The app imports 23 transactions. 19 are auto-categorized by existing rules — he doesn't touch them. 4 are unknown merchants (a new gas station, a parking garage, and two Amazon charges he split differently). He works through the unknown queue: selects the payee substring for the gas station, categorizes it, done. 2 minutes total.

The ledger balance updates. Two envelopes tick from orange to green as the month's spend comes in under budget. The Groceries envelope is still orange — he's at $280 of $350 for the month. Normal.

The wealth panel hasn't changed much — it's mid-month. But the savings envelope already has this month's deposit in it. The fuel gauge needle hasn't moved yet, but he knows it will at month end.

He closes the app. The whole thing took 4 minutes.

**This journey reveals requirements for:** OFX match-and-clear, unknown merchant queue, substring pattern matching UI, envelope state updates post-import, dual balance ledger display.

---

### Journey 3: Turn the Month

It's November 1st. Tom opens the app for the first time this month. Instead of the normal budget view, the app is in "Turn the Month" mode.

Step 1: *Last month's closeout.* October summary: stayed in budget, net saved $340. Runway moved from 2.1 to 2.4 months — the needle visibly advanced into the green zone. The savings flow bar chart shows 3 consecutive green months. The app surfaces one observation: "Dining Out ran $45 over budget for the second month in a row. Adjust the target, or keep it as a stretch goal?"

Tom bumps Dining Out from $200 to $220. The app records his decision.

Step 2: *Open November.* Confirm bill dates — Rent on the 1st (already paid, it's there in the import), Electric around the 17th (suggested from history, Tom confirms). Confirm income timing — 1st paycheck received, 15th expected.

Step 3: *Fill envelopes.* Tom allocates from his available balance. Bills are funded first. Rolling categories next. Savings last — but this time, the savings envelope is at the top of the list, styled differently, with a soft prompt: *"Even $50 keeps your streak alive."* Tom funds $300.

The month is open. The fuel gauge shows 2.4 months. The app is ready.

**This journey reveals requirements for:** Turn the Month lock and guided flow, month closeout summary, savings flow chart, drift detection (2-month overspend flag), bill date confirmation, income timing display, envelope fill order, savings streak/encouragement UI.

---

### Journey 4: Tom Hits a Rough Month (Edge Case)

It's mid-October. Tom's car needed a $600 repair he didn't budget for. His Car Maintenance envelope is empty — it was a Goal type he'd been underfunding.

He opens the app. Car Maintenance is red. He clicks "Borrow." The overlay shows his available envelopes sorted by priority — Wants first. He pulls $200 from Dining Out, $150 from Entertainment, and $150 from a discretionary fund. That's $500. Still $100 short.

The savings envelope appears at the bottom of the list, visually separated, with a gentle warning tone. He selects it. A confirmation dialog: *"You're borrowing from your rainy day fund. This is exactly what it's for — but are you sure?"* He confirms.

The envelope is green. The borrow is logged. At month end, the closeout will surface it: *"You borrowed from savings once this month."* The savings flow chart will show a smaller green bar — still green, but smaller.

Tom doesn't feel punished. He feels informed.

**This journey reveals requirements for:** borrow overlay, envelope priority sorting (Need/Should/Want), savings borrow confirmation dialog, borrow history in closeout summary, savings flow chart with variable bar height.

---

### Journey Requirements Summary

| Capability | Revealed By |
|---|---|
| Onboarding flow (pay frequency, savings goal) | Journey 1 |
| OFX import + auto-categorization | Journeys 1 & 2 |
| Unknown merchant queue + substring matching | Journey 2 |
| Dual cleared/working balance ledger | Journey 2 |
| Envelope types + traffic-light states | All journeys |
| Savings balance bootstrap + runway calculation | Journey 1 |
| Turn the Month guided ritual | Journey 3 |
| Month closeout summary + drift detection | Journey 3 |
| Savings flow bar chart | Journeys 3 & 4 |
| Borrow overlay + priority sorting | Journey 4 |
| Savings borrow confirmation + logging | Journey 4 |
| Ambient satisfaction UI (color, state change) | All journeys |

## Domain-Specific Requirements

### Data Integrity

Financial data must never be silently corrupted. Wrong numbers destroy trust immediately — trust is the entire product.

- **Transactional data** (transactions, envelope states, month history, savings flow) stored in **SQLite**. ACID transactions guarantee that a crash mid-write leaves the database intact, not half-written. This is a non-negotiable for a financial app.
- **Configuration data** (merchant rules, user settings, envelope definitions, pay frequency) stored as **JSON files**. Small, rarely written, human-readable — appropriate for config.
- The SQLite database file and JSON config files are stored together in the user's OneDrive folder and synced as a unit.
- **Savings transaction sign convention:** Negative amounts on savings transactions represent deposits to savings (outflow from checking); positive amounts represent withdrawals from savings. This convention is enforced consistently throughout the ledger and all wealth calculations.

### Immutable History

Changing any setting — pay frequency, category type, savings target, merchant rules — must never alter historical records. Past transaction data and past month states are ground truth. Settings changes apply from the point of change forward only.

### No Data Loss

A crash during OFX import, a failed OneDrive sync, or a botched month close must not result in lost or corrupted transactions. All write operations against SQLite must use transactions with rollback on failure. OFX import is atomic — either all transactions from an import are committed, or none are.

### Privacy

All data stays local. No telemetry, no crash reporting that includes financial data, no cloud sync except the user's own OneDrive folder. This is a product promise, not a compliance requirement.

### Compliance Scope

GarbanzoBeans is a personal finance tool — not a fintech product in the regulated sense. Standard fintech compliance frameworks do not apply:

- **PCI-DSS / KYC / AML / regulated transactions:** Not applicable. The app processes no payments, connects to no banking APIs, and handles no regulated financial transactions. It is an offline ledger.
- **Fraud prevention:** Not applicable. Single-user, offline, no payment processing — there is no transaction surface for fraud prevention to act on.

**Actual security posture for a local-first personal finance app:**
- **Encryption at rest:** Not required for MVP. The SQLite database contains personal spending data but no credentials, payment instruments, or account numbers. File-system-level encryption (BitLocker/FileVault) is the user's responsibility. This decision may be revisited post-MVP.
- **Code signing for auto-updates:** Required. Auto-update binaries must be code-signed to prevent tampering in transit. This is a security requirement, not a compliance one.

### Schema Evolution

SQLite schema changes between app versions must be handled via versioned migrations. No migration may destroy or truncate existing data. Migration failures must be recoverable.

## Innovation & Novel Patterns

### Detected Innovation Areas

**1. Business model as differentiator**
The one-time purchase model is itself a product statement. In a category where every major player has moved to SaaS subscriptions, pricing becomes a trust signal. Users don't just save money — they own their tool.

**2. Wealth trajectory on the budget screen**
No existing budget app surfaces long-term wealth trajectory (runway, savings flow) in the same view as day-to-day envelope management. The innovation isn't the metrics themselves — it's their placement. Putting the fuel gauge next to the envelope list means every allocation decision is made with long-term consequences visible.

**3. Ambient satisfaction design**
Replacing notification-driven engagement (pop-ups, badges, "Good Job!" modals) with UI state as reward. A green envelope, a ticking needle, a filled bar — the app feels satisfying without interrupting. This is a deliberate inversion of the gamification pattern: accomplishment is ambient, not announced.

**4. Self-teaching as compounding value**
The merchant rule engine makes the app more valuable the longer you use it. Most apps depreciate in value relative to the friction of maintaining them. Here, the user's behavioral data is a locally-owned asset that compounds — each session is shorter than the last.

### Market Context & Competitive Landscape

- **YNAB** — methodology-first, subscription, cloud-synced. Strong brand but $100/year and a steep learning curve.
- **Monarch Money** — modern UI, $100/year subscription, heavy on bank integrations. No local-first option.
- **Copilot** — Mac/iOS only, subscription, beautiful design. Closest to the aesthetic bar GarbanzoBeans aims for.
- **Actual Budget** — open source, local-first, one-time or self-hosted. Closest competitor philosophically, but rough UX and no wealth-building focus.

GarbanzoBeans' gap: a **polished, local-first, one-time purchase** app that actively pushes wealth-building — not just budget tracking.

### Validation Approach

- Tom is the primary validator. Switching from YNAB within 3 months of MVP is the core test.
- Ambient satisfaction is validated by whether the import routine feels like a chore or a small win.
- Runway metric is validated by whether Tom checks it voluntarily — not because the app asks him to.

### Risk Mitigation

- **Ambient satisfaction is subjective** — if the color/state feedback doesn't feel rewarding in practice, it can be tuned without architectural changes. Design iteration is the mitigation.
- **SQLite on OneDrive** — file locking + cloud sync can produce conflicts. Mitigation: write sentinel lock file on open, read-only mode when locked, and test multi-device scenarios early.
- **Actual Budget exists** — if users don't value polish and wealth focus enough to pay, the niche may be too small. Mitigation: Tom's own usage validates the core before any public release.

## Desktop App Specific Requirements

### Project-Type Overview

GarbanzoBeans is a Windows-first desktop application built with Tauri + React. It is fully offline, locally-stored, and requires no account, server, or network connection. The "sync" story is simply: your data lives in a folder. Put that folder in OneDrive, Dropbox, Box, or Google Drive if you want access from multiple machines — or keep it local. The app doesn't care.

### Platform Support

- **MVP:** Windows 10/11 (64-bit)
- **Future:** macOS (Tauri supports cross-platform; Mac build is feasible without architectural changes)
- **Future:** Mobile companion (React Native, shared business logic — deferred to Vision phase)

### Auto-Update

Tauri's built-in updater (`tauri-plugin-updater`) handles auto-update. On launch, the app checks a configured update endpoint for a new version. If found, it prompts the user to update and applies it. This requires a hosted update manifest (a static JSON file on a server or GitHub Releases) — low infrastructure cost. Implementation detail for the architect, but the requirement is: **the app updates itself with user confirmation, not silently.**

### Offline Capability

The app is fully offline. No network calls are made during normal operation. No license validation, no telemetry, no analytics. A network connection is only needed for auto-update checks — and those can fail gracefully with no impact on app function.

### Data Portability

All user data lives in a single folder (SQLite database + JSON config files). Users choose where this folder lives at first launch — local drive, OneDrive, Dropbox, Box, Google Drive, or anywhere else. The app reads and writes files in that folder. Multi-device access is the user's responsibility; the app supports it via the sentinel lock file (read-only mode when another instance is detected).

### Implementation Considerations

- Tauri + React tech stack. Tauri handles file system access, window management, and auto-update. React handles all UI.
- SQLite accessed via `tauri-plugin-sql` from the Rust backend.
- No Electron. Tauri's smaller footprint is a feature — fast startup, small binary.
- Skip sections: web SEO, mobile-first design, browser compatibility, store compliance (for MVP).

## Project Scoping & Phased Development

### MVP Strategy & Philosophy

**MVP Approach:** Experience MVP — the smallest version Tom would switch to from YNAB, with visual polish as a first-class requirement. Not a proof-of-concept. A real tool that feels good to use from day one.

**Development Model:** Tom is product owner (vision, decisions, review). Claude Code handles implementation. Tom reads and validates code; Claude writes it. This requires clear, detailed specs before each build phase — which this PRD and the subsequent architecture document provide.

### MVP Feature Set (Phase 1)

**Core User Journeys Supported:**
- First-time setup (onboarding, OFX import, envelope creation, savings bootstrap)
- Weekly import routine (OFX import, merchant queue, auto-categorization, envelope state updates)
- Turn the Month ritual (closeout summary, bill date confirmation, envelope fill, runway update)
- Rough month / borrow flow (borrow overlay, savings borrow confirmation)

**Must-Have Capabilities:**
- OFX file import with dual cleared/working balance ledger
- Merchant rule engine: manual categorization → saved rule → auto-apply on future imports
- Typed envelope system (Rolling, Bill, Goal) with traffic-light states and tooltips
- Monthly planning session: bill dates, income timing, envelope allocation
- Savings category with savings flow tracking and monthly net flow signal
- Runway metric (fuel gauge arc) and savings flow bar chart on main screen
- "Turn the Month" guided ritual with lock and guided flow
- Borrow overlay with Need/Should/Want priority sorting and savings borrow confirmation
- Sentinel file locking with read-only fallback for multi-device folder sharing
- Visual polish: component-library-based UI (shadcn/ui) with an opinionated, beautiful design language — not generic out-of-the-box defaults
- Auto-update via Tauri plugin with user confirmation prompt

### Design Approach

Visual design is iterative and swatch-driven. Tom will evaluate options and react — not specify from scratch. Process:
1. Establish design language early: color palette, typography, envelope card style, fuel gauge aesthetic
2. Present 2–3 directional options per major UI component
3. Tom selects or directs; Claude implements
4. Polish is continuous, not a final phase

Component foundation: **shadcn/ui** (React, Tailwind-based, highly customizable, not generic-looking).

### Post-MVP Features (Phase 2)

- Self-teaching merchant pattern matching (substring selection UI)
- Pattern-learned bill dates with user confirmation
- Flexible income normalization (bi-weekly, variable, 3-paycheck month detection)
- Budget-wrong vs. behavior-drift detection in month closeout
- End-of-month guided conversation with 3–5 observations
- Savings streak / encouragement UI

### Vision Features (Phase 3)

- Reactive budget model (observes patterns, proposes budget)
- Mobile companion (React Native)
- Merchant pattern secondary uses (subscription detection, income tagging)
- AI-guided financial coaching (far future)
- Mac build

### Risk Mitigation

**Technical risks:**
- *Tauri learning curve* — new stack for both Tom and Claude. Mitigation: architect the Rust/React boundary carefully upfront; keep Rust thin (file I/O, SQLite, update); keep business logic in React where it's testable and familiar.
- *SQLite + cloud folder sync* — concurrent access risk. Mitigation: sentinel lock file, read-only mode, early multi-device testing.
- *Auto-update infrastructure* — requires a hosted manifest. Mitigation: use GitHub Releases as the update server; no custom infrastructure needed.

**Design risks:**
- *Polish as MVP requirement* — ambitious for a solo build. Mitigation: commit to a component library early; design language decisions happen before implementation begins, not during.

**Market risks:**
- *Single customer for now* — Tom is the validator. If it works for Tom, it's proven. Public distribution is optional upside, not the goal.

## Functional Requirements

### Data Import & Transaction Management

- **FR1:** User can import an OFX file and have its transactions added to the ledger
- **FR2:** User can view all transactions in a ledger with cleared and working balance displayed separately
- **FR3:** User can manually enter a transaction that starts in uncleared/working state
- **FR4:** System automatically matches imported OFX transactions against existing uncleared entries and marks them cleared
- **FR5:** User can edit any individual transaction's category, amount, date, or payee without affecting merchant rules

### Merchant Categorization & Rules

- **FR6:** System automatically categorizes imported transactions using stored merchant rules
- **FR7:** User can view a queue of uncategorized transactions and assign a category to each
- **FR8:** User can create a merchant rule from any transaction, defining which part of the payee string identifies the merchant
- **FR9:** System applies the new merchant rule to all future imports automatically
- **FR10:** User can view, edit, and delete all merchant rules from a dedicated rules screen
- **FR11:** User can override a transaction's category without modifying the underlying merchant rule

### Envelope Budgeting

- **FR12:** User can create budget categories with a type (Rolling, Bill, or Goal)
- **FR13:** User can assign a priority (Need, Should, or Want) to each category
- **FR14:** System displays each envelope's current state (green/orange/red) based on type-specific funding logic
- **FR15:** System displays a tooltip on every envelope explaining why it is in its current state
- **FR16:** User can allocate money to envelopes during the monthly planning session
- **FR17:** User can borrow money from one or more funded envelopes to cover a shortfall in another
- **FR18:** User can borrow from the savings envelope with a distinct confirmation step
- **FR19:** System records borrow events and surfaces them in the month closeout summary

### Savings & Wealth Tracking

- **FR20:** User can designate a category as the savings category; the savings category is displayed with a distinct visual style — separate section placement, unique color treatment, and a persistent label — that differentiates it from standard budget envelopes throughout the app.
- **FR20a:** Savings transactions display a directional indicator (deposit or withdrawal) showing whether money moved into or out of savings, consistent throughout the ledger and wealth calculations.
- **FR21:** User can enter a starting savings account balance as a one-time bootstrap value
- **FR22:** System calculates and displays a financial runway metric (months of essential spending covered) based on savings balance and spending patterns
- **FR23:** System displays the runway metric as a fuel gauge visual with color-coded zones
- **FR24:** System displays a savings flow bar chart showing net savings per month (positive = saved, negative = drew down)
- **FR24a:** The runway fuel gauge and savings flow chart are displayed persistently alongside the envelope list on the main screen — not in a separate report or navigable view. Both are visible whenever the budget view is open.
- **FR25:** System updates the derived savings balance automatically as savings transactions are imported

### Monthly Planning & Turn the Month

- **FR26:** System enters "Turn the Month" mode on first app open after month end and requires completion before normal use
- **FR27:** User can review a closeout summary for the prior month including budget performance, savings flow, and runway change
- **FR28:** System surfaces recurring overspend patterns in the closeout summary (same category over budget 2+ months)
- **FR29:** User can confirm or adjust bill due dates for the new month, with suggested dates based on history
- **FR30:** User can confirm expected income timing for the new month
- **FR31:** User can fill envelopes for the new month in a guided allocation flow

### Onboarding & Configuration

- **FR32:** User can specify a data folder location at first launch where all app data will be stored
- **FR33:** User can configure pay frequency and pay dates during onboarding
- **FR34:** User can set a savings target (suggested default: 10% of income, user-adjustable)
- **FR35:** User can update pay frequency, pay dates, and savings target at any time without affecting historical data
- **FR36:** System displays read-only mode when another instance of the app has the data folder locked

### App Infrastructure & Updates

- **FR37:** System checks for available updates on launch and prompts the user to install if found
- **FR38:** User can decline an update and continue using the current version
- **FR39:** All data write operations complete fully or not at all; on failure, the data store remains in its last consistent state
- **FR40:** The app upgrades its data storage format automatically on version change without data loss; failed upgrades abort cleanly

## Non-Functional Requirements

### Performance

- The app launches and is fully usable within 2 seconds on a modern Windows machine (Windows 10/11, SSD, 8GB+ RAM)
- OFX import of up to 500 transactions completes within 3 seconds
- All user interactions (envelope state updates, ledger scroll, allocation changes) respond within 200ms
- The UI remains responsive during all data persistence operations — all UI interactions during import or month close respond within 500ms

### Reliability & Data Integrity

- All data write operations are atomic; any failure leaves the data store in its prior consistent state with no partial writes
- OFX import is atomic — either all transactions from a file are committed, or none are
- The app handles unexpected shutdown gracefully; the database must be readable and consistent on next launch
- Data format upgrades on version change complete successfully or abort without modifying existing data

### Usability & Design Quality

- The app's visual appearance is defined by a custom design system established before implementation begins, not derived from component library defaults. All components are styled against this system; default library appearances are not used in the shipped app. Visual direction is approved by Tom before any implementation phase begins.
- All envelope state changes (traffic light colors, tooltip text) must be immediately visible after any user action without requiring a manual refresh
- Every envelope state has a tooltip that explains why it is that color — no color is ever left unexplained
- The "Turn the Month" ritual must be completable in under 5 minutes for an experienced user

### Privacy & Data Ownership

- No user data leaves the local machine during normal operation
- No telemetry, analytics, or crash reporting that transmits financial data
- Auto-update checks are the only outbound network calls; they must fail gracefully with no impact on app function
- All user data is stored in a user-specified folder; the app never writes data outside that folder (except temporary files during import, which are cleaned up immediately)

### Portability

- All user data is portable via a single folder copy — moving the folder to a new machine produces a fully functional app instance
- The data folder is cloud-sync agnostic; it must work correctly when stored in OneDrive, Dropbox, Box, Google Drive, or a local drive
