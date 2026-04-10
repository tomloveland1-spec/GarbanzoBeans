-- Migration 011: Month income timing — pay dates and expected amounts for a closing month
-- One row per pay date per closing month (month_id references the CURRENT closing month)
-- pay_date: ISO 'YYYY-MM-DD' in the NEW month (the one being opened after close)
-- amount_cents: expected income for this pay date (may be 0 if not configured)
-- UNIQUE(month_id, pay_date) prevents duplicate pay date rows per month
CREATE TABLE IF NOT EXISTS month_income_timing (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  month_id     INTEGER NOT NULL,
  pay_date     TEXT    NOT NULL,
  amount_cents INTEGER NOT NULL DEFAULT 0,
  label        TEXT,
  updated_at   TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE(month_id, pay_date)
);
