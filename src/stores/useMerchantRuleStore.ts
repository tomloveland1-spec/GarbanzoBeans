import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import type { AppError, MerchantRule, CreateMerchantRuleInput, UpdateMerchantRuleInput } from '@/lib/types';

interface MerchantRuleState {
  rules: MerchantRule[];
  isWriting: boolean;
  error: AppError | null;

  // Computed — pairs of rules whose payeeSubstring values overlap (case-insensitive containment)
  conflictingRules: () => [MerchantRule, MerchantRule][];

  // Actions
  loadRules: () => Promise<void>;
  createRule: (input: CreateMerchantRuleInput) => Promise<void>;
  updateRule: (input: UpdateMerchantRuleInput) => Promise<void>;
  deleteRule: (id: number) => Promise<void>;
}

// Module-level counter for unique optimistic temp IDs — avoids -Date.now() collisions
let _tempIdCounter = 0;

export const useMerchantRuleStore = create<MerchantRuleState>((set, get) => ({
  rules: [],
  isWriting: false,
  error: null,

  conflictingRules: () => {
    const rules = get().rules;
    const conflicts: [MerchantRule, MerchantRule][] = [];
    for (let i = 0; i < rules.length; i++) {
      for (let j = i + 1; j < rules.length; j++) {
        const a = rules[i].payeeSubstring.toLowerCase();
        const b = rules[j].payeeSubstring.toLowerCase();
        if (a.includes(b) || b.includes(a)) {
          conflicts.push([rules[i], rules[j]]);
        }
      }
    }
    return conflicts;
  },

  loadRules: async () => {
    set({ isWriting: true, error: null });
    try {
      const rules = await invoke<MerchantRule[]>('get_merchant_rules');
      set({ rules });
    } catch (err) {
      set({ error: err as AppError });
    } finally {
      set({ isWriting: false });
    }
  },

  createRule: async (input) => {
    const tempId = --_tempIdCounter;
    const tempRule: MerchantRule = {
      id: tempId,
      payeeSubstring: input.payeeSubstring,
      envelopeId: input.envelopeId,
      version: 1,
      createdAt: new Date().toISOString(),
      lastMatchedAt: null,
      matchCount: 0,
    };

    const prev = get().rules;
    set({ rules: [...prev, tempRule], isWriting: true, error: null });

    try {
      const created = await invoke<MerchantRule>('create_merchant_rule', { input });
      set((state) => ({
        rules: state.rules.map((r) => (r.id === tempId ? created : r)),
        isWriting: false,
      }));
    } catch (err) {
      set({ rules: prev, isWriting: false, error: err as AppError });
    }
  },

  updateRule: async (input) => {
    if (input.payeeSubstring === undefined && input.envelopeId === undefined) {
      set({ error: { code: 'INVALID_INPUT', message: 'At least one field must be provided.' } as AppError });
      return;
    }
    const prev = get().rules;
    set({
      rules: prev.map((r) =>
        r.id === input.id
          ? {
              ...r,
              ...(input.payeeSubstring !== undefined && { payeeSubstring: input.payeeSubstring }),
              ...(input.envelopeId !== undefined && { envelopeId: input.envelopeId }),
            }
          : r
      ),
      isWriting: true,
      error: null,
    });

    try {
      const updated = await invoke<MerchantRule>('update_merchant_rule', { input });
      set((state) => ({
        rules: state.rules.map((r) => (r.id === updated.id ? updated : r)),
        isWriting: false,
      }));
    } catch (err) {
      set({ rules: prev, isWriting: false, error: err as AppError });
    }
  },

  deleteRule: async (id) => {
    const prev = get().rules;
    set({ rules: prev.filter((r) => r.id !== id), isWriting: true, error: null });
    try {
      await invoke('delete_merchant_rule', { id });
      set({ isWriting: false });
    } catch (err) {
      set({ rules: prev, isWriting: false, error: err as AppError });
    }
  },
}));
