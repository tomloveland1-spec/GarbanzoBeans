-- Migration 007: Merchant rule engine
-- Adds: merchant_rules table for payee-substring → envelope categorization rules
-- version increments on every edit; future stories will store matched rule version on transactions
-- match_count and last_matched_at updated by import command when rule fires (Story 4.2)

CREATE TABLE IF NOT EXISTS merchant_rules (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  payee_substring  TEXT    NOT NULL,
  envelope_id      INTEGER NOT NULL,  -- FK to envelopes(id); not enforced (consistent with transactions)
  version          INTEGER NOT NULL DEFAULT 1,
  created_at       TEXT    NOT NULL DEFAULT (datetime('now')),
  last_matched_at  TEXT,              -- NULL until first match; updated by import_ofx in Story 4.2
  match_count      INTEGER NOT NULL DEFAULT 0
);

-- Primary sort for rules screen (Story 4.6): most-used rules at top
CREATE INDEX IF NOT EXISTS idx_merchant_rules_match_count ON merchant_rules(match_count DESC);

-- Secondary sort: most recently active rules
CREATE INDEX IF NOT EXISTS idx_merchant_rules_last_matched_at ON merchant_rules(last_matched_at);
