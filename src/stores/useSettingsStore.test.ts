import { vi, describe, it, expect, beforeEach } from 'vitest';
import { useSettingsStore } from './useSettingsStore';
import type { Settings } from '@/lib/types';

// Mock Tauri invoke so tests don't require a running Tauri backend
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

import { invoke } from '@tauri-apps/api/core';
const mockInvoke = vi.mocked(invoke);

describe('useSettingsStore', () => {
  beforeEach(() => {
    useSettingsStore.setState({ settings: null, isWriting: false, isReadOnly: false, error: null });
    vi.clearAllMocks();
  });

  it('initializes with isWriting: false', () => {
    expect(useSettingsStore.getState().isWriting).toBe(false);
  });

  it('initializes with isReadOnly: false', () => {
    expect(useSettingsStore.getState().isReadOnly).toBe(false);
  });

  it('initializes with settings: null', () => {
    expect(useSettingsStore.getState().settings).toBeNull();
  });

  it('sets isWriting to true during loadSettings, false after resolution', async () => {
    const mockSettings: Settings = {
      id: 1,
      budgetName: null,
      startMonth: null,
      payFrequency: 'monthly',
      payDates: '["1"]',
      savingsTargetPct: 10,
      dataFolderPath: null,
      onboardingComplete: false,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    };

    let resolveInvoke!: (value: Settings | null) => void;
    mockInvoke.mockReturnValue(
      new Promise<Settings | null>((res) => {
        resolveInvoke = res;
      }),
    );

    const loadPromise = useSettingsStore.getState().loadSettings();

    // While in-flight, isWriting should be true
    expect(useSettingsStore.getState().isWriting).toBe(true);

    resolveInvoke(mockSettings);
    await loadPromise;

    // After resolution, isWriting should be false
    expect(useSettingsStore.getState().isWriting).toBe(false);
    expect(useSettingsStore.getState().settings).toEqual(mockSettings);
  });

  it('clears isWriting on error', async () => {
    mockInvoke.mockRejectedValue({ code: 'DB_ERROR', message: 'failed' });

    await useSettingsStore.getState().loadSettings();

    expect(useSettingsStore.getState().isWriting).toBe(false);
    expect(useSettingsStore.getState().error).toEqual({ code: 'DB_ERROR', message: 'failed' });
  });

  it('setReadOnly updates isReadOnly', () => {
    useSettingsStore.getState().setReadOnly(true);
    expect(useSettingsStore.getState().isReadOnly).toBe(true);
    useSettingsStore.getState().setReadOnly(false);
    expect(useSettingsStore.getState().isReadOnly).toBe(false);
  });

  describe('checkSentinel', () => {
    it('sets isReadOnly: true when get_read_only_state returns true', async () => {
      mockInvoke.mockResolvedValueOnce(true);

      await useSettingsStore.getState().checkSentinel();

      expect(mockInvoke).toHaveBeenCalledWith('get_read_only_state');
      expect(useSettingsStore.getState().isReadOnly).toBe(true);
    });

    it('sets isReadOnly: false when get_read_only_state returns false', async () => {
      mockInvoke.mockResolvedValueOnce(false);

      await useSettingsStore.getState().checkSentinel();

      expect(useSettingsStore.getState().isReadOnly).toBe(false);
    });

    it('sets isReadOnly: false (fail open) when invoke rejects', async () => {
      mockInvoke.mockRejectedValueOnce(new Error('IPC error'));

      await useSettingsStore.getState().checkSentinel();

      expect(useSettingsStore.getState().isReadOnly).toBe(false);
    });

    it('does not affect isWriting or settings when called', async () => {
      const mockSettings: Settings = {
        id: 1,
        budgetName: null,
        startMonth: null,
        payFrequency: 'monthly',
        payDates: '"15"',
        savingsTargetPct: 10,
        dataFolderPath: '/data',
        onboardingComplete: true,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      };
      useSettingsStore.setState({ settings: mockSettings, isWriting: false });
      mockInvoke.mockResolvedValueOnce(true);

      await useSettingsStore.getState().checkSentinel();

      expect(useSettingsStore.getState().settings).toEqual(mockSettings);
      expect(useSettingsStore.getState().isWriting).toBe(false);
    });
  });
});
