-- Migration 002: Add budget identity + updated_at trigger
-- Adds: budget_name, start_month columns to settings
-- Fixes: updated_at trigger deferred from Story 1.3

ALTER TABLE settings ADD COLUMN budget_name TEXT;
ALTER TABLE settings ADD COLUMN start_month TEXT;  -- ISO YYYY-MM format e.g. '2026-04'

-- Fix deferred from Story 1.3: settings.updated_at was never refreshed on row update.
-- This trigger fires after any UPDATE on settings and sets updated_at to current UTC time.
CREATE TRIGGER IF NOT EXISTS settings_updated_at
AFTER UPDATE ON settings
WHEN NEW.updated_at IS OLD.updated_at
BEGIN
  UPDATE settings SET updated_at = datetime('now') WHERE id = NEW.id;
END;
