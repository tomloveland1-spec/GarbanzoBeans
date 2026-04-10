-- Migration 010: Bill due dates — one record per Bill envelope
-- due_day: day of month the bill is due (1–31)
-- One row per Bill envelope (UNIQUE envelope_id); upserted each Turn the Month step 2
CREATE TABLE IF NOT EXISTS bill_due_dates (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  envelope_id INTEGER NOT NULL UNIQUE,
  due_day     INTEGER NOT NULL CHECK (due_day BETWEEN 1 AND 31),
  updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);
