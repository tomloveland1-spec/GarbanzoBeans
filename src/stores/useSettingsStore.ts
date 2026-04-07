import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import type { AppError, Settings, UpsertSettingsInput } from '@/lib/types';

interface SettingsState {
  settings: Settings | null;
  isWriting: boolean;
  isReadOnly: boolean;
  error: AppError | null;

  // Actions
  loadSettings: () => Promise<void>;
  upsertSettings: (input: UpsertSettingsInput) => Promise<void>;
  setReadOnly: (value: boolean) => void;
  checkSentinel: () => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: null,
  isWriting: false,
  isReadOnly: false,
  error: null,

  loadSettings: async () => {
    set({ isWriting: true, error: null });
    try {
      const result = await invoke<Settings | null>('get_settings');
      set({ settings: result });
    } catch (err) {
      set({ error: err as AppError });
    } finally {
      set({ isWriting: false });
    }
  },

  upsertSettings: async (input) => {
    set({ isWriting: true, error: null });
    try {
      await invoke('upsert_settings', { input });
      // Refresh store state via loadSettings() per Task 8 spec
      await get().loadSettings();
    } catch (err) {
      set({ error: err as AppError });
      throw err;  // re-throw so OnboardingPage can detect failure
    } finally {
      set({ isWriting: false });
    }
  },

  setReadOnly: (value) => set({ isReadOnly: value }),

  checkSentinel: async () => {
    try {
      const isReadOnly = await invoke<boolean>('get_read_only_state');
      set({ isReadOnly });
    } catch {
      set({ isReadOnly: false }); // fail open — don't block user if check fails
    }
  },
}));
