/** Generate the past 12 months as YYYY-MM strings, newest first. */
export function pastTwelveMonths(): string[] {
  const months: string[] = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const yyyy = d.getFullYear().toString();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    months.push(`${yyyy}-${mm}`);
  }
  return months;
}

/**
 * Format an ISO YYYY-MM string as a human-readable month label.
 * e.g. "2026-04" → "April 2026"
 *
 * Uses local-time Date constructor to avoid UTC-offset timezone shift.
 */
export function formatMonthLabel(isoMonth: string): string {
  const [yyyy, mm] = isoMonth.split('-').map(Number) as [number, number];
  return new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'long' }).format(
    new Date(yyyy, mm - 1, 1),
  );
}
