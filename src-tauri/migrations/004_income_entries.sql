-- Migration 004: Income entry definitions
-- Adds: income_entries table for named paychecks / income sources
-- Note: No month_key column for now — entries are reused each month as a starting point.
--       Epic 6 (Turn the Month) will add month-key scoping via a future migration.

CREATE TABLE IF NOT EXISTS income_entries (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  name         TEXT    NOT NULL CHECK (length(trim(name)) > 0),
  amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0)
);
