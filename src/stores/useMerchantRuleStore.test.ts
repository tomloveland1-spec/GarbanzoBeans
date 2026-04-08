import { vi, describe, it, expect, beforeEach } from 'vitest';
import { useMerchantRuleStore } from './useMerchantRuleStore';
import type { MerchantRule } from '@/lib/types';

// Mock Tauri invoke so tests don't require a running Tauri backend
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

import { invoke } from '@tauri-apps/api/core';
const mockInvoke = vi.mocked(invoke);

const makeRule = (overrides: Partial<MerchantRule> = {}): MerchantRule => ({
  id: 1,
  payeeSubstring: 'Kroger',
  envelopeId: 10,
  version: 1,
  createdAt: '2026-01-01T00:00:00Z',
  lastMatchedAt: null,
  matchCount: 0,
  ...overrides,
});

describe('useMerchantRuleStore', () => {
  beforeEach(() => {
    useMerchantRuleStore.setState({ rules: [], isWriting: false, error: null });
    vi.clearAllMocks();
  });

  it('initial state has rules: [], isWriting: false, error: null', () => {
    expect(useMerchantRuleStore.getState().rules).toEqual([]);
    expect(useMerchantRuleStore.getState().isWriting).toBe(false);
    expect(useMerchantRuleStore.getState().error).toBeNull();
  });

  describe('loadRules', () => {
    it('sets isWriting: true during call, false after, populates rules', async () => {
      const mockRules = [makeRule()];
      let resolveInvoke!: (value: MerchantRule[]) => void;
      mockInvoke.mockReturnValue(
        new Promise<MerchantRule[]>((res) => {
          resolveInvoke = res;
        }),
      );

      const loadPromise = useMerchantRuleStore.getState().loadRules();
      expect(useMerchantRuleStore.getState().isWriting).toBe(true);

      resolveInvoke(mockRules);
      await loadPromise;

      expect(useMerchantRuleStore.getState().isWriting).toBe(false);
      expect(useMerchantRuleStore.getState().rules).toEqual(mockRules);
    });

    it('sets error and clears isWriting on failure', async () => {
      mockInvoke.mockRejectedValue({ code: 'DB_ERROR', message: 'failed' });

      await useMerchantRuleStore.getState().loadRules();

      expect(useMerchantRuleStore.getState().isWriting).toBe(false);
      expect(useMerchantRuleStore.getState().error).toEqual({ code: 'DB_ERROR', message: 'failed' });
    });
  });

  describe('createRule', () => {
    it('adds rule on success (optimistic → confirmed)', async () => {
      const created = makeRule({ id: 42, payeeSubstring: 'Amazon' });
      mockInvoke.mockResolvedValue(created);

      await useMerchantRuleStore.getState().createRule({ payeeSubstring: 'Amazon', envelopeId: 10 });

      const { rules, isWriting, error } = useMerchantRuleStore.getState();
      expect(rules).toHaveLength(1);
      expect(rules[0]).toEqual(created);
      expect(isWriting).toBe(false);
      expect(error).toBeNull();
    });

    it('removes optimistic entry and sets error on failure', async () => {
      mockInvoke.mockRejectedValue({ code: 'DB_ERROR', message: 'insert failed' });

      await useMerchantRuleStore.getState().createRule({ payeeSubstring: 'Oops', envelopeId: 10 });

      const { rules, isWriting, error } = useMerchantRuleStore.getState();
      expect(rules).toHaveLength(0);
      expect(isWriting).toBe(false);
      expect(error).toEqual({ code: 'DB_ERROR', message: 'insert failed' });
    });

    it('optimistic temp id is unique per call (no id collision)', async () => {
      const first = makeRule({ id: 10, payeeSubstring: 'First' });
      const second = makeRule({ id: 11, payeeSubstring: 'Second' });

      mockInvoke
        .mockResolvedValueOnce(first)
        .mockResolvedValueOnce(second);

      await useMerchantRuleStore.getState().createRule({ payeeSubstring: 'First', envelopeId: 10 });
      await useMerchantRuleStore.getState().createRule({ payeeSubstring: 'Second', envelopeId: 10 });

      const { rules } = useMerchantRuleStore.getState();
      expect(rules).toHaveLength(2);
      expect(rules.map((r) => r.id)).toEqual([10, 11]);
    });
  });

  describe('updateRule', () => {
    it('modifies rule on success', async () => {
      const original = makeRule({ id: 1, payeeSubstring: 'Kroger' });
      useMerchantRuleStore.setState({ rules: [original] });

      const updated = makeRule({ id: 1, payeeSubstring: 'KROGER', version: 2 });
      mockInvoke.mockResolvedValue(updated);

      await useMerchantRuleStore.getState().updateRule({ id: 1, payeeSubstring: 'KROGER' });

      const { rules, isWriting, error } = useMerchantRuleStore.getState();
      expect(rules[0]).toEqual(updated);
      expect(isWriting).toBe(false);
      expect(error).toBeNull();
    });

    it('rolls back to original and sets error on failure', async () => {
      const original = makeRule({ id: 1, payeeSubstring: 'Kroger' });
      useMerchantRuleStore.setState({ rules: [original] });

      mockInvoke.mockRejectedValue({ code: 'RULE_NOT_FOUND', message: 'not found' });

      await useMerchantRuleStore.getState().updateRule({ id: 1, payeeSubstring: 'Ghost' });

      const { rules, isWriting, error } = useMerchantRuleStore.getState();
      expect(rules[0]).toEqual(original);
      expect(isWriting).toBe(false);
      expect(error).toEqual({ code: 'RULE_NOT_FOUND', message: 'not found' });
    });
  });

  describe('deleteRule', () => {
    it('removes rule from list on success', async () => {
      const r1 = makeRule({ id: 1, payeeSubstring: 'Kroger' });
      const r2 = makeRule({ id: 2, payeeSubstring: 'Amazon' });
      useMerchantRuleStore.setState({ rules: [r1, r2] });

      mockInvoke.mockResolvedValue(undefined);

      await useMerchantRuleStore.getState().deleteRule(1);

      const { rules, isWriting, error } = useMerchantRuleStore.getState();
      expect(rules).toHaveLength(1);
      expect(rules[0].id).toBe(2);
      expect(isWriting).toBe(false);
      expect(error).toBeNull();
    });

    it('restores list and sets error on failure', async () => {
      const r1 = makeRule({ id: 1 });
      useMerchantRuleStore.setState({ rules: [r1] });

      mockInvoke.mockRejectedValue({ code: 'RULE_NOT_FOUND', message: 'not found' });

      await useMerchantRuleStore.getState().deleteRule(1);

      const { rules, isWriting, error } = useMerchantRuleStore.getState();
      expect(rules).toHaveLength(1);
      expect(rules[0]).toEqual(r1);
      expect(isWriting).toBe(false);
      expect(error).toEqual({ code: 'RULE_NOT_FOUND', message: 'not found' });
    });
  });

  describe('conflictingRules', () => {
    it('returns empty array when no rules conflict', () => {
      useMerchantRuleStore.setState({
        rules: [
          makeRule({ id: 1, payeeSubstring: 'Kroger' }),
          makeRule({ id: 2, payeeSubstring: 'Amazon' }),
        ],
      });
      const conflicts = useMerchantRuleStore.getState().conflictingRules();
      expect(conflicts).toHaveLength(0);
    });

    it('detects conflict when one payeeSubstring contains another (case-insensitive)', () => {
      useMerchantRuleStore.setState({
        rules: [
          makeRule({ id: 1, payeeSubstring: 'Kroger' }),
          makeRule({ id: 2, payeeSubstring: 'KROGER #1234' }),
        ],
      });
      const conflicts = useMerchantRuleStore.getState().conflictingRules();
      expect(conflicts).toHaveLength(1);
      const ids = conflicts[0].map((r) => r.id);
      expect(ids).toContain(1);
      expect(ids).toContain(2);
    });

    it('detects conflict when shorter string is substring of longer (reversed order)', () => {
      useMerchantRuleStore.setState({
        rules: [
          makeRule({ id: 1, payeeSubstring: 'walmart supercenter' }),
          makeRule({ id: 2, payeeSubstring: 'walmart' }),
        ],
      });
      const conflicts = useMerchantRuleStore.getState().conflictingRules();
      expect(conflicts).toHaveLength(1);
    });

    it('returns no conflict for non-overlapping substrings', () => {
      useMerchantRuleStore.setState({
        rules: [
          makeRule({ id: 1, payeeSubstring: 'Whole Foods' }),
          makeRule({ id: 2, payeeSubstring: 'Target' }),
          makeRule({ id: 3, payeeSubstring: 'Netflix' }),
        ],
      });
      const conflicts = useMerchantRuleStore.getState().conflictingRules();
      expect(conflicts).toHaveLength(0);
    });
  });
});
