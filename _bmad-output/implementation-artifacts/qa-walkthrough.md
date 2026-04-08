# QA Walkthrough — GarbanzoBeans

**Purpose:** Systematic screen-by-screen review of all completed stories. Each item is verified live in the running app against the UX spec and story acceptance criteria.

**How to resume:** Run `bmad-sprint-status` in a fresh context — it will surface this file as in-progress work. Then say "let's continue the QA walkthrough."

**Issue logging:** Bugs and design issues found here go to `deferred-work.md` with a `QA Walkthrough` source tag.

---

## Status

| Screen / Story | Completed |
|---|---|
| 1. Global UI & Design System | ✅ 2026-04-07 |
| 2. First Launch / Onboarding | ✅ 2026-04-07 |
| 3. Settings Screen | ✅ 2026-04-07 |
| 4. Main / Budget Screen (Envelope List) | ✅ 2026-04-07 |
| 5. Create Envelope Flow | ✅ 2026-04-07 |
| 6. Edit / Delete Envelope Flow | ✅ 2026-04-07 |
| 7. Read-Only Mode (Sentinel Lock) | ✅ 2026-04-07 |
| 8. Auto-Update Dialog | ✅ 2026-04-07 |
| 9. Story 2.3 — Envelope Traffic Lights & Tooltips | ✅ 2026-04-07 |

---

## 1. Global UI & Design System
*Stories: 1-1, 1-2 | Spec: ux-design-specification.md*

### App Shell
- [ ] App window opens at correct default size
- [ ] Title bar / frame renders correctly on Windows
- [ ] Background color matches Dark Forest spec (`#111214`)
- [ ] No flash of unstyled content on launch

### Navigation Sidebar
- [ ] Sidebar background matches spec (`#0F2218`)
- [ ] All 4 nav items present and labeled correctly
- [ ] Active nav item has visible selected state
- [ ] Nav icons render at correct size and color
- [ ] Hover states correct on nav items
- [ ] Sidebar width correct per spec

### Typography
- [ ] Roboto font loads correctly (no fallback font visible)
- [ ] Heading sizes/weights match spec
- [ ] Body text size/weight/color match spec
- [ ] Accent color (`#C0F500`) used in correct places

### Spacing & Layout
- [ ] Overall layout proportions match UX spec
- [ ] No unintended scrollbars
- [ ] Content doesn't clip or overflow on default window size

---

## 2. First Launch / Onboarding
*Story: 1-5 | Spec: ux-design-specification.md*

### Entry Condition
- [ ] Fresh launch (no prior data) routes to onboarding screen
- [ ] App with existing data skips onboarding and goes to Budget screen

### Onboarding Screen
- [ ] Screen renders without visual errors
- [ ] All fields present: Budget Name, Pay Frequency, Pay Date(s)
- [ ] Pay Frequency selector works (weekly / bi-weekly / semi-monthly / monthly)
- [ ] Pay Date fields update correctly based on frequency selection
- [ ] Correct number of pay date inputs per frequency
- [ ] "Get Started" / submit button disabled when fields are invalid
- [ ] "Get Started" button enabled when all fields valid

### Validation
- [ ] Empty budget name blocked
- [ ] Whitespace-only budget name blocked
- [ ] Pay date fields validate correctly per frequency

### Completion
- [ ] Submitting valid form navigates to Budget screen
- [ ] Budget name persisted (visible in app)
- [ ] Pay dates persisted (visible in Settings)
- [ ] Onboarding does not re-appear on relaunch

---

## 3. Settings Screen
*Story: 1-6 | Spec: ux-design-specification.md*

### Navigation
- [ ] Settings nav item routes to Settings screen
- [ ] Settings screen renders without visual errors
- [ ] Back navigation works (if applicable)

### Form Fields
- [ ] Budget Name field pre-populated with saved value
- [ ] Pay Frequency pre-populated with saved value
- [ ] Pay Date fields pre-populated with saved values
- [ ] Pay Date fields update when Pay Frequency is changed

