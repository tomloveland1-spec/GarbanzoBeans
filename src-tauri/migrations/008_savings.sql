-- Migration 008: Savings reconciliation schema
-- Adds: savings_reconciliations table for the reconciliation-based balance metric
-- NOTE: is_savings column on envelopes already exists (migration 005) — do NOT add again
--
-- Sign convention (3-layer enforcement):
--   negative amount_cents = deposit to savings (money leaving checking → entering savings)
--   positive amount_cents = withdrawal from savings (money entering checking)
--   This convention is enforced in:
--     1. This comment (documentation layer)
--     2. Rust record_reconciliation command (assertion: entered_balance_cents >= 0)
--     3. TypeScript constant SAVINGS_DEPOSIT_SIGN = -1 (src/lib/types.ts)
--
-- entered_balance_cents: the user's actual savings account balance at reconciliation time
-- previous_tracked_balance_cents: the app's tracked balance before this reconciliation
-- delta_cents: entered_balance_cents - previous_tracked_balance_cents (can be negative)

CREATE TABLE IF NOT EXISTS savings_reconciliations (
  id                            INTEGER PRIMARY KEY AUTOINCREMENT,
  date                          TEXT    NOT NULL,  -- ISO 8601 date: "YYYY-MM-DD"
  entered_balance_cents         INTEGER NOT NULL CHECK (entered_balance_cents >= 0),
  previous_tracked_balance_cents INTEGER NOT NULL,
  delta_cents                   INTEGER NOT NULL,
  note                          TEXT              -- nullable: optional user annotation
);

-- Primary filter: fetching reconciliations in chronological order
CREATE INDEX IF NOT EXISTS idx_savings_reconciliations_date ON savings_reconciliations(date);
