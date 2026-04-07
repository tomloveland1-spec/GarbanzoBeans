import { create } from 'zustand';
import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';

interface UpdateState {
  pendingUpdate: { version: string } | null;
  isDismissed: boolean;
  isInstalling: boolean;
  installError: string | null;

  checkForUpdate: () => Promise<void>;
  dismissUpdate: () => void;
  applyUpdate: () => Promise<void>;
}

export const useUpdateStore = create<UpdateState>((set, get) => ({
  pendingUpdate: null,
  isDismissed: false,
  isInstalling: false,
  installError: null,

  checkForUpdate: async () => {
    try {
      const update = await check();
      if (update) {
        set({ pendingUpdate: { version: update.version } });
      }
    } catch (err) {
      // Fail silently — NFR15: update check failures must not impact app function
      if (import.meta.env.DEV) {
        console.warn('[updater] check failed:', err);
      }
    }
  },

  dismissUpdate: () => set({ isDismissed: true, installError: null }),

  applyUpdate: async () => {
    if (get().isInstalling) return; // P2: guard against concurrent invocations
    set({ isInstalling: true, installError: null });
    try {
      const update = await check();
      if (update) {
        await update.downloadAndInstall();
        await relaunch();
      } else {
        // P1: second check returned null (update retracted); reset so UI recovers
        set({ isInstalling: false });
      }
    } catch (err) {
      // P4: log in all builds; show inline error feedback
      console.warn('[updater] install failed:', err);
      set({ isInstalling: false, installError: 'Install failed — try again' });
    }
  },
}));
