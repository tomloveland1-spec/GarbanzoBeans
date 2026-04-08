import { describe, it, expect } from 'vitest';
import { deriveEnvelopeState, getEnvelopeStateExplanation } from './envelopeState';
import type { EnvelopeType } from '@/lib/types';

describe('deriveEnvelopeState', () => {
  it('returns funded when allocatedCents > 0 and spentCents = 0', () => {
    expect(deriveEnvelopeState(5000, 0)).toBe('funded');
  });

  it('returns funded when spentCents < allocatedCents', () => {
    expect(deriveEnvelopeState(5000, 3000)).toBe('funded');
  });

  it('returns funded when spentCents === allocatedCents (equal is not overspent)', () => {
    expect(deriveEnvelopeState(5000, 5000)).toBe('funded');
  });

  it('returns caution when allocatedCents = 0', () => {
    expect(deriveEnvelopeState(0)).toBe('caution');
  });

  it('returns caution when allocatedCents = 0 and spentCents = 0', () => {
    expect(deriveEnvelopeState(0, 0)).toBe('caution');
  });

  it('returns overspent when spentCents > allocatedCents', () => {
    expect(deriveEnvelopeState(5000, 6000)).toBe('overspent');
  });

  it('returns overspent when allocatedCents = 0 and spentCents > 0', () => {
    expect(deriveEnvelopeState(0, 1)).toBe('overspent');
  });
});

describe('getEnvelopeStateExplanation', () => {
  const types: EnvelopeType[] = ['Rolling', 'Bill', 'Goal'];
  const states = ['funded', 'caution', 'overspent'] as const;

  it('returns distinct non-empty strings for all 9 type×state combinations', () => {
    const results = types.flatMap((type) =>
      states.map((state) => getEnvelopeStateExplanation(type, state))
    );
    // All 9 must be non-empty strings
    results.forEach((result) => {
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });
    // All 9 must be distinct
    expect(new Set(results).size).toBe(9);
  });

  it('Rolling/funded explanation mentions rolling budget', () => {
    const result = getEnvelopeStateExplanation('Rolling', 'funded');
    expect(result.toLowerCase()).toContain('rolling');
  });

  it('Bill/caution explanation mentions due date or bill', () => {
    const result = getEnvelopeStateExplanation('Bill', 'caution');
    expect(result.toLowerCase()).toMatch(/bill|due/);
  });

  it('Goal/funded explanation mentions goal', () => {
    const result = getEnvelopeStateExplanation('Goal', 'funded');
    expect(result.toLowerCase()).toContain('goal');
  });
});
