import { vi, describe, it, expect, beforeEach } from 'vitest';

// Mock the Tauri updater and process plugins before importing the store
vi.mock('@tauri-apps/plugin-updater', () => ({
  check: vi.fn(),
}));
vi.mock('@tauri-apps/plugin-process', () => ({
  relaunch: vi.fn(),
}));

import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { useUpdateStore } from './useUpdateStore';

const mockCheck = vi.mocked(check);
const mockRelaunch = vi.mocked(relaunch);

describe('useUpdateStore', () => {
  beforeEach(() => {
    useUpdateStore.setState({ pendingUpdate: null, isDismissed: false, isInstalling: false, installError: null });
    vi.clearAllMocks();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  describe('initial state', () => {
    it('starts with pendingUpdate: null', () => {
      expect(useUpdateStore.getState().pendingUpdate).toBeNull();
    });

    it('starts with isDismissed: false', () => {
      expect(useUpdateStore.getState().isDismissed).toBe(false);
    });

    it('starts with isInstalling: false', () => {
      expect(useUpdateStore.getState().isInstalling).toBe(false);
    });

    it('starts with installError: null', () => {
      expect(useUpdateStore.getState().installError).toBeNull();
    });
  });

  describe('checkForUpdate', () => {
    it('sets pendingUpdate when an update is found', async () => {
      mockCheck.mockResolvedValueOnce({ version: '1.2.3' } as any);

      await useUpdateStore.getState().checkForUpdate();

      expect(useUpdateStore.getState().pendingUpdate).toEqual({ version: '1.2.3' });
    });

    it('leaves pendingUpdate null when check returns null (no update)', async () => {
      mockCheck.mockResolvedValueOnce(null);

      await useUpdateStore.getState().checkForUpdate();

      expect(useUpdateStore.getState().pendingUpdate).toBeNull();
    });

    it('fails silently and sets no state when check throws', async () => {
      mockCheck.mockRejectedValueOnce(new Error('network error'));

      await useUpdateStore.getState().checkForUpdate();

      expect(useUpdateStore.getState().pendingUpdate).toBeNull();
      expect(useUpdateStore.getState().isDismissed).toBe(false);
      expect(useUpdateStore.getState().isInstalling).toBe(false);
    });

    it('fails silently when check throws — does not throw to caller', async () => {
      mockCheck.mockRejectedValueOnce(new Error('manifest 404'));

      await expect(useUpdateStore.getState().checkForUpdate()).resolves.toBeUndefined();
    });
  });

  describe('dismissUpdate', () => {
    it('sets isDismissed to true', () => {
      useUpdateStore.getState().dismissUpdate();
      expect(useUpdateStore.getState().isDismissed).toBe(true);
    });

    it('clears installError', () => {
      useUpdateStore.setState({ installError: 'Install failed — try again' });
      useUpdateStore.getState().dismissUpdate();
      expect(useUpdateStore.getState().installError).toBeNull();
    });

    it('does not affect pendingUpdate or isInstalling', () => {
      useUpdateStore.setState({ pendingUpdate: { version: '1.0.0' }, isInstalling: false });
      useUpdateStore.getState().dismissUpdate();
      expect(useUpdateStore.getState().pendingUpdate).toEqual({ version: '1.0.0' });
      expect(useUpdateStore.getState().isInstalling).toBe(false);
    });
  });

  describe('applyUpdate', () => {
    it('sets isInstalling to true before download', async () => {
      const mockUpdate = { downloadAndInstall: vi.fn().mockResolvedValue(undefined) };
      mockCheck.mockResolvedValueOnce(mockUpdate as any);
      mockRelaunch.mockResolvedValue(undefined);

      let installingDuringCall = false;
      mockUpdate.downloadAndInstall.mockImplementationOnce(async () => {
        installingDuringCall = useUpdateStore.getState().isInstalling;
      });

      await useUpdateStore.getState().applyUpdate();

      expect(installingDuringCall).toBe(true);
    });

    it('calls downloadAndInstall and relaunch when update is available', async () => {
      const mockUpdate = { downloadAndInstall: vi.fn().mockResolvedValue(undefined) };
      mockCheck.mockResolvedValueOnce(mockUpdate as any);
      mockRelaunch.mockResolvedValue(undefined);

      await useUpdateStore.getState().applyUpdate();

      expect(mockUpdate.downloadAndInstall).toHaveBeenCalledOnce();
      expect(mockRelaunch).toHaveBeenCalledOnce();
    });

    it('resets isInstalling and sets installError when applyUpdate throws', async () => {
      mockCheck.mockRejectedValueOnce(new Error('install error'));

      await useUpdateStore.getState().applyUpdate();

      expect(useUpdateStore.getState().isInstalling).toBe(false);
      expect(useUpdateStore.getState().installError).toBe('Install failed — try again');
    });

    it('resets isInstalling when second check returns null (update retracted)', async () => {
      mockCheck.mockResolvedValueOnce(null);

      await useUpdateStore.getState().applyUpdate();

      expect(useUpdateStore.getState().isInstalling).toBe(false);
      expect(useUpdateStore.getState().installError).toBeNull();
    });

    it('does not invoke applyUpdate concurrently when already installing', async () => {
      const mockUpdate = { downloadAndInstall: vi.fn().mockResolvedValue(undefined) };
      mockRelaunch.mockResolvedValue(undefined);

      let resolveInstall!: () => void;
      mockUpdate.downloadAndInstall.mockImplementationOnce(
        () => new Promise<void>((res) => { resolveInstall = res; }),
      );
      mockCheck.mockResolvedValue(mockUpdate as any);

      const first = useUpdateStore.getState().applyUpdate();
      await useUpdateStore.getState().applyUpdate(); // second call while first is in-flight
      resolveInstall();
      await first;

      expect(mockUpdate.downloadAndInstall).toHaveBeenCalledOnce();
    });

    it('does not throw to caller on failure', async () => {
      mockCheck.mockRejectedValueOnce(new Error('failed'));

      await expect(useUpdateStore.getState().applyUpdate()).resolves.toBeUndefined();
    });
  });
});
