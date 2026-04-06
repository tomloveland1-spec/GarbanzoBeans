-- Migration 001: Initial Schema
-- Creates: settings (app configuration)
-- Note: schema_version table is bootstrapped by the migration runner itself.

CREATE TABLE IF NOT EXISTS settings (
  id                  INTEGER PRIMARY KEY CHECK (id = 1),
  pay_frequency       TEXT,
  pay_dates           TEXT,
  savings_target_pct  INTEGER NOT NULL DEFAULT 10 CHECK (savings_target_pct >= 0 AND savings_target_pct <= 100),
  data_folder_path    TEXT,
  onboarding_complete INTEGER NOT NULL DEFAULT 0 CHECK (onboarding_complete IN (0, 1)),
  created_at          TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at          TEXT    NOT NULL DEFAULT (datetime('now'))
);
