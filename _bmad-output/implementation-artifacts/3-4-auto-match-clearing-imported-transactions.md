# Story 3.4: Auto-Match — Clearing Imported Transactions

Status: done

## Story

As Tom,
I want imported OFX transactions to automatically match and clear against existing uncleared entries I've already entered manually,
so that I don't have to manually reconcile what I've already recorded.

## Acceptance Criteria

1. **Given** an OFX file is imported containing a transaction that matches an existing uncleared entry (same payee substring, same amount, date within 3 days)
   **When** the `import_ofx` command runs its matching logic
   **Then** the existing uncleared transaction is marked as cleared (`is_cleared=1`) and linked to the imported record via `import_batch_id`; a duplicate is not created (FR4)

2. **Given** an imported transaction has no match in existing uncleared entries
   **When** the import commits
   **Then** the transaction is inserted as a new cleared entry (existing behavior from Story 3.2 preserved)

3. **Given** multiple existing uncleared entries could match the same imported transaction
   **When** the matching logic runs
   **Then** the closest match by date is selected; ties broken by lowest `id`; no silent double-match occurs (each uncleared entry can only be matched once per import run)

## Tasks / Subtasks

- [x] Task 1 — Extend `ImportResult` struct in `src-tauri/src/commands/mod.rs` (AC: 1, 3)
  - [x] Add `pub matched_transactions: Vec<Transaction>` field to `ImportResult` struct (serde serializes as `matchedTransactions`)
  - [x] `count` field continues to represent total OFX transactions processed (= new insertions + matched clears)

- [x] Task 2 — Add date helpers in `src-tauri/src/commands/mod.rs` (AC: 1, 3)
  - [x] Add `fn iso_date_to_days(iso: &str) -> Option<i64>` using Julian Day Number algorithm — parses "YYYY-MM-DD", no external crate needed
  - [x] Add `fn date_diff_days(a: &str, b: &str) -> i64` — returns `i64::MAX` if either date is unparseable, otherwise `(da - db).abs()`

- [x] Task 3 — Modify `import_ofx_inner` with auto-match logic (AC: 1, 2, 3)
  - [x] Before the insert loop: query ALL existing uncleared transactions (`is_cleared=0`) from the DB within the open transaction scope
  - [x] Initialize a `HashSet<i64>` (`matched_ids`) to prevent double-matching the same uncleared row
  - [x] For each parsed OFX transaction `(payee, amount_cents, date)`:
    - Find candidates: uncleared rows where `id NOT IN matched_ids`, `amount_cents` == imported amount, payee substring match (case-insensitive: existing payee contained in imported payee OR imported payee contained in existing payee), and `date_diff_days` ≤ 3
    - If candidates exist: pick the one with minimum `date_diff_days`; break ties by lowest `id`; UPDATE that row `SET is_cleared=1, import_batch_id=?batch_id WHERE id=?best_id`; SELECT it back with `map_transaction_row`; insert id into `matched_ids`; push to `matched_transactions`
    - If no candidates: INSERT as new cleared transaction (current code path — `is_cleared=1, import_batch_id=batch_id`); push to `transactions`
  - [x] After loop: `tx.commit()?`
  - [x] Return `ImportResult { count: (transactions.len() + matched_transactions.len()) as i64, batch_id, latest_date, transactions, matched_transactions }`

- [x] Task 4 — Add Rust tests in `import_tests` module (AC: 1, 2, 3)
  - [x] `test_auto_match_clears_existing_uncleared_transaction` — pre-insert an uncleared transaction (payee "Kroger", amount -4523, date "2026-10-12"), import OFX with ("KROGER #0423", -4523, "2026-10-12"); verify `matched_transactions.len() == 1`, `transactions.len() == 0`, matched tx `is_cleared == true` and `import_batch_id` is set, no new row inserted
  - [x] `test_auto_match_no_match_inserts_new` — pre-insert uncleared tx (amount -4523, date "2026-10-01"), import OFX with different amount; verify `transactions.len() == 1`, `matched_transactions.len() == 0`
  - [x] `test_auto_match_date_window_3_days` — pre-insert uncleared tx with date "2026-10-09", import OFX with same payee/amount but date "2026-10-12" (3 days apart); verify match occurs; then test with date "2026-10-13" (4 days apart) verifying no match (new insert)
  - [x] `test_auto_match_no_double_match` — pre-insert 1 uncleared tx; import OFX with 2 transactions both matching that same uncleared entry; verify only one match occurs (`matched_transactions.len() == 1`, `transactions.len() == 1`)
  - [x] `test_auto_match_picks_closest_date_candidate` — pre-insert 2 uncleared txs both matching (same payee/amount, dates "2026-10-10" and "2026-10-11"); import OFX with date "2026-10-11"; verify the "2026-10-11" entry is matched (closest date)

