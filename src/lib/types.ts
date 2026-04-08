// All Tauri commands reject with this shape. Import from here everywhere.
// Matches the Rust AppError struct in src-tauri/src/error.rs.
export interface AppError {
  code: string;
  message: string;
}

// Month lifecycle states. 'closing:N' where N is the current step number.
// Defined here so route guards and stores share the same type.
export type MonthStatus = 'open' | 'closed' | `closing:${number}`;

// Mirrors the SQLite `settings` table (single row, id = 1).
// null fields = not yet configured (pre-onboarding).
// Returned by the get_settings Tauri command.
export interface Settings {
  id: 1;
  budgetName: string | null;      // new in migration 002
  startMonth: string | null;      // new in migration 002 — ISO YYYY-MM e.g. "2026-04"
  payFrequency: string | null;
  payDates: string | null;        // JSON string e.g. '["1","15"]', parsed by Rust
  savingsTargetPct: number;       // whole percentage (10 = 10%), NOT cents
  dataFolderPath: string | null;
  onboardingComplete: boolean;    // Rust converts SQLite 0/1 to bool
  createdAt: string;              // ISO 8601 UTC
  updatedAt: string;              // ISO 8601 UTC
}

// Input type for upsert_settings Tauri command.
// All fields optional — only provided fields are meaningful during step-by-step onboarding.
export interface UpsertSettingsInput {
  budgetName?: string | null;
  startMonth?: string | null;
  payFrequency?: string | null;
  payDates?: string | null;
  savingsTargetPct?: number;
  dataFolderPath?: string | null;
  onboardingComplete?: boolean;
}

// Envelope domain types — mirrors Rust Envelope struct in commands/mod.rs
export type EnvelopeType = 'Rolling' | 'Bill' | 'Goal';
export type EnvelopePriority = 'Need' | 'Should' | 'Want';

export interface Envelope {
  id: number;
  name: string;
  type: EnvelopeType;
  priority: EnvelopePriority;
  allocatedCents: number;   // INTEGER cents — never display directly; use formatCurrency()
  monthId: number | null;
  createdAt: string;        // ISO 8601 UTC
  isSavings: boolean;
}

// Input for create_envelope Tauri command.
// envelopeType maps to envelope_type in Rust via serde rename_all camelCase.
export interface CreateEnvelopeInput {
  name: string;
  envelopeType: EnvelopeType;
  priority: EnvelopePriority;
  allocatedCents: number;
  monthId?: number | null;
  isSavings?: boolean;
}

// Input for update_envelope Tauri command. All fields except id are optional.
export interface UpdateEnvelopeInput {
  id: number;
  name?: string;
  envelopeType?: EnvelopeType;
  priority?: EnvelopePriority;
  allocatedCents?: number;
  monthId?: number | null;
  isSavings?: boolean;
}

// Income entry — mirrors the income_entries SQLite table row.
export interface IncomeEntry {
  id: number;
  name: string;
  amountCents: number;  // INTEGER cents — never display directly; use formatCurrency()
}

// Input for create_income_entry Tauri command.
export interface CreateIncomeEntryInput {
  name: string;
  amountCents: number;
}

// Input for allocate_envelopes Tauri command.
export interface AllocateEnvelopesInput {
  allocations: { id: number; allocatedCents: number }[];
}

// Input for borrow_from_envelope Tauri command.
export interface BorrowInput {
  sourceEnvelopeId: number;
  targetEnvelopeId: number;
  amountCents: number;
}

// Result from borrow_from_envelope Tauri command.
export interface BorrowResult {
  source: Envelope;
  target: Envelope;
}

// Transaction domain types — mirrors Rust Transaction struct in commands/mod.rs
export interface Transaction {
  id: number;
  payee: string;
  amountCents: number;         // INTEGER cents — never display directly; use formatCurrency()
  date: string;                // ISO 8601 "YYYY-MM-DD"
  envelopeId: number | null;   // null = uncategorized
  isCleared: boolean;
  importBatchId: string | null; // null = manually entered
  createdAt: string;           // ISO 8601 UTC
}

// Input for create_transaction Tauri command.
export interface CreateTransactionInput {
  payee: string;
  amountCents: number;
  date: string;               // "YYYY-MM-DD"
  envelopeId?: number | null;
  isCleared?: boolean;        // defaults to false
  importBatchId?: string | null;
}

// Result from import_ofx Tauri command.
export interface ImportResult {
  count: number;
  batchId: string;
  latestDate: string | null;
  transactions: Transaction[];
  matchedTransactions: Transaction[];
  /** Maps newly inserted transaction IDs (as strings) to the matched rule's payee_substring.
   *  Used to render `-> Groceries via Kroger rule` labels. Not stored in SQLite.
   *  Keys are string-coerced IDs because JSON object keys are always strings. */
  categorizedAnnotations: Record<string, string>;
  /** Newly inserted transaction IDs that matched no stored rule.
   *  Exposed for Story 4.3's unknown merchant queue. Not stored in SQLite. */
  uncategorizedIds: number[];
  /** Newly inserted transaction IDs that matched more than one stored rule (conflict).
   *  Exposed for Story 4.1's conflict messaging and Story 4.3's queue. Not stored in SQLite. */
  conflictedIds: number[];
}

// Input for update_transaction Tauri command. All fields except id are optional.
export interface UpdateTransactionInput {
  id: number;
  payee?: string;
  amountCents?: number;
  date?: string;
  envelopeId?: number | null;
  clearEnvelopeId?: boolean; // When true, sets envelopeId to null (un-categorizes the transaction)
  isCleared?: boolean;
}

// MerchantRule domain types — mirrors Rust MerchantRule struct in commands/mod.rs
export interface MerchantRule {
  id: number;
  payeeSubstring: string;
  envelopeId: number;            // NOT nullable — every rule must map to an envelope
  version: number;               // increments on every edit; future: stored on matched transactions
  createdAt: string;             // ISO 8601 UTC
  lastMatchedAt: string | null;  // null until first import match
  matchCount: number;            // increments when rule fires during import (Story 4.2)
}

// Input for create_merchant_rule Tauri command.
export interface CreateMerchantRuleInput {
  payeeSubstring: string;
  envelopeId: number;
}

// Input for update_merchant_rule Tauri command. All fields except id are optional.
export interface UpdateMerchantRuleInput {
  id: number;
  payeeSubstring?: string;
  envelopeId?: number;
}
