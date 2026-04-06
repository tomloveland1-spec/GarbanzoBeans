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
