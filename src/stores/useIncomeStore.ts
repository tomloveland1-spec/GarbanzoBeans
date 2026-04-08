import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import type { AppError, IncomeEntry, CreateIncomeEntryInput } from '@/lib/types';

interface IncomeState {
  entries: IncomeEntry[];
  isWriting: boolean;
  error: AppError | null;

  // Actions
  loadIncomeEntries: () => Promise<void>;
  createIncomeEntry: (input: CreateIncomeEntryInput) => Promise<void>;
  deleteIncomeEntry: (id: number) => Promise<void>;
}

// Module-level counter for unique optimistic temp IDs
let _tempIdCounter = 0;

export const useIncomeStore = create<IncomeState>((set, get) => ({
  entries: [],
  isWriting: false,
  error: null,

  loadIncomeEntries: async () => {
    set({ isWriting: true, error: null });
    try {
      const entries = await invoke<IncomeEntry[]>('get_income_entries');
      set({ entries });
    } catch (err) {
      set({ error: err as AppError });
    } finally {
      set({ isWriting: false });
    }
  },

  createIncomeEntry: async (input) => {
    const tempId = --_tempIdCounter;
    const tempEntry: IncomeEntry = {
      id: tempId,
      name: input.name,
      amountCents: input.amountCents,
    };

    const prev = get().entries;
    set({ entries: [...prev, tempEntry], isWriting: true, error: null });

    try {
      const created = await invoke<IncomeEntry>('create_income_entry', { input });
      set((state) => ({
        entries: state.entries.map((e) => (e.id === tempId ? created : e)),
        isWriting: false,
      }));
    } catch (err) {
      set({ entries: prev, isWriting: false, error: err as AppError });
    }
  },

  deleteIncomeEntry: async (id) => {
    const prev = get().entries;
    set({ entries: prev.filter((e) => e.id !== id), isWriting: true, error: null });

    try {
      await invoke<void>('delete_income_entry', { id });
      set({ isWriting: false });
    } catch (err) {
      set({ entries: prev, isWriting: false, error: err as AppError });
    }
  },
}));
