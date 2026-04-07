export type PayFrequency = 'weekly' | 'bi-weekly' | 'twice-monthly' | 'monthly';

/** Build the payDates JSON string for SQLite storage. */
export function buildPayDates(
  freq: PayFrequency,
  payDate1: string,
  payDate2: string,
): string {
  if (freq === 'twice-monthly') {
    return JSON.stringify([payDate1, payDate2]);
  }
  return JSON.stringify(payDate1);
}

/** Parse the stored payDates JSON string back into form fields. */
export function parsePayDates(
  payFrequency: string | null,
  payDatesJson: string | null,
): { payDate1: string; payDate2: string } {
  if (!payFrequency || !payDatesJson) return { payDate1: '', payDate2: '' };
  try {
    const parsed = JSON.parse(payDatesJson);
    if (payFrequency === 'twice-monthly' && Array.isArray(parsed)) {
      return { payDate1: String(parsed[0] ?? ''), payDate2: String(parsed[1] ?? '') };
    }
    return { payDate1: String(parsed), payDate2: '' };
  } catch {
    return { payDate1: '', payDate2: '' };
  }
}
