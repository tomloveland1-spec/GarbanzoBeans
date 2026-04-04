---
stepsCompleted: [1, 2, 3]
inputDocuments: []
session_topic: 'Building personal budget software to replace YNAB'
session_goals: 'Generate ideas for features, differentiators, tech approach, and product vision — enough to fuel a real planning process'
selected_approach: 'ai-recommended'
techniques_used: ['Assumption Reversal', 'SCAMPER Method', 'First Principles Thinking']
ideas_generated: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44]
session_complete: true
completion_date: '2026-04-02'
context_file: ''
---

# Brainstorming Session Results

**Facilitator:** Tom
**Date:** 2026-04-02

---

## Session Overview

**Topic:** Building personal budget software to replace YNAB
**Goals:** Generate ideas for features, differentiators, tech approach, and product vision — enough to fuel a real planning process

### Session Setup

Tom is a YNAB user motivated by subscription cost frustration. He knows the problem space intimately as a power user. The goal is to design a YNAB alternative that keeps what works and eliminates what doesn't.

---

## Technique Selection

**Approach:** AI-Recommended Techniques
**Analysis Context:** Building personal budget software with focus on product vision and planning

**Recommended Techniques:**
- **Assumption Reversal:** Crack open YNAB's baked-in assumptions to reveal the design space
- **SCAMPER Method:** Systematically generate concrete feature and business model ideas
- **First Principles Thinking:** Distill the product's core purpose and non-negotiable principles

---

## Technique Execution: Assumption Reversal

### Ideas Generated