### Saving
- [ ] Save button disabled when no changes made
- [ ] Save button enabled when a change is made
- [ ] Saving shows feedback (spinner / confirmation)
- [ ] Changes persist after navigating away and returning
- [ ] Changes persist after app relaunch

### Validation
- [ ] Same validation rules as onboarding apply
- [ ] Invalid state disables Save button
- [ ] Error states visible and legible

---

## 4. Main / Budget Screen (Envelope List)
*Stories: 2-1, 2-2 | Spec: ux-design-specification.md*

### Screen Layout
- [ ] Budget screen is the default landing after onboarding
- [ ] Screen renders without visual errors
- [ ] "Add Envelope" button / control visible and accessible

### Empty State
- [ ] Empty state shown when no envelopes exist
- [ ] Empty state copy and design match spec

### Envelope Cards (with data)
- [ ] Each envelope shows: name, allocated amount, spent amount, remaining
- [ ] Currency values formatted correctly (e.g., `$1,234.56`)
- [ ] `$0.00` values render correctly (not `NaN` or blank)
- [ ] Card layout matches UX spec
- [ ] Cards listed in correct order (insertion order or spec-defined)

### Envelope Card — Overflow Menu
- [ ] ⋯ button visible on each card
- [ ] ⋯ button opens action menu
- [ ] Action menu contains correct options (Edit, Delete)
- [ ] Aria labels on ⋯ button are correct (not "Envelope settings")

---

## 5. Create Envelope Flow
*Story: 2-2 | Spec: ux-design-specification.md*

### Opening the Form
- [ ] "Add Envelope" triggers create form / modal
- [ ] Form renders without visual errors
- [ ] Form fields match spec

### Validation
- [ ] Empty name blocked
- [ ] Whitespace-only name blocked
- [ ] Duplicate name behavior (blocked or allowed per spec)
- [ ] Submit disabled when invalid

### Creating
- [ ] Valid submission creates envelope and appears in list immediately (optimistic update)
- [ ] New envelope persists after navigation
- [ ] New envelope persists after relaunch
- [ ] Cancel / dismiss closes form without creating

---

## 6. Edit / Delete Envelope Flow
*Story: 2-2 | Spec: ux-design-specification.md*

### Edit
- [ ] Edit action opens edit form pre-populated with current values
- [ ] All fields editable
- [ ] Save updates envelope in list immediately
- [ ] Changes persist after navigation and relaunch
- [ ] Cancel closes without saving

### Delete
- [ ] Delete action shows confirmation dialog
- [ ] Confirmation dialog copy matches spec
- [ ] Confirming delete removes envelope from list immediately
- [ ] Deletion persists after navigation and relaunch
- [ ] Cancelling delete dialog leaves envelope intact

---

## 7. Read-Only Mode (Sentinel Lock)
*Story: 1-7 | Spec: story file*

### Single Instance (Normal)
- [ ] App launches in read-write mode normally
- [ ] No read-only banner/indicator shown

### Read-Only State
- [ ] Launching a second instance triggers read-only mode
- [ ] Read-only indicator/banner visible and legible
- [ ] Create / Edit / Delete actions are suppressed in read-only mode
- [ ] Settings save suppressed in read-only mode

---

## 8. Auto-Update Dialog
*Story: 1-8 | Spec: story file*

### Update Available
- [ ] Update check runs on launch (or per spec trigger)
- [ ] Update available dialog appears with correct copy
- [ ] "Update Now" and "Later" options present

### Actions
- [ ] "Later" dismisses dialog and continues normally
- [ ] "Update Now" initiates download/install sequence
- [ ] Progress feedback shown during download (if applicable)

### No Update
- [ ] App launches silently when no update available (no spurious dialog)

---

## Issues Found

*Issues discovered during walkthrough are logged here and mirrored to `deferred-work.md`.*

