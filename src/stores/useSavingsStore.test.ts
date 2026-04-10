import { vi, describe, it, expect, beforeEach } from 'vitest';
import { useSavingsStore } from './useSavingsStore';
import type { SavingsReconciliation, Transaction, SavingsFlowMonth } from '@/lib/types';

// Mock Tauri invoke so tests don't require a running Tauri backend
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

import { invoke } from '@tauri-apps/api/core';
const mockInvoke = vi.mocked(invoke);

const makeReconciliation = (overrides: Partial<SavingsReconciliation> = {}): SavingsReconciliation => ({
  id: 1,
  date: '2026-04-08',
  enteredBalanceCents: 500_000,
  previousTrackedBalanceCents: 0,
  deltaCents: 500_000,
  note: null,
  ...overrides,
});

const makeTransaction = (overrides: Partial<Transaction> = {}): Transaction => ({
  id: 1,
  payee: 'Deposit',
  amountCents: -30_000,
  date: '2026-04-09',
  envelopeId: 1,
  isCleared: false,
  importBatchId: null,
  createdAt: '2026-04-09T00:00:00Z',
  ...overrides,
});

describe('useSavingsStore', () => {
  beforeEach(() => {
    useSavingsStore.setState({ reconciliations: [], savingsTransactions: [], avgMonthlyEssentialSpendCents: 0, monthlyFlow: [], isWriting: false, error: null });
    vi.clearAllMocks();
  });

  it('initial state has reconciliations: [], savingsTransactions: [], isWriting: false, error: null', () => {
    expect(useSavingsStore.getState().reconciliations).toEqual([]);
    expect(useSavingsStore.getState().savingsTransactions).toEqual([]);
    expect(useSavingsStore.getState().isWriting).toBe(false);
    expect(useSavingsStore.getState().error).toBeNull();
  });

  describe('loadReconciliations', () => {
    it('populates reconciliations on success', async () => {
      const recs = [makeReconciliation()];
      mockInvoke.mockResolvedValueOnce(recs);
      mockInvoke.mockResolvedValueOnce([]); // loadSavingsTransactionsSince

      await useSavingsStore.getState().loadReconciliations();

      expect(useSavingsStore.getState().reconciliations).toEqual(recs);
      expect(useSavingsStore.getState().error).toBeNull();
    });

    it('sets error message on failure', async () => {
      mockInvoke.mockRejectedValueOnce({ code: 'DB_ERROR', message: 'load failed' });

      await useSavingsStore.getState().loadReconciliations();

      expect(useSavingsStore.getState().reconciliations).toEqual([]);
      expect(useSavingsStore.getState().error).toBe('load failed');
    });
  });

  describe('recordReconciliation', () => {
    it('appends new reconciliation on success and clears isWriting', async () => {
      const rec = makeReconciliation({ id: 2, enteredBalanceCents: 300_000 });
      mockInvoke.mockResolvedValueOnce(rec);
      mockInvoke.mockResolvedValueOnce([]); // loadSavingsTransactionsSince

      await useSavingsStore.getState().recordReconciliation(300_000);

      const { reconciliations, isWriting, error } = useSavingsStore.getState();
      expect(reconciliations).toHaveLength(1);
      expect(reconciliations[0]).toEqual(rec);
      expect(isWriting).toBe(false);
      expect(error).toBeNull();
    });

    it('sets isWriting: true during call, false after', async () => {
      let resolveInvoke!: (value: SavingsReconciliation) => void;
      mockInvoke.mockReturnValueOnce(
        new Promise<SavingsReconciliation>((res) => {
          resolveInvoke = res;
        }),
      );
      mockInvoke.mockResolvedValue([]); // loadSavingsTransactionsSince

      const writePromise = useSavingsStore.getState().recordReconciliation(100_000);
      expect(useSavingsStore.getState().isWriting).toBe(true);

      resolveInvoke(makeReconciliation());
      await writePromise;

      expect(useSavingsStore.getState().isWriting).toBe(false);
    });

    it('sets error and clears isWriting on failure', async () => {
      mockInvoke.mockRejectedValueOnce({ code: 'INVALID_ENTERED_BALANCE', message: 'must be >= 0' });

      await useSavingsStore.getState().recordReconciliation(-1);

      const { isWriting, error, reconciliations } = useSavingsStore.getState();
      expect(isWriting).toBe(false);
      expect(error).toBe('must be >= 0');
      expect(reconciliations).toHaveLength(0);
    });

    it('does not modify existing reconciliations on failure', async () => {
      const existing = makeReconciliation({ id: 1, enteredBalanceCents: 100_000 });
      useSavingsStore.setState({ reconciliations: [existing] });

      mockInvoke.mockRejectedValueOnce({ code: 'DB_ERROR', message: 'write failed' });

      await useSavingsStore.getState().recordReconciliation(200_000);

      expect(useSavingsStore.getState().reconciliations).toHaveLength(1);
      expect(useSavingsStore.getState().reconciliations[0]).toEqual(existing);
    });
  });

  describe('loadSavingsTransactionsSince', () => {
    it('sets savingsTransactions on success', async () => {
      const txs = [makeTransaction()];
      mockInvoke.mockResolvedValueOnce(txs);

      await useSavingsStore.getState().loadSavingsTransactionsSince('2026-04-08');

      expect(useSavingsStore.getState().savingsTransactions).toEqual(txs);
      expect(useSavingsStore.getState().error).toBeNull();
    });

    it('sets error on failure', async () => {
      mockInvoke.mockRejectedValueOnce({ code: 'DB_ERROR', message: 'tx load failed' });

      await useSavingsStore.getState().loadSavingsTransactionsSince('2026-04-08');

      expect(useSavingsStore.getState().savingsTransactions).toEqual([]);
      expect(useSavingsStore.getState().error).toBe('tx load failed');
    });
  });

  describe('currentTrackedBalance', () => {
    it('returns 0 when reconciliation history is empty', () => {
      expect(useSavingsStore.getState().currentTrackedBalance()).toBe(0);
    });

    it('returns entered balance of most recent reconciliation when no savings transactions', () => {
      useSavingsStore.setState({
        reconciliations: [
          makeReconciliation({ id: 1, enteredBalanceCents: 100_000 }),
          makeReconciliation({ id: 2, enteredBalanceCents: 250_000 }),
        ],
        savingsTransactions: [],
      });
      expect(useSavingsStore.getState().currentTrackedBalance()).toBe(250_000);
    });

    it('currentTrackedBalance returns entered balance when no savings transactions', () => {
      useSavingsStore.setState({
        reconciliations: [makeReconciliation({ enteredBalanceCents: 500_000 })],
        savingsTransactions: [],
      });
      expect(useSavingsStore.getState().currentTrackedBalance()).toBe(500_000);
    });

    it('currentTrackedBalance adds deposit (negative amountCents) to balance', () => {
      useSavingsStore.setState({
        reconciliations: [makeReconciliation({ enteredBalanceCents: 500_000 })],
        savingsTransactions: [makeTransaction({ amountCents: -30_000 })],
      });
      // txDelta = -(-30_000) = +30_000 → 500_000 + 30_000 = 530_000
      expect(useSavingsStore.getState().currentTrackedBalance()).toBe(530_000);
    });

    it('currentTrackedBalance subtracts withdrawal (positive amountCents) from balance', () => {
      useSavingsStore.setState({
        reconciliations: [makeReconciliation({ enteredBalanceCents: 500_000 })],
        savingsTransactions: [makeTransaction({ amountCents: 20_000 })],
      });
      // txDelta = -(+20_000) = -20_000 → 500_000 - 20_000 = 480_000
      expect(useSavingsStore.getState().currentTrackedBalance()).toBe(480_000);
    });

    it('reflects newly appended reconciliation after recordReconciliation', async () => {
      const rec = makeReconciliation({ id: 5, enteredBalanceCents: 800_000 });
      mockInvoke.mockResolvedValueOnce(rec);
      mockInvoke.mockResolvedValueOnce([]); // loadSavingsTransactionsSince

      await useSavingsStore.getState().recordReconciliation(800_000);

      expect(useSavingsStore.getState().currentTrackedBalance()).toBe(800_000);
    });
  });

  describe('runway', () => {
    it('returns 0 when there are no reconciliations (avgSpend is 0)', () => {
      expect(useSavingsStore.getState().runway()).toBe(0);
    });

    it('returns 0 when avgMonthlyEssentialSpendCents is 0', () => {
      useSavingsStore.setState({
        reconciliations: [makeReconciliation({ enteredBalanceCents: 600_000 })],
        savingsTransactions: [],
        avgMonthlyEssentialSpendCents: 0,
      });
      expect(useSavingsStore.getState().runway()).toBe(0);
    });

    it('returns computed runway when avgMonthlyEssentialSpendCents is set', () => {
      useSavingsStore.setState({
        reconciliations: [makeReconciliation({ enteredBalanceCents: 600_000 })],
        savingsTransactions: [],
        avgMonthlyEssentialSpendCents: 200_000,
      });
      // 600_000 / 200_000 = 3
      expect(useSavingsStore.getState().runway()).toBe(3);
    });
  });

  describe('loadAvgMonthlyEssentialSpend', () => {
    it('sets avgMonthlyEssentialSpendCents on success', async () => {
      mockInvoke.mockResolvedValueOnce(150_000);

      await useSavingsStore.getState().loadAvgMonthlyEssentialSpend();

      expect(useSavingsStore.getState().avgMonthlyEssentialSpendCents).toBe(150_000);
      expect(useSavingsStore.getState().error).toBeNull();
    });

    it('sets error on failure', async () => {
      mockInvoke.mockRejectedValueOnce({ code: 'DB_ERROR', message: 'spend load failed' });

      await useSavingsStore.getState().loadAvgMonthlyEssentialSpend();

      expect(useSavingsStore.getState().error).toBe('spend load failed');
      expect(useSavingsStore.getState().avgMonthlyEssentialSpendCents).toBe(0);
    });
  });

  describe('loadMonthlyFlow', () => {
    it('loadMonthlyFlow populates monthlyFlow from invoke', async () => {
      const flow: SavingsFlowMonth[] = [{ month: '2026-04', netFlowCents: 500 }];
      mockInvoke.mockResolvedValueOnce(flow);

      await useSavingsStore.getState().loadMonthlyFlow();

      expect(useSavingsStore.getState().monthlyFlow).toEqual(flow);
      expect(useSavingsStore.getState().error).toBeNull();
    });

    it('loadMonthlyFlow sets error on failure', async () => {
      mockInvoke.mockRejectedValueOnce({ code: 'DB_ERROR', message: 'flow load failed' });

      await useSavingsStore.getState().loadMonthlyFlow();

      expect(useSavingsStore.getState().error).toBe('flow load failed');
      expect(useSavingsStore.getState().monthlyFlow).toEqual([]);
    });
  });

  describe('runwayDelta', () => {
    it('returns null when fewer than 2 reconciliations', () => {
      expect(useSavingsStore.getState().runwayDelta()).toBeNull();

      useSavingsStore.setState({
        reconciliations: [makeReconciliation({ enteredBalanceCents: 600_000 })],
        savingsTransactions: [],
        avgMonthlyEssentialSpendCents: 200_000,
      });
      expect(useSavingsStore.getState().runwayDelta()).toBeNull();
    });

    it('returns 0 when runway unchanged from previous reconciliation', () => {
      useSavingsStore.setState({
        reconciliations: [
          makeReconciliation({ id: 1, enteredBalanceCents: 600_000 }),
          makeReconciliation({ id: 2, enteredBalanceCents: 600_000 }),
        ],
        savingsTransactions: [],
        avgMonthlyEssentialSpendCents: 200_000,
      });
      // current runway: floor(600_000/200_000) = 3, prev runway: floor(600_000/200_000) = 3 → delta 0
      expect(useSavingsStore.getState().runwayDelta()).toBe(0);
    });

    it('returns positive delta when runway improved', () => {
      useSavingsStore.setState({
        reconciliations: [
          makeReconciliation({ id: 1, enteredBalanceCents: 400_000 }),
          makeReconciliation({ id: 2, enteredBalanceCents: 600_000 }),
        ],
        savingsTransactions: [],
        avgMonthlyEssentialSpendCents: 200_000,
      });
      // current runway: floor(600_000/200_000) = 3, prev: floor(400_000/200_000) = 2 → delta +1
      expect(useSavingsStore.getState().runwayDelta()).toBe(1);
    });

    it('returns negative delta when runway decreased', () => {
      useSavingsStore.setState({
        reconciliations: [
          makeReconciliation({ id: 1, enteredBalanceCents: 600_000 }),
          makeReconciliation({ id: 2, enteredBalanceCents: 400_000 }),
        ],
        savingsTransactions: [],
        avgMonthlyEssentialSpendCents: 200_000,
      });
      // current runway: floor(400_000/200_000) = 2, prev: floor(600_000/200_000) = 3 → delta -1
      expect(useSavingsStore.getState().runwayDelta()).toBe(-1);
    });
  });
});
