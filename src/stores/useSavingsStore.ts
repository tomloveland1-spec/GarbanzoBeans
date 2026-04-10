import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import type { SavingsReconciliation, Transaction, SavingsFlowMonth } from '@/lib/types';
import { deriveRunway } from '@/lib/deriveRunway';

interface SavingsState {
  reconciliations: SavingsReconciliation[];
  savingsTransactions: Transaction[];
  avgMonthlyEssentialSpendCents: number;
  monthlyFlow: SavingsFlowMonth[];
  isWriting: boolean;
  error: string | null;

  // Actions
  loadReconciliations: () => Promise<void>;
  loadSavingsTransactionsSince: (sinceDate: string) => Promise<void>;
  loadAvgMonthlyEssentialSpend: () => Promise<void>;
  loadMonthlyFlow: () => Promise<void>;
  recordReconciliation: (enteredBalanceCents: number, note?: string) => Promise<void>;

  // Derived getters
  currentTrackedBalance: () => number;
  runway: () => number;
  runwayDelta: () => number | null;
}

export const useSavingsStore = create<SavingsState>((set, get) => ({
  reconciliations: [],
  savingsTransactions: [],
  avgMonthlyEssentialSpendCents: 0,
  monthlyFlow: [],
  isWriting: false,
  error: null,

  loadReconciliations: async () => {
    try {
      const reconciliations = await invoke<SavingsReconciliation[]>('get_savings_reconciliations');
      set({ reconciliations });
      if (reconciliations.length > 0) {
        await get().loadSavingsTransactionsSince(reconciliations[reconciliations.length - 1]!.date);
      }
      await get().loadMonthlyFlow();
    } catch (err) {
      const e = err as { message?: string };
      set({ error: e.message ?? 'Failed to load reconciliations' });
    }
  },

  loadSavingsTransactionsSince: async (sinceDate: string) => {
    try {
      const txs = await invoke<Transaction[]>('get_savings_transactions_since', { sinceDate });
      set({ savingsTransactions: txs });
    } catch (err) {
      const e = err as { message?: string };
      set({ error: e.message ?? 'Failed to load savings transactions' });
    }
  },

  loadAvgMonthlyEssentialSpend: async () => {
    try {
      const avg = await invoke<number>('get_avg_monthly_essential_spend_cents');
      set({ avgMonthlyEssentialSpendCents: avg });
    } catch (err) {
      const e = err as { message?: string };
      set({ error: e.message ?? 'Failed to load avg monthly essential spend' });
    }
  },

  loadMonthlyFlow: async () => {
    try {
      const monthlyFlow = await invoke<SavingsFlowMonth[]>('get_savings_flow_by_month');
      set({ monthlyFlow });
    } catch (err) {
      const e = err as { message?: string };
      set({ error: e.message ?? 'Failed to load monthly savings flow' });
    }
  },

  recordReconciliation: async (enteredBalanceCents, note) => {
    set({ isWriting: true, error: null });
    try {
      const rec = await invoke<SavingsReconciliation>('record_reconciliation', {
        enteredBalanceCents,
        note: note ?? null,
      });
      set((state) => ({
        reconciliations: [...state.reconciliations, rec],
        savingsTransactions: [],
        isWriting: false,
      }));
      await get().loadSavingsTransactionsSince(rec.date);
      await get().loadMonthlyFlow();
    } catch (err) {
      const e = err as { message?: string };
      set({ error: e.message ?? 'Failed to record reconciliation', isWriting: false });
    }
  },

  currentTrackedBalance: () => {
    const { reconciliations, savingsTransactions } = get();
    if (reconciliations.length === 0) return 0;
    const last = reconciliations[reconciliations.length - 1]!;
    const txDelta = savingsTransactions.reduce((sum, tx) => sum + (-tx.amountCents), 0);
    return last.enteredBalanceCents + txDelta;
  },

  runway: () => {
    return deriveRunway(get().currentTrackedBalance(), get().avgMonthlyEssentialSpendCents);
  },

  runwayDelta: () => {
    const { reconciliations, avgMonthlyEssentialSpendCents } = get();
    if (reconciliations.length < 2) return null;
    const prev = reconciliations[reconciliations.length - 2]!;
    const currentRunway = get().runway();
    const prevRunway = deriveRunway(prev.enteredBalanceCents, avgMonthlyEssentialSpendCents);
    return currentRunway - prevRunway;
  },
}));
