-- Migration 012: Add memo field to transactions
-- Allows users to attach a free-text note to any transaction.
-- NULL = no memo; TEXT = user-provided note.

ALTER TABLE transactions ADD COLUMN memo TEXT;
