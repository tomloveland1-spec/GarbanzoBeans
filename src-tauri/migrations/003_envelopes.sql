-- Migration 003: Envelope definitions
-- Adds: envelopes table for all typed envelope budget categories
-- Note: month_id references months(id) which will be created in Epic 6.
--       SQLite FK constraints are not enforced by default; full FK wiring happens in Epic 6.

CREATE TABLE IF NOT EXISTS envelopes (
  id              INTEGER PRIMARY KEY,
  name            TEXT    NOT NULL CHECK (length(trim(name)) > 0),
  type            TEXT    NOT NULL CHECK (type IN ('Rolling', 'Bill', 'Goal')),
  priority        TEXT    NOT NULL CHECK (priority IN ('Need', 'Should', 'Want')),
  allocated_cents INTEGER NOT NULL DEFAULT 0 CHECK (allocated_cents >= 0),
  month_id        INTEGER,           -- FK to months(id), enforced in Epic 6
  created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_envelopes_month_id ON envelopes(month_id);
