import { describe, it, expect } from 'vitest';
import { deriveRunway } from './deriveRunway';

describe('deriveRunway', () => {
  it('returns 0 when savings balance is zero', () => {
    expect(deriveRunway(0, 200_000)).toBe(0);
  });

  it('returns 0 when savings balance is negative', () => {
    expect(deriveRunway(-100_000, 200_000)).toBe(0);
  });

  it('returns 0 when avg monthly spend is zero', () => {
    expect(deriveRunway(600_000, 0)).toBe(0);
  });

  it('returns 0 when avg monthly spend is negative', () => {
    expect(deriveRunway(600_000, -50_000)).toBe(0);
  });

  it('computes correct runway for normal case', () => {
    // $6,000 savings / $2,000/month spend = 3 months
    expect(deriveRunway(600_000, 200_000)).toBe(3);
  });

  it('truncates to whole months (floor)', () => {
    // $7,000 savings / $2,000/month = 3.5 → 3
    expect(deriveRunway(700_000, 200_000)).toBe(3);
  });

  it('returns 0 when both inputs are zero', () => {
    expect(deriveRunway(0, 0)).toBe(0);
  });

  it('returns correct runway when balance exactly covers whole months', () => {
    // $10,000 / $1,000 = exactly 10 months
    expect(deriveRunway(1_000_000, 100_000)).toBe(10);
  });
});
