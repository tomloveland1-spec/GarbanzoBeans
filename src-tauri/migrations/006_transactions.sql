-- Migration 006: Transaction ledger
-- Adds: transactions table for all imported and manually entered transactions
-- Note: envelope_id references envelopes(id); FK not enforced (SQLite default + Epic 6 scope)
-- Sign convention: amount_cents is the transaction amount as signed cents.
-- For savings transactions: negative = deposit to savings (outflow from checking)

CREATE TABLE IF NOT EXISTS transactions (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  payee            TEXT    NOT NULL DEFAULT '',
  amount_cents     INTEGER NOT NULL,
  date             TEXT    NOT NULL,  -- ISO 8601 date: "YYYY-MM-DD"
  envelope_id      INTEGER,           -- FK to envelopes(id), nullable (uncategorized)
  is_cleared       INTEGER NOT NULL DEFAULT 0 CHECK (is_cleared IN (0, 1)),
  import_batch_id  TEXT,              -- NULL for manually entered; OFX batch ID for imports
  created_at       TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- Primary filter: fetching transactions for a given month (date range query)
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);

-- Secondary filter: deriving envelope balance (sum amount_cents WHERE envelope_id = ?)
CREATE INDEX IF NOT EXISTS idx_transactions_envelope_id ON transactions(envelope_id);