| # | Screen | Description | Severity | deferred-work.md entry |
|---|---|---|---|---|
| 1 | 1 | Sidebar hover state not implemented | Medium | ✅ logged |
| 2 | 1 | White flash on launch (FOUC) | Medium | ✅ logged |
| 3 | 1 | Sidebar responsive collapse not implemented | Low | ✅ logged |
| 4 | 1 | TanStack Router devtools badge visible | Low | ✅ logged |
| 5 | 2 | Onboarding layout not vertically centered (all 4 steps) | Medium | ✅ logged |
| 6 | 2 | Budget start month shows raw ISO format | High | ✅ logged |
| 7 | 2 | Budget start month should be a proper picker | Medium | ✅ logged |
| 8 | 2 | Month dropdown overlaps form fields | Medium | ✅ logged |
| 9 | 2 | Onboarding resets to splash screen mid-flow | High | ✅ logged |
| 10 | 2 | Budget screen empty state copy missing | Low | ✅ logged |
| 11 | 2 | Pay schedule design too rigid (design concern) | High | ✅ logged |
| 12 | 2 | Savings target copy implies hard limit not goal | Medium | ✅ logged |
| 13 | 2 | Onboarding needs visual/teaching experience | Medium | ✅ logged |
| 14 | 3 | Settings Save exposes raw SQL error | Critical | ✅ logged |
| 15 | 3 | Settings Save button always enabled | Medium | ✅ logged |
| 16 | 3 | Budget Name and Start Month not editable in Settings | Medium | ✅ logged |
| 17 | 4 | Envelope card shows single unlabeled amount | Medium | ✅ logged |
| 18 | 4/5 | Terminology: "Envelope" may be too jargon-heavy | Low | ✅ logged |
| 19 | 6 | ⋯ button hard to see (low contrast) | Low | ✅ logged |
| 20 | 6 | Edit flow incomplete — type/category not editable | High | ✅ logged |
| 21 | 7 | Read-only mode does not suppress write actions | Critical | ✅ logged |

### Story 2.3 — Envelope Traffic Lights & Tooltips (in-progress, 2026-04-07)

**How to resume:** Open the app (read-write instance, not read-only), navigate to Budget screen. Say "let's continue the Story 2.3 QA walkthrough."

**Limitation:** Both test envelopes have `allocatedCents = 0`, so only the caution/amber state can be verified visually. Funded (lime) and overspent (red) states are untestable until Story 2.4 (allocation input) and Epic 3 (spending data).

#### Checks completed (live app)

| Check | Result |
|---|---|
| Amber left border on unfunded envelopes | ✅ |
| "Unfunded" badge with amber styling | ✅ |
| Tooltip fires on hover of state badge | ✅ |
| Tooltip text — Rolling/caution matches spec | ✅ "This rolling budget has no allocation yet. Add funds to get started." |
| Type and priority badges preserved | ✅ Rolling, Need |
| Amount display preserved ($0.00) | ✅ |

#### Checks remaining

- [ ] Mini progress bar visible below envelope name (subtle 3px track)
- [ ] Tooltip appears above badge (or flips below if clipped)
- [ ] Tooltip delay feels ~300ms (not instant, not sluggish)
- [ ] Tooltip text for Bill and Goal type envelopes (create one of each to verify)
- [ ] Inline name edit still works (click name → input appears)
- [ ] Escape cancels edit without saving
- [ ] Enter / blur saves name change
- [ ] ⋯ button opens delete dialog (not action menu — pre-existing deferred issue)
- [ ] Delete confirmation and cancellation work
- [ ] Funded (lime) state bar and badge — **blocked until Story 2.4**
- [ ] Overspent (red) state — **blocked until Epic 3**

#### Issues spotted during live walkthrough

| # | Description | Severity | Notes |
|---|---|---|---|
| — | Read-Only banner present during session | — | Pre-existing; user had two instances open |
| — | TanStack Router badge visible | — | Pre-existing deferred issue |