**[Assumption #1]**: Reactive Budget Model
_Concept_: Software observes spending patterns over time and proposes a budget based on actual behavior rather than requiring upfront allocation. Lowers friction for people who find proactive budgeting intimidating.
_Novelty_: Flips the "plan first" paradigm entirely.
_Complexity flag_: Non-trivial; may be a v2 or "smart mode" feature rather than core.

---

**[Assumption #2]**: Zero-Onboarding Behavioral Budget
_Concept_: User imports 3–6 months of bank/credit OFX files on first launch. The app analyzes spending patterns, auto-generates categories based on actual merchant data, and proposes a starting budget — no manual setup required.
_Novelty_: YNAB forces you to build your budget from scratch with no historical context. This inverts that — your history is the starting point.
_Complexity flag_: OFX parsing is well-solved; category inference via lookup table + user correction loop.

---

**[Assumption #3]**: Auto-Categorization via Lookup (Not AI)
_Concept_: Import OFX, run transactions through a static merchant→category map. Unknown merchants get queued for one-time user categorization, then remembered forever. Batches categorization work — import once a week, review unknowns, done in 2 minutes.
_Novelty_: YNAB makes you categorize in real-time as you spend. This batches it.
_Complexity flag_: Low. Dictionary lookup and a small "unknown queue" UI.

---

**[Assumption #4]**: Self-Teaching Categorization
_Concept_: Every manual categorization the user makes is stored as a personal merchant→category rule. Future imports silently apply those rules. The app gets smarter with every session — just a growing lookup table unique to each user.
_Novelty_: The longer you use it, the less work each import takes — the opposite of subscription fatigue. The ruleset is an asset that lives in the user's own data.
_Complexity flag_: Trivial. A key-value store of merchant string → category. Could be a JSON file.

---

**[Assumption #5]**: User-Defined Merchant Pattern Matching
_Concept_: When a user categorizes an unknown transaction, the app highlights the payee string and asks "which part of this will always identify this merchant?" The user selects a substring (e.g. "SHELL OIL" from "SHELL OIL 047291 12/15 PURCHASE") and that becomes the matching rule — a simple contains/startsWith check.
_Novelty_: Most apps either do dumb exact matching (fails on floating date strings) or require cloud AI (overkill). This puts the user in control with a one-time 5-second decision.
_Complexity flag_: Low-medium. UI needs a text selection/highlight interaction. Matching logic is just string.contains().

---

**[Assumption #6]**: Rule + Override Model
_Concept_: Merchant patterns set a default category, but every individual transaction is always editable without affecting the rule. "Walmart = Groceries" stays intact even when you manually change one transaction to "Gifts."
_Novelty_: Simple and obvious in hindsight, but many apps make you choose — either a rule OR manual control. Both coexist.
_Complexity flag_: Trivial.

---

**[Assumption #7]**: Silent Override + Rule Management Screen
_Concept_: Individual transaction overrides are always silent. Separately, the app has a "Merchant Rules" screen where users can view, edit, or add permanent mappings at any time — including promoting a past override to a permanent rule. Power users can see stats like "Walmart: 47 transactions, 44 Groceries, 3 overrides."
_Novelty_: Keeps the transaction workflow frictionless while giving power users full control.
_Complexity flag_: Low. CRUD screen over the merchant→category map.

---

**[Assumption #8]**: Limit-Based Envelopes Without Pre-Allocation Ceremony
_Concept_: Each category has a monthly spending limit. Importing and categorizing transactions automatically fills the envelope. The envelope model and visualization is preserved, but the mandatory pre-allocation ceremony at month start is optional.
_Novelty_: Keeps the envelope visualization YNAB users love while reducing friction.
_Complexity flag_: Low.

---

**[Assumption #9]**: Budget Against Future Income
_Concept_: The app allows pre-allocation against income not yet received — a paycheck you know is coming. You can plan the full month even if the money isn't in the account yet. Needs a concept of "committed income" vs "available income."
_Novelty_: YNAB explicitly forbids budgeting money you don't have. For people with predictable income, this is an artificial and frustrating constraint.
_Complexity flag_: Medium. Requires distinguishing real vs planned money.

---

**[Assumption #10]**: Built-In Savings Pressure
_Concept_: Savings isn't a leftover — it's a first-class envelope that gets funded before discretionary spending. The app structurally nudges you to allocate to a rainy day fund before the rest of the budget feels "complete."
_Novelty_: Most budget apps treat savings as what's left over. This flips it — savings is a bill you pay yourself first.
_Complexity flag_: Low structurally; UX nudge mechanism worth brainstorming separately.

---

**[Assumption #11]**: Typed Envelopes with Funding Rules
_Concept_: Categories have a type — Rolling, Bill, or Goal — each with different funding logic, deadline behavior, and real/planned money sensitivity.
- **Rolling** (Groceries, Gas): Fund gradually throughout the month. Partial funding is fine.
- **Bill** (Rent, utilities): Must be fully funded by a specific date. App warns when planned money won't clear before due date.
- **Goal / Discretionary** (Savings, birthday fund): Just needs to reach its target at some point. No hard monthly deadline.
_Novelty_: YNAB treats all categories the same. Typed envelopes let the app give genuinely different and more useful feedback per category.
_Complexity flag_: Medium. Clean data model; bill floating-date logic needs thought.

---

**[Assumption #12]**: Pattern-Learned Bill Dates with User Confirmation
_Concept_: During monthly planning, the app suggests a clear date for each bill based on historical transaction patterns (after 3+ months of data). The user confirms or adjusts with a single tap. New users enter dates manually until patterns emerge. Same self-teaching mechanic as merchant categorization.
_Novelty_: After a year of use, planning mode might take 2 minutes instead of 10. The app learns your life so you don't have to teach it twice.
_Complexity flag_: Low-medium. Average/mode of historical clear dates per bill merchant.

---

### Emerging Product Philosophy

> **The app learns your life so you don't have to teach it twice.**

Merchant patterns, category rules, bill dates — all learned once, refined over time, owned locally. Direct answer to YNAB's "you must learn our methodology" assumption.

### Monthly Planning Session Shape (emerging)

1. Here are your bills — when do they clear this month? *(suggested dates, user confirms)*
2. Here's your expected income — when does it land? *(confirm paycheck dates)*
3. Here's your remaining allocation — fill rolling categories and goals
4. Warning if any bill's due date falls before its funding income lands

---

**[Assumption #13]**: Visual Savings Pressure via Progress Design
_Concept_: The savings envelope isn't just a number — it's a visually prominent, color-coded element. Beautiful enough that you *feel* the pressure without a lecture. The UI makes saving feel like an achievement, not a chore.
_Novelty_: Most budget apps make savings invisible. Making it the most visually prominent envelope changes behavior through design, not guilt trips.
_Complexity flag_: Low. CSS/styling decision more than a data problem.

---

**[Assumption #14]**: Savings Baseline Onboarding
_Concept_: During initial setup, the app interviews the user about income and savings goals. It sets a default savings target of 10% of monthly income, but the user can set it higher. This baseline becomes the "floor" the app measures against — dipping below it triggers visual warnings.
_Novelty_: Removes the paralysis of "how much should I save?" for new users while still allowing full customization.
_Complexity flag_: Low. Simple onboarding flow + a savings target field.

---

**[Assumption #15]**: Flexible Income Normalization
_Concept_: The app asks how you get paid — monthly, twice monthly, bi-weekly, or hourly/variable. It normalizes income to a monthly equivalent for budgeting purposes. Bi-weekly = ~2.17 paychecks/month on average. Variable income uses a trailing 3-month average. Bi-weekly earners get a "bonus month" flag twice a year when a 3-paycheck month occurs: "This month you have an extra paycheck — want to boost savings or pay down a goal?"
_Novelty_: YNAB quietly assumes monthly or twice-monthly pay. Hourly workers and bi-weekly earners constantly fight the calendar.
_Complexity flag_: Medium. Bi-weekly drift (some months have 3 paychecks) needs careful handling.

---

**[Assumption #16]**: Mutable Life Configuration
_Concept_: Income source, pay frequency, pay dates, and savings baseline are not set-once onboarding fields — they're settings the user can update at any time. When changed, the app asks: "Apply from this month forward, or recalculate from a specific date?" History stays intact; future planning updates.
_Novelty_: Life changes — job changes, raises, going hourly, going freelance. The app adapts without requiring a reset.
_Complexity flag_: Low-medium. The "recalculate from date" option adds some logic but the UI is straightforward.

---

**[Assumption #17]**: No Destructive Reconfiguration
_Concept_: Changing any setting — pay frequency, category types, merchant rules, savings targets — never destroys historical data. The app always distinguishes between "what was true then" and "what is true now."
_Novelty_: Many budget apps effectively require you to start over when circumstances change significantly. Immutable history + mutable config means the app grows with you.
_Complexity flag_: Medium. Needs a clear data model separating config snapshots from transaction history.

---

**[Assumption #18]**: Traffic Light Envelope States with Type-Specific Logic
_Concept_: Every envelope has three visual states with type-specific threshold logic:
- **Rolling:** 🟢 Fully funded + not overspent. 🟠 Partially funded (funding gap is the issue, regardless of spend). 🔴 Spent more than currently funded.
- **Bill:** 🟢 Fully funded before due date. 🟠 Due date approaching and underfunded. 🔴 Due date imminent and underfunded, OR actual charge exceeded budgeted amount.
- **Goal/Savings:** 🟢 Fully funded or on pace. 🟠 Behind pace but expected paychecks haven't all landed. 🔴 Expected paychecks have landed and envelope is still underfunded.
_Novelty_: Same color system, type-aware logic. Cognitively simple — scan your whole budget at a glance.
_Complexity flag_: Low for colors; medium for per-type threshold logic.

---

**[Assumption #19]**: Universal Explanatory Tooltips
_Concept_: Every envelope color state — green, orange, or red — always has a tooltip explaining why it's that color. Even green gets a tooltip: "Fully funded. $1,500 allocated, $0 overspent." Examples: "Overspent by $23", "Due in 3 days, $45 short", "Paycheck received, still $200 short of goal", "Bill exceeded budget by $12." Color = how am I doing. Tooltip = why.
_Novelty_: Most apps use color as a final answer. Here color is a signal and the tooltip is the explanation. Also benefits color-blind users who can rely on tooltip alone.
_Complexity flag_: Low. Every state transition already knows why it happened — just surface that reason as text.

---

### Emerging Product Philosophy

> **The app learns your life so you don't have to teach it twice.**

Merchant patterns, category rules, bill dates — all learned once, refined over time, owned locally. Direct answer to YNAB's "you must learn our methodology" assumption.

### Monthly Planning Session Shape (emerging)

1. Here are your bills — when do they clear this month? *(suggested dates, user confirms)*
2. Here's your expected income — when does it land? *(confirm paycheck dates)*
3. Here's your remaining allocation — fill rolling categories and goals
4. Warning if any bill's due date falls before its funding income lands

---

**[Assumption #20]**: Contextual Borrow Overlay
_Concept_: When an envelope is red, a "Borrow" button appears on it. Clicking opens a focused overlay showing the shortfall amount and a list of funded envelopes sorted by priority (Need last, Want first). User picks one or more source envelopes, allocating partial amounts from each until the shortfall hits zero. A running "still needed" counter ticks down as you allocate. Confirm closes the overlay and all envelopes update simultaneously.
_Novelty_: YNAB makes you manually navigate to each source category separately. This consolidates the entire multi-source transfer into one focused interaction — you never leave the context of the problem you're solving.
_Complexity flag_: Medium. The overlay needs a mini-allocation UI with a live balance tracker, but no exotic data operations — just envelope adjustments.

---

**[Assumption #21]**: Guilt-Trip Savings Borrow
_Concept_: Savings envelopes appear at the bottom of the borrow overlay, visually separated from regular envelopes with a warning tone. Selecting one triggers a pointed confirmation: "You're borrowing from your rainy day fund. This is exactly what it's for — but are you sure you want to reduce it?" Confirmed borrows from savings are flagged in transaction history so the pattern is visible over time.
_Novelty_: Doesn't block the user — respects their autonomy — but creates just enough friction to make it a conscious decision rather than a reflexive one. The historical flag means you can see if you're doing it every month.
_Complexity flag_: Low. Just UI friction and a transaction note.

---

**[Assumption #22]**: Category Priority Rating — Need / Should / Want
_Concept_: When creating or editing a category, the user assigns a priority with a tooltip guiding the choice:
- **Need** — "Rent, utilities, insurance. Must be funded. Never borrow from these."
- **Should** — "Birthday fund, car maintenance, medical. Not today's emergency, but it's coming. Fund these before Wants."
- **Want** — "Dining out, entertainment, hobbies. Genuinely optional — borrow from these first."
Tooltips appear during category setup AND in the borrow overlay so users understand the sort order while under financial stress. Priority also informs planning session allocation order and savings pressure nudges ("You have $200 in Want categories. Your rainy day fund is underfunded.").
_Novelty_: The rating doubles as financial education — users learn to categorize their spending just by setting up. No course required. Passes the "birthday fund" test — clearly a Should, not a Need or Want.
_Complexity flag_: Low. Three options, static tooltip text, one field on category setup.

---

**[Assumption #23]**: OneDrive-Synced Local Data with File Locking
_Concept_: App stores all data in a user-specified folder (defaulting to OneDrive). A sentinel lock file is written on open and deleted on close. If another instance detects the lock, it offers two options: wait and retry, or open read-only. Read-only mode shows all data but disables any edits.
_Novelty_: No server, no subscription, no account. Sync is handled by infrastructure the user already has. Read-only fallback means the lock is never a hard blocker.
_Complexity flag_: Low. Lock file is trivial; read-only mode just disables write operations in the UI.

---

**[Assumption #24]**: Tauri + React Tech Stack
_Concept_: Desktop app built with Tauri (lightweight Rust backend, native OS integration) and React (frontend UI, data visualization, component ecosystem). Data stored as JSON files in a user-specified OneDrive folder. When mobile comes, React Native shares business logic and team knowledge with minimal rewrite. React ecosystem provides best-in-class charting libraries (Recharts, Victory, Nivo) for the visualization-heavy UI.
_Novelty_: Tauri gives native performance and tiny app footprint without sacrificing React's unmatched UI ecosystem. No Electron bloat. No subscription server to maintain.
_Complexity flag_: Low-medium to start. Tauri handles file system access cleanly.

---

**[Assumption #25]**: One-Time Purchase Business Model
_Concept_: Pay once, own forever. No subscription, no recurring fees, no features locked behind a paywall tier. Updates included for a reasonable period (e.g. major version). The pricing itself is a differentiator — the product exists specifically because subscriptions are frustrating.
_Novelty_: YNAB costs ~$100/year indefinitely. A one-time purchase of even $40-60 pays for itself in under a year and then costs nothing. The business model *is* part of the product identity.
_Complexity flag_: Low for personal use phase. License key management becomes relevant when distributing publicly.

---

---

## Technique Continuation: Assumption Reversal (Extended)

### New Ideas Generated

**[Assumption #26]**: End-of-Month Guided Closeout
_Concept_: Instead of a passive report page, the app runs a brief guided conversation at month end. It surfaces 3–5 observations — patterns, wins, and tensions — and asks the user to make one or two intentional decisions before closing the month. Think "monthly review meeting with yourself."
_Novelty_: Reports are pull (you go look). This is push — the app initiates at the right moment with the right questions.

---

**[Assumption #27]**: Budget-Wrong vs. Behavior-Drift Detection
_Concept_: When a category is overspent 2+ months in a row, the app distinguishes two cases: (A) you consistently spend ~the same overage → your budget target is probably just wrong, suggest raising it; (B) spend is accelerating or spiked recently → behavior may be drifting, surface the trend and ask what's going on.
_Novelty_: Most apps treat all overspending as failure. This separates "you planned poorly" from "something changed" — each has a different right response.

---

**[Assumption #28]**: Information-Armed Decision Model
_Concept_: The closeout never tells the user what to do — it arms them with the trend and asks. "You've increased your Dining budget 3 months in a row. It's now $150 more than when you started. Want to lock this in as your new normal, or is this a period you want to rein in?" The user decides; the app just makes the pattern undeniable.
_Novelty_: Respects autonomy while eliminating the most common failure mode: not noticing a drift because you're too close to it.

---

**[Assumption #29]**: Single Savings Category with Signed Transactions
_Concept_: One reserved "Savings" category. Negative transactions (outflows from checking) represent deposits to savings; positive transactions (inflows) represent withdrawals. No second account, no balance tracking, no special mechanics — just the existing transaction model applied consistently.
_Novelty_: Eliminates unnecessary complexity. The sign already carries the meaning. A new user understands it immediately because it matches how they already think about their checking account.

---

**[Assumption #30]**: Monthly Savings Flow as Wealth Signal
_Concept_: Instead of deriving a running balance, the app tracks net savings flow per month — the sum of all Savings category transactions. A negative net means you saved that month; positive means you drew down. The closeout conversation leads with this number: "You saved $420 this month" or "You pulled $200 from savings — here's what drove it."
_Novelty_: You don't need to know the total savings balance to have a meaningful wealth conversation. The flow pattern over time tells the real story — are you consistently saving, or consistently borrowing from yourself?

---

**[Assumption #31]**: Savings Flow Chart
_Concept_: A bar chart showing net savings flow per month. Green bars = net saved. Red bars = net drew down. A simple running trend line. The closeout conversation always includes this view. No starting balance needed — the chart is useful from month one and gets richer over time.
_Novelty_: Most apps show a savings balance which requires connecting another account and knowing where you started. This shows savings behavior — which is what the wealth conversation is actually about.

---

**[Assumption #32]**: Financial Runway Metric
_Concept_: A live "runway" figure always visible on the main screen: "If income stopped today, you could last **2.4 months**." Calculated from (checking + savings balance) divided by average monthly essential spending (Need + Should categories only). Updates automatically as transactions are imported.
_Novelty_: Every budget app has this data. None of them surface it as a primary metric. Seeing "2.4 months" is more viscerally motivating than seeing a savings balance of $3,200.

---

**[Assumption #33]**: Runway Progress Toward 3-Month Goal
_Concept_: The runway figure is displayed as a progress bar toward a 3-month target — the standard emergency fund benchmark. Under 1 month is red. 1–2 months is orange. 2–3 months is yellow. 3+ months is green. The closeout conversation references it: "You gained 0.2 months of runway this month. You're 6 months from your safety goal at this pace."
_Novelty_: Converts an abstract savings number into a concrete survival timeline with a clear finish line. The color states match the envelope system — same visual language throughout.

---

**[Assumption #34]**: Savings Balance Bootstrap
_Concept_: On first setup (or any time), the user enters their current savings account balance as a one-time input. From that point forward, the app adjusts it automatically using savings flow transactions — adding deposits, subtracting withdrawals. The user never needs to reconnect or re-enter unless they want to resync to reality.
_Novelty_: No bank API. No account linking. One number entered once, kept current by the transactions the user is already importing. Simple enough to explain in a tooltip.

---

**[Assumption #35]**: Runway in the Closeout Conversation
_Concept_: The end-of-month closeout always ends with the runway figure and its month-over-month change. "Last month: 1.8 months. This month: 2.1 months. You're moving in the right direction." If runway shrank: "Your runway dropped 0.3 months. Savings withdrew $200 while essential spending crept up — here's the breakdown." The runway trend becomes the ultimate summary of whether the month was a wealth-building month or not.
_Novelty_: Closes the loop between monthly budgeting behavior and long-term financial health. Every month ends with a clear answer to "did I actually make progress?"

---

**[Assumption #36]**: Dual Balance Ledger
_Concept_: The transaction ledger always shows two balances in the header: **Cleared** (sum of all imported/confirmed transactions) and **Working** (cleared + manually entered uncleared transactions). Each transaction row has a cleared indicator. Importing OFX marks transactions as cleared automatically; manually entered transactions start as uncleared until matched or manually confirmed.
_Novelty_: Two numbers, always visible, always meaningful. Cleared = what the bank sees. Working = what you see coming.

---

**[Assumption #37]**: OFX Match-and-Clear
_Concept_: When an OFX import finds a transaction that matches an existing uncleared entry (same amount, close date, similar payee), it automatically marks it cleared and links the two records. If ambiguous, it queues for user confirmation. This eliminates the manual reconciliation ceremony — the import does the work.
_Novelty_: Most apps make reconciliation a separate, explicit step. This makes it automatic and invisible for the common case — you only see it when something needs attention.

---

### Emerging Product Philosophy (Updated)

> **The goal is not surviving a month. The goal is building wealth — one month at a time.**

The app's north star metric is financial runway: how long could you last if income stopped? Every feature serves that number — categorization keeps the data clean, envelopes keep spending intentional, the closeout conversation makes drift visible, and savings flow tracking makes progress real.

---

---

## Technique Execution: SCAMPER Method

### Ideas Generated

**[SCAMPER-E #38]**: Eliminate the "Budget Only What You Have" Constraint
_Concept_: The app places no restriction on allocating money to envelopes before it arrives. If you know your paycheck lands Friday, you plan against it today. The distinction between "real" and "committed" money is visible but never a blocker. You can fully plan a month on expected income before a single dollar clears.
_Novelty_: YNAB treats this as a philosophical principle. For anyone with predictable income, it's pure friction with no benefit. Eliminating the constraint respects that adults know when they get paid.

---

**[SCAMPER-S #39]**: Income-Aware Month Planning
_Concept_: The planning session knows when your paychecks land relative to your bills. On the 1st, it shows only income already received and flags which bills need funding before the next paycheck arrives. As each paycheck lands (imported via OFX), the planning session updates — "Paycheck 2 of 2 received. You can now fully fund Dining and Gas."
_Novelty_: Most apps front-load the month as if income is lump-sum. This makes the planning session a real-time picture of what's funded, what's waiting on a paycheck, and whether any bill timing is going to cause a problem.

---

**[SCAMPER-C #40]**: "Turn the Month" Ritual
_Concept_: Closing the old month and opening the new one is a single guided flow. It reviews last month's patterns and runway change, surfaces the 2–3 decisions worth making, then rolls directly into next month's planning session: confirm bill dates, confirm income timing, fill envelopes. Start to finish in under 5 minutes. One ritual, one transition.
_Novelty_: YNAB treats month-end and month-start as completely separate concerns. Combining them into one intentional ritual makes the transition feel like a meaningful moment rather than administrative overhead.

---

**[SCAMPER-C #41]**: Wealth Panel
_Concept_: A persistent panel on the main screen — alongside the envelope list — showing two things: the runway metric with its fuel gauge toward 3 months, and the savings flow bar chart for the last 6 months. Together they answer the only question that matters beyond the monthly budget: am I building anything? The panel is always visible, not a report you navigate to.
_Novelty_: Surfaces long-term wealth trajectory in the same view as day-to-day spending. You can't ignore it — it's right there every time you open the app.

---

**[SCAMPER-A #42]**: Fuel Gauge Runway Display
_Concept_: The runway metric is displayed as a gauge — a simple arc or dial showing Empty → 1 month → 2 months → 3 months (Full). The needle position is instantly readable without processing a number. Red zone under 1 month, yellow 1–2, green 2–3, "Full" at 3+. The actual month figure sits below the gauge as a label.
_Novelty_: A number like "2.1 months" requires mental processing. A gauge needle in the green zone is understood in a glance. Borrows from the most universally understood urgency indicator humans interact with daily.

---

**[SCAMPER-M #43]**: Month Transition Lock
_Concept_: On the first import or app open after month end, the app enters "Turn the Month" mode and doesn't release until the ritual is complete. Navigation is locked — you can't get to the ledger, envelopes, or wealth panel until you've closed last month and opened the new one. The ritual is fast (5 minutes), but non-negotiable.
_Novelty_: Every other budget app makes the month transition something you can ignore indefinitely. Making it a gate — friendly but firm — ensures the user is never flying blind into a new month. The lock is the feature.

---

**[SCAMPER-P #44]**: Merchant Pattern Secondary Uses *(Future Scope)*
_Concept_: The merchant rules engine — already built for categorization — could eventually auto-tag income sources by payee, flag large unfamiliar transactions for review, and auto-identify recurring subscriptions from monthly same-amount patterns. One engine, multiple jobs. Deferred until the core is solid.
_Novelty_: No new infrastructure required. The same pattern-matching applied to different outputs.

---

---

## Technique Execution: First Principles Thinking

### Core Distillation

**The North Star Statement:**

> *Budgeting apps help you get through the month. This helps you build wealth.*

**The User:**

> Anyone stuck in the monthly survival loop — regardless of what tool got them there, or whether they've used a tool at all.

---

### The Three Non-Negotiables

**1. The month is a mechanism, not the goal.**
Every feature serves the wealth trajectory. Features that only help you survive the month are optional. The envelope system, planning session, and import workflow are all infrastructure in service of a rising runway number.

**2. Wealth trajectory lives on the budget screen.**
Fuel gauge and savings flow visible alongside envelopes — where allocation decisions are made. Not buried in reports. Not on the transaction screen. Right there, in the same moment you're deciding where money goes, so every allocation decision feels consequential.

**3. Wealth-destructive patterns must be undeniable.**
Surfaced at the Turn the Month ritual without judgment. When you've borrowed from savings three months in a row or your runway has been shrinking for six months, the app makes it undeniable at the one moment you're most receptive. You can ignore it. You can't not see it.

---

## Session Complete

**Total Ideas Generated:** 44
**Techniques Completed:** Assumption Reversal · SCAMPER Method · First Principles Thinking
**Session Duration:** Multi-session (2026-04-02)

### What This Session Produced

A complete product philosophy and feature set for a personal budget app built around one differentiating idea: other apps help you survive the month; this one helps you build wealth. The 44 ideas span:

- **Data & Categorization** — OFX import, self-teaching merchant rules, pattern matching, rule + override model
- **Envelope System** — typed envelopes (Rolling/Bill/Goal), traffic light states, tooltips, borrow overlay, category priority
- **Income & Planning** — future income budgeting, flexible pay frequency, income-aware month planning, mutable life config
- **Wealth Tracking** — savings flow category, monthly savings flow signal, derived savings balance, runway metric, fuel gauge display, wealth panel
- **End-of-Month Ritual** — guided closeout, budget-wrong vs. behavior-drift detection, information-armed decisions, Turn the Month lock
- **Ledger** — dual cleared/working balance, OFX match-and-clear
- **Tech & Business** — Tauri + React, OneDrive sync with file locking, one-time purchase model

### The Product in One Sentence

> A desktop budget app that replaces the monthly survival loop with a path to financial runway — built on local data, a one-time purchase, and the belief that the goal is never just getting through the month.