- [x] Task 5 — Update TypeScript `ImportResult` in `src/lib/types.ts` (AC: 1)
  - [x] Add `matchedTransactions: Transaction[]` field to `ImportResult` interface — required field, always an array (never undefined)

- [x] Task 6 — Update `importOFX` action in `src/stores/useTransactionStore.ts` (AC: 1)
  - [x] In the `set(state => ...)` call after a successful import: first apply `matchedTransactions` updates in-place over existing `state.transactions` (map: if `result.matchedTransactions.find(m => m.id === t.id)` exists, use the matched version); then append `result.transactions` (new insertions) to the updated list
  - [x] Pattern: `const updated = state.transactions.map(t => result.matchedTransactions.find(m => m.id === t.id) ?? t); return { transactions: [...updated, ...result.transactions], ... }`

- [x] Task 7 — Update `useTransactionStore.test.ts` (AC: 1, 2, 3)
  - [x] Update `makeImportResult` factory to include `matchedTransactions: []` (fixes TypeScript compilation for all existing tests)
  - [x] Add test: `importOFX updates matched transactions in-place` — set store with 1 existing uncleared tx (id: 5); mock invoke returns ImportResult with `matchedTransactions: [{ ...tx, id: 5, isCleared: true }]` and `transactions: []`; verify store has 1 transaction with `isCleared: true`
  - [x] Add test: `importOFX appends new and updates matched transactions together` — store has 1 existing tx (id: 5, uncleared); mock returns `matchedTransactions: [{id: 5, isCleared: true}]` and `transactions: [new tx id: 10]`; verify store has 2 transactions, id 5 is cleared, id 10 is present

## Dev Notes

### Architecture Compliance

- **Auto-match logic is in Rust, not TypeScript:** The acceptance criteria explicitly says "the `import_ofx` command runs its matching logic" — this means the algorithm lives inside `import_ofx_inner` in `src-tauri/src/commands/mod.rs`. Do NOT create a `matchTransactions.ts` helper.
- **No new Tauri commands:** This story extends the existing `import_ofx` command only. No new commands are added.
- **No new crate dependencies:** No `chrono` — implement date arithmetic with pure Rust using the Julian Day Number algorithm (see below). Do NOT add crates to Cargo.toml.
- **Store-first IPC:** Components never call `invoke` directly. The store handles all Tauri interaction. (ADR-3, ADR-5)
- **Atomic import transaction:** The matching UPDATE and new INSERT operations all run inside the same `conn.unchecked_transaction()` that wraps the entire import. Either the full import (matches + inserts) commits or the whole thing rolls back. (NFR5, NFR6)

### Key File Locations

| Concern | Actual path |
|---|---|
| Rust import logic | `src-tauri/src/commands/mod.rs` — `import_ofx_inner` function |
| Rust ImportResult struct | `src-tauri/src/commands/mod.rs` — line ~1645 |
| Rust import tests | `src-tauri/src/commands/mod.rs` — `mod import_tests` block |
| TS types | `src/lib/types.ts` — `ImportResult` interface |
| TS store | `src/stores/useTransactionStore.ts` — `importOFX` action |
| TS store tests | `src/stores/useTransactionStore.test.ts` |

### No New Files

This story modifies only existing files — no new source files need to be created.

### Rust Date Helper — Julian Day Number

No `chrono` crate is available. Use this pure-integer algorithm:

