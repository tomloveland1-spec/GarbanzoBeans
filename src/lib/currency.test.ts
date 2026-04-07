import { describe, it, expect } from 'vitest';
import { formatCurrency } from './currency';

describe('formatCurrency', () => {
  it('formats 0 cents as $0.00', () => {
    expect(formatCurrency(0)).toBe('$0.00');
  });

  it('formats 100 cents as $1.00', () => {
    expect(formatCurrency(100)).toBe('$1.00');
  });

  it('formats 12345 cents as $123.45', () => {
    expect(formatCurrency(12345)).toBe('$123.45');
  });

  it('formats -500 cents as -$5.00', () => {
    expect(formatCurrency(-500)).toBe('-$5.00');
  });
});
