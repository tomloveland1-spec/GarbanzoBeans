ALTER TABLE envelopes ADD COLUMN is_savings INTEGER NOT NULL DEFAULT 0 CHECK (is_savings IN (0,1));

CREATE TABLE IF NOT EXISTS borrow_events (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  source_envelope_id INTEGER NOT NULL,
  target_envelope_id INTEGER NOT NULL,
  amount_cents       INTEGER NOT NULL CHECK (amount_cents > 0),
  created_at         TEXT    NOT NULL DEFAULT (datetime('now'))
);