```rust
fn iso_date_to_days(iso: &str) -> Option<i64> {
    if iso.len() < 10 { return None; }
    let year: i64 = iso[0..4].parse().ok()?;
    let month: i64 = iso[5..7].parse().ok()?;
    let day: i64 = iso[8..10].parse().ok()?;
    // Julian Day Number (Gregorian calendar)
    let a = (14 - month) / 12;
    let y = year + 4800 - a;
    let m = month + 12 * a - 3;
    Some(day + (153 * m + 2) / 5 + 365 * y + y / 4 - y / 100 + y / 400 - 32045)
}

fn date_diff_days(a: &str, b: &str) -> i64 {
    match (iso_date_to_days(a), iso_date_to_days(b)) {
        (Some(da), Some(db)) => (da - db).abs(),
        _ => i64::MAX,
    }
}
```

Place these functions near `import_ofx_inner`, before it in the OFX Import section.

### Payee Substring Match Logic

```rust
let imp_lower = payee.to_lowercase();
let ex_lower = existing_payee.to_lowercase();
let payee_matches = imp_lower.contains(&ex_lower) || ex_lower.contains(&imp_lower);
```

- Case-insensitive
- Either direction: "Kroger" matches "KROGER #0423" (existing is substring of imported) AND "KROGER #0423" matches "Kroger" (imported contains existing)

### Querying Uncleared Transactions Before Loop

Inside `import_ofx_inner`, before the `for (payee, amount_cents, date) in &parsed` loop, query all existing uncleared transactions into a `Vec<Transaction>`:

```rust
let mut uncleared: Vec<Transaction> = {
    let mut stmt = conn.prepare(
        "SELECT id, payee, amount_cents, date, envelope_id, is_cleared, import_batch_id, created_at
         FROM transactions WHERE is_cleared=0"
    )?;
    stmt.query_map([], map_transaction_row)?.collect::<Result<Vec<_>, _>>()?
};
```

Note: This query runs on `conn` (outside the transaction scope), but because `unchecked_transaction()` is used and we haven't inserted anything yet, we see the correct pre-import state. Alternatively, use `tx.prepare(...)` — both work since the transaction hasn't modified anything yet.

### Candidate Selection Logic

```rust
let best_candidate = uncleared.iter()
    .filter(|t| !matched_ids.contains(&(t.id as i64)))
    .filter(|t| t.amount_cents == *amount_cents)
    .filter(|t| {
        let imp = payee.to_lowercase();
        let ex = t.payee.to_lowercase();
        imp.contains(&ex) || ex.contains(&imp)
    })
    .filter(|t| date_diff_days(&t.date, date) <= 3)
    .min_by_key(|t| (date_diff_days(&t.date, date), t.id));
```

- `min_by_key((date_diff, id))` picks closest date; breaks ties by lowest id (first inserted)
- The result is `Option<&&Transaction>`; match on it to decide insert vs update

### `import_ofx_inner` Full Structure After Changes

```rust
fn import_ofx_inner(conn: &rusqlite::Connection, path: &str) -> Result<ImportResult, AppError> {
    let content = read_ofx_file(path)?;
    let parsed = parse_ofx_sgml(&content)?;
    if parsed.is_empty() { return Err(...); }
    let latest_date = parsed.iter().map(|(_, _, d)| d.as_str()).max().map(String::from);
    let batch_id = generate_batch_id();

    // Load existing uncleared entries before starting the transaction
    let uncleared: Vec<Transaction> = { /* query as above */ };
    let mut matched_ids: std::collections::HashSet<i64> = std::collections::HashSet::new();

    let tx = conn.unchecked_transaction()?;
    let mut transactions = Vec::with_capacity(parsed.len());
    let mut matched_transactions = Vec::new();

    for (payee, amount_cents, date) in &parsed {
        let best = uncleared.iter()
            .filter(/* as above */)
            .min_by_key(|t| (date_diff_days(&t.date, date), t.id));

        match best {
            Some(candidate) => {
                tx.execute(
                    "UPDATE transactions SET is_cleared=1, import_batch_id=?1 WHERE id=?2",
                    rusqlite::params![batch_id, candidate.id],
                )?;
                let updated = tx.query_row(
                    "SELECT id, payee, amount_cents, date, envelope_id, is_cleared, import_batch_id, created_at
                     FROM transactions WHERE id=?1",
                    rusqlite::params![candidate.id],
                    map_transaction_row,
                )?;
                matched_ids.insert(candidate.id as i64);
                matched_transactions.push(updated);
            }
            None => {
                tx.execute(
                    "INSERT INTO transactions (payee, amount_cents, date, envelope_id, is_cleared, import_batch_id)
                     VALUES (?1, ?2, ?3, NULL, 1, ?4)",
                    rusqlite::params![payee, amount_cents, date, batch_id],
                )?;
                let id = tx.last_insert_rowid();
                let row = tx.query_row(/* SELECT ... WHERE id=?1 */, rusqlite::params![id], map_transaction_row)?;
                transactions.push(row);
            }
        }
    }
    tx.commit()?;
    Ok(ImportResult {
        count: (transactions.len() + matched_transactions.len()) as i64,
        batch_id,
        latest_date,
        transactions,
        matched_transactions,
    })
}
```

