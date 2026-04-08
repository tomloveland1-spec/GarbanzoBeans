import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import type { AppError, Transaction, CreateTransactionInput, UpdateTransactionInput, ImportResult } from '@/lib/types';

interface TransactionState {
  transactions: Transaction[];
  isWriting: boolean;
  error: AppError | null;
  importResult: ImportResult | null;
  importError: string | null;

  // Computed views — derived from transactions, not separately stored
  clearedTransactions: () => Transaction[];
  unclearedTransactions: () => Transaction[];

  // Actions
  loadTransactions: (monthKey?: string) => Promise<void>;
  createTransaction: (input: CreateTransactionInput) => Promise<void>;
  updateTransaction: (input: UpdateTransactionInput) => Promise<void>;
  importOFX: (path: string) => Promise<void>;
  clearImportResult: () => void;
}

// Module-level counter for unique optimistic temp IDs
let _tempIdCounter = 0;

export const useTransactionStore = create<TransactionState>((set, get) => ({
  transactions: [],
  isWriting: false,
  error: null,
  importResult: null,
  importError: null,

  clearedTransactions: () => get().transactions.filter(t => t.isCleared),
  unclearedTransactions: () => get().transactions.filter(t => !t.isCleared),

  loadTransactions: async (monthKey?: string) => {
    set({ error: null });
    try {
      const transactions = await invoke<Transaction[]>('get_transactions', { monthKey });
      set({ transactions });
    } catch (err) {
      set({ error: err as AppError });
    }
  },

  createTransaction: async (input) => {
    const tempId = --_tempIdCounter;
    const tempTx: Transaction = {
      id: tempId,
      payee: input.payee,
      amountCents: input.amountCents,
      date: input.date,
      envelopeId: input.envelopeId ?? null,
      isCleared: input.isCleared ?? false,
      importBatchId: input.importBatchId ?? null,
      createdAt: new Date().toISOString(),
    };
    const prev = get().transactions;
    set({ transactions: [...prev, tempTx], isWriting: true, error: null });
    try {
      const created = await invoke<Transaction>('create_transaction', { input });
      set(state => ({
        transactions: state.transactions.map(t => t.id === tempId ? created : t),
        isWriting: false,
      }));
    } catch (err) {
      set({ transactions: prev, isWriting: false, error: err as AppError });
    }
  },

  importOFX: async (path) => {
    set({ isWriting: true, importError: null, importResult: null });
    try {
      const result = await invoke<ImportResult>('import_ofx', { path });
      set(state => {
        const existingIds = new Set(state.transactions.map(t => t.id));
        const updated = state.transactions.map(t =>
          result.matchedTransactions.find(m => m.id === t.id) ?? t
        );
        // Append any matched transactions not already in state (e.g. partially-loaded store)
        const newlyMatched = result.matchedTransactions.filter(m => !existingIds.has(m.id));
        return {
          transactions: [...updated, ...newlyMatched, ...result.transactions],
          importResult: result,
          isWriting: false,
        };
      });
    } catch (err) {
      const message = typeof err === 'string' ? err : (err as AppError).message ?? String(err);
      set({ importError: message, isWriting: false });
    }
  },

  clearImportResult: () => set({ importResult: null, importError: null }),

  updateTransaction: async (input) => {
    const prev = get().transactions;
    // Optimistic update: apply known field changes immediately so the UI responds at once.
    const optimistic = prev.map(t => {
      if (t.id !== input.id) return t;
      return {
        ...t,
        ...(input.payee !== undefined ? { payee: input.payee } : {}),
        ...(input.amountCents !== undefined ? { amountCents: input.amountCents } : {}),
        ...(input.date !== undefined ? { date: input.date } : {}),
        ...(input.isCleared !== undefined ? { isCleared: input.isCleared } : {}),
        ...(input.clearEnvelopeId ? { envelopeId: null } : input.envelopeId !== undefined ? { envelopeId: input.envelopeId } : {}),
      };
    });
    set({ transactions: optimistic, isWriting: true, error: null });
    try {
      const updated = await invoke<Transaction>('update_transaction', { input });
      set(state => {
        // If the envelope assignment changed, clear any stale matched-rule annotation so the
        // label can't render incorrect copy (e.g. "-> NewEnvelope via OldRule rule").
        let importResult = state.importResult;
        if (importResult) {
          if (input.envelopeId !== undefined || input.clearEnvelopeId) {
            const { [String(input.id)]: _removed, ...remaining } = importResult.categorizedAnnotations;
            importResult = { ...importResult, categorizedAnnotations: remaining };
          }
          // Remove from unknown merchant queue when a category is assigned (not when clearing).
          if (input.envelopeId !== undefined) {
            importResult = {
              ...importResult,
              uncategorizedIds: importResult.uncategorizedIds.filter(id => id !== input.id),
              conflictedIds: importResult.conflictedIds.filter(id => id !== input.id),
            };
          }
        }
        return {
          transactions: state.transactions.map(t => t.id === updated.id ? updated : t),
          importResult,
          isWriting: false,
        };
      });
    } catch (err) {
      set({ transactions: prev, isWriting: false, error: err as AppError });
    }
  },
}));
