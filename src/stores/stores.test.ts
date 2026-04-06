import { vi, describe, it, expect } from 'vitest';

// Mock Tauri invoke so stores that import it don't fail
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

import { useSettingsStore } from './useSettingsStore';
import { useEnvelopeStore } from './useEnvelopeStore';
import { useTransactionStore } from './useTransactionStore';
import { useSavingsStore } from './useSavingsStore';
import { useMerchantRuleStore } from './useMerchantRuleStore';
import { useMonthStore } from './useMonthStore';

describe('All six stores — initial isWriting: false', () => {
  it('useSettingsStore initializes with isWriting: false', () => {
    expect(useSettingsStore.getState().isWriting).toBe(false);
  });

  it('useEnvelopeStore initializes with isWriting: false', () => {
    expect(useEnvelopeStore.getState().isWriting).toBe(false);
  });

  it('useTransactionStore initializes with isWriting: false', () => {
    expect(useTransactionStore.getState().isWriting).toBe(false);
  });

  it('useSavingsStore initializes with isWriting: false', () => {
    expect(useSavingsStore.getState().isWriting).toBe(false);
  });

  it('useMerchantRuleStore initializes with isWriting: false', () => {
    expect(useMerchantRuleStore.getState().isWriting).toBe(false);
  });

  it('useMonthStore initializes with isWriting: false', () => {
    expect(useMonthStore.getState().isWriting).toBe(false);
  });
});