### TypeScript Store Update Pattern

```ts
importOFX: async (path) => {
  set({ isWriting: true, importError: null, importResult: null });
  try {
    const result = await invoke<ImportResult>('import_ofx', { path });
    set(state => {
      const updated = state.transactions.map(t =>
        result.matchedTransactions.find(m => m.id === t.id) ?? t
      );
      return {
        transactions: [...updated, ...result.transactions],
        importResult: result,
        isWriting: false,
      };
    });
  } catch (err) {
    const message = typeof err === 'string' ? err : (err as AppError).message ?? String(err);
    set({ importError: message, isWriting: false });
  }
},
```

### Existing Tests — Impact Analysis

The existing test `'appends returned transactions to existing list'` will continue to pass since `matchedTransactions: []` (empty array) means no in-place updates occur, and `result.transactions` still gets appended. Just update `makeImportResult` fixture to include `matchedTransactions: []`.

The existing test `'sets importResult on success'` also continues to work — `importResult` is still set to `result`.

### Transaction.id Field Type Note

`Transaction.id` is `number` in TypeScript and `i64` in Rust. When using `candidate.id` in Rust's HashSet for matched_ids, cast to `i64`: `matched_ids.insert(candidate.id as i64)`. The Transaction struct field `pub id: i64` — this is already an i64.

### Previous Story Learnings (from 3.3)

- `map_transaction_row` closure is defined earlier in `mod.rs` and maps SQLite row → `Transaction`. Use it for both the UPDATE SELECT-back and the INSERT SELECT-back.
- `conn.unchecked_transaction()` is the pattern used in this codebase (not `conn.transaction()`).
- Test pattern: `fresh_conn()` helper in `import_tests` module creates an in-memory SQLite with migrations applied. Use it for all new Rust tests.
- The OFX test content format uses either `<DTPOSTED>YYYYMMDD` or `<DTPOSTED>YYYYMMDD120000[0:GMT]` — both are parsed correctly by `parse_ofx_sgml`.
- To pre-insert an uncleared transaction in tests, use `create_transaction_inner` if it exists, or execute a raw INSERT with `is_cleared=0`.

### References

- Acceptance criteria: [Source: _bmad-output/planning-artifacts/epics.md — Story 3.4]
- FR4 (auto-match imported OFX against existing uncleared entries): [Source: _bmad-output/planning-artifacts/epics.md — FR Coverage Map]
- Architecture note on auto-match algorithm placement: [Source: _bmad-output/planning-artifacts/architecture.md — line 867]
- ADR-3 (typed Tauri commands, snake_case): [Source: _bmad-output/planning-artifacts/architecture.md — ADR-3]
- ADR-5 (store-first IPC, no direct invoke from components): [Source: _bmad-output/planning-artifacts/architecture.md — ADR-5]
- NFR5/NFR6 (atomic writes): [Source: _bmad-output/planning-artifacts/epics.md — NFR5, NFR6]
- `import_ofx_inner` existing code: [Source: src-tauri/src/commands/mod.rs — line ~1767]
- `ImportResult` struct: [Source: src-tauri/src/commands/mod.rs — line ~1645]
- `Transaction` struct: [Source: src-tauri/src/commands/mod.rs — line ~1843]
- `map_transaction_row` closure: [Source: src-tauri/src/commands/mod.rs]
- `ImportResult` TS interface: [Source: src/lib/types.ts — line 131]
- `importOFX` store action: [Source: src/stores/useTransactionStore.ts — line 72]
- Existing import tests: [Source: src-tauri/src/commands/mod.rs — mod import_tests]
- Transaction store tests: [Source: src/stores/useTransactionStore.test.ts]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

