import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import type { AppError, Envelope, CreateEnvelopeInput, UpdateEnvelopeInput } from '@/lib/types';

interface EnvelopeState {
  envelopes: Envelope[];
  isWriting: boolean;
  error: AppError | null;

  // Actions
  loadEnvelopes: () => Promise<void>;
  createEnvelope: (input: CreateEnvelopeInput) => Promise<void>;
  updateEnvelope: (input: UpdateEnvelopeInput) => Promise<void>;
  deleteEnvelope: (id: number) => Promise<void>;
}

// Module-level counter for unique optimistic temp IDs — avoids -Date.now() collisions
let _tempIdCounter = 0;

export const useEnvelopeStore = create<EnvelopeState>((set, get) => ({
  envelopes: [],
  isWriting: false,
  error: null,

  loadEnvelopes: async () => {
    set({ isWriting: true, error: null });
    try {
      const envelopes = await invoke<Envelope[]>('get_envelopes');
      set({ envelopes });
    } catch (err) {
      set({ error: err as AppError });
    } finally {
      set({ isWriting: false });
    }
  },

  createEnvelope: async (input) => {
    if (!Number.isInteger(input.allocatedCents)) {
      set({ error: { code: 'INVALID_ALLOCATED_CENTS', message: 'allocatedCents must be an integer (cents).' } as AppError });
      return;
    }

    // Optimistic add: unique negative temp id per call (counter avoids same-millisecond collisions)
    const tempId = --_tempIdCounter;
    const tempEnvelope: Envelope = {
      id: tempId,
      name: input.name,
      type: input.envelopeType,
      priority: input.priority,
      allocatedCents: input.allocatedCents,
      monthId: input.monthId ?? null,
      createdAt: new Date().toISOString(),
    };

    const prev = get().envelopes;
    set({ envelopes: [...prev, tempEnvelope], isWriting: true, error: null });

    try {
      const created = await invoke<Envelope>('create_envelope', { input });
      // Replace this specific temp entry with the real response
      set((state) => ({
        envelopes: state.envelopes.map((e) => (e.id === tempId ? created : e)),
        isWriting: false,
      }));
    } catch (err) {
      // Rollback: restore pre-optimistic state
      set({ envelopes: prev, isWriting: false, error: err as AppError });
    }
  },

  updateEnvelope: async (input) => {
    if (input.allocatedCents !== undefined && !Number.isInteger(input.allocatedCents)) {
      set({ error: { code: 'INVALID_ALLOCATED_CENTS', message: 'allocatedCents must be an integer (cents).' } as AppError });
      return;
    }

    const prev = get().envelopes;
    // Optimistic update: apply changes immediately
    set({
      envelopes: prev.map((e) =>
        e.id === input.id
          ? {
              ...e,
              ...(input.name !== undefined && { name: input.name }),
              ...(input.envelopeType !== undefined && { type: input.envelopeType }),
              ...(input.priority !== undefined && { priority: input.priority }),
              ...(input.allocatedCents !== undefined && { allocatedCents: input.allocatedCents }),
              ...(input.monthId !== undefined && { monthId: input.monthId ?? null }),
            }
          : e
      ),
      isWriting: true,
      error: null,
    });

    try {
      const updated = await invoke<Envelope>('update_envelope', { input });
      // Replace with authoritative response from DB
      set((state) => ({
        envelopes: state.envelopes.map((e) => (e.id === updated.id ? updated : e)),
        isWriting: false,
      }));
    } catch (err) {
      // Rollback: restore pre-optimistic state
      set({ envelopes: prev, isWriting: false, error: err as AppError });
    }
  },

  deleteEnvelope: async (id) => {
    const prev = get().envelopes;
    set({ envelopes: prev.filter((e) => e.id !== id), isWriting: true, error: null });
    try {
      await invoke<void>('delete_envelope', { id });
      set({ isWriting: false });
    } catch (err) {
      set({ envelopes: prev, isWriting: false, error: err as AppError });
    }
  },
}));
