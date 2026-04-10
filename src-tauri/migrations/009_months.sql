-- Migration 009: Month lifecycle schema
-- Supports ADR-4: explicit state machine with crash recovery
-- Status values: 'open' | 'closed' | 'closing:step-N' (N >= 1)
-- UNIQUE(year, month) prevents duplicate month records

CREATE TABLE IF NOT EXISTS months (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  year       INTEGER NOT NULL,
  month      INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
  status     TEXT    NOT NULL DEFAULT 'open'
                     CHECK (status = 'open' OR status = 'closed' OR status LIKE 'closing:step-%'),
  opened_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  closed_at  TEXT,
  UNIQUE(year, month)
);

-- Primary filter: finding current open/closing month quickly
CREATE INDEX IF NOT EXISTS idx_months_status ON months(status);