- Rust borrow checker: `stmt.query_map(...).collect()` inside a block caused lifetime error — fixed by assigning the collected `Vec` to a named `rows` variable before returning from the block (E0597).

### Completion Notes List

- Extended `ImportResult` struct with `matched_transactions: Vec<Transaction>` field (serde: `matchedTransactions`).
- Added pure-Rust `iso_date_to_days` (Julian Day Number) and `date_diff_days` helpers — no `chrono` crate.
- `import_ofx_inner` now queries all uncleared transactions before the import loop, then uses a `HashSet<i64>` (`matched_ids`) to prevent double-matching. For each OFX transaction: if a matching uncleared row exists (same `amount_cents`, case-insensitive payee substring, date within 3 days), it UPDATEs that row to `is_cleared=1` and pushes to `matched_transactions`; otherwise INSERTs a new cleared row as before.
- `count` now equals `transactions.len() + matched_transactions.len()` (total OFX rows processed).
- All 5 new Rust tests pass; 49 total Rust tests pass with no regressions.
- TypeScript `ImportResult` interface updated with `matchedTransactions: Transaction[]`.
- `importOFX` store action now maps `matchedTransactions` in-place over existing store transactions before appending new inserts.
- `makeImportResult` fixture updated with `matchedTransactions: []` to fix TypeScript compilation; 2 new store tests added and passing (19 total TS store tests).
- BorrowOverlay.test.tsx failures (13) are pre-existing — confirmed via `git stash` check — unrelated to this story.

### File List

- `src-tauri/src/commands/mod.rs`
- `src/lib/types.ts`
- `src/stores/useTransactionStore.ts`
- `src/stores/useTransactionStore.test.ts`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`

### Review Findings

- [x] [Review][Patch] Empty-string OFX payee matches any uncleared entry with the right amount/date — `"x".contains("")` is always `true`; an OFX transaction with no NAME/MEMO tag produces `payee = ""` and passes the payee filter against every candidate [`src-tauri/src/commands/mod.rs` — `import_ofx_inner` payee filter]
- [x] [Review][Defer] `unchecked_transaction` borrow safety pattern — pre-existing [`src-tauri/src/commands/mod.rs`] — deferred, pre-existing
- [x] [Review][Defer] Rust auto-match tests use predictable fixed filenames in `std::env::temp_dir()` — parallel test run collision risk [`src-tauri/src/commands/mod.rs` — `mod import_tests`] — deferred, pre-existing
- [x] [Review][Defer] Re-importing the same OFX file inserts duplicate cleared rows — no FITID/deduplication guard [`src-tauri/src/commands/mod.rs` — `import_ofx_inner`] — deferred, pre-existing
- [x] [Review][Defer] `ofx_amount_to_cents` silently truncates sub-cent precision (e.g. `-10.005` → 1000¢ not 1001¢) — pre-existing from story 3.2 [`src-tauri/src/commands/mod.rs`] — deferred, pre-existing
- [x] [Review][Defer] Unicode minus sign (U+2212) in OFX amount fields causes silent transaction drop — pre-existing from story 3.2 [`src-tauri/src/commands/mod.rs`] — deferred, pre-existing
- [x] [Review][Defer] Imported transactions appended to store state regardless of active month filter — imported rows from other months appear in current month view until next `loadTransactions` [`src/stores/useTransactionStore.ts`] — deferred, pre-existing
- [x] [Review][Defer] `importOFX` in-place matched-transaction update is a no-op if `loadTransactions` was never called — matched/cleared rows invisible in UI until reload [`src/stores/useTransactionStore.ts`] — deferred, pre-existing
- [x] [Review][Defer] `generate_batch_id` atomic counter resets on process restart — theoretical `batch_id` collision within same millisecond after crash/restart [`src-tauri/src/commands/mod.rs`] — deferred, pre-existing

## Change Log

- 2026-04-08: Story 3.4 implemented — auto-match logic in Rust, 5 new Rust tests, TS type and store updated, 2 new TS store tests.
