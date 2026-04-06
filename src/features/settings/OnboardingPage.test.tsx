import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useSettingsStore } from '@/stores/useSettingsStore';
import type { Settings, UpsertSettingsInput } from '@/lib/types';
import { invoke } from '@tauri-apps/api/core';

// ── Mocks (hoisted by Vitest before imports) ─────────────────────────────────

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: vi.fn(),
}));

// Mock out modules that pull in browser APIs not available in jsdom
vi.mock('@tanstack/router-devtools', () => ({
  TanStackRouterDevtools: () => null,
}));

vi.mock('@/App', () => ({
  default: () => null,
}));

// ── Import after mocks ───────────────────────────────────────────────────────
// Static imports are hoisted, but vi.mock calls run first, so @/router will
// see the mocked versions of @/App and @tanstack/router-devtools.

import { guardOnboarding } from '@/router';

// ── Shared fixture ────────────────────────────────────────────────────────────

const mockSettings: Settings = {
  id: 1,
  budgetName: 'Test Budget',
  startMonth: '2026-04',
  payFrequency: 'monthly',
  payDates: '"15"',
  savingsTargetPct: 10,
  dataFolderPath: '/tmp/gb',
  onboardingComplete: true,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

// ── guardOnboarding ───────────────────────────────────────────────────────────

describe('guardOnboarding', () => {
  beforeEach(() => {
    useSettingsStore.setState({
      settings: null,
      isWriting: false,
      isReadOnly: false,
      error: null,
    });
  });

  it('redirects to /onboarding when settings is null', () => {
    useSettingsStore.setState({ settings: null });
    expect(() => guardOnboarding()).toThrow();
  });

  it('redirects to /onboarding when onboardingComplete is false', () => {
    useSettingsStore.setState({
      settings: { ...mockSettings, onboardingComplete: false },
    });
    expect(() => guardOnboarding()).toThrow();
  });

  it('does not redirect when onboardingComplete is true', () => {
    useSettingsStore.setState({
      settings: { ...mockSettings, onboardingComplete: true },
    });
    expect(() => guardOnboarding()).not.toThrow();
  });
});

// ── useSettingsStore.upsertSettings ──────────────────────────────────────────

describe('useSettingsStore.upsertSettings', () => {
  const mockInvoke = vi.mocked(invoke);

  beforeEach(() => {
    useSettingsStore.setState({
      settings: null,
      isWriting: false,
      isReadOnly: false,
      error: null,
    });
    vi.clearAllMocks();
  });

  it('sets isWriting: true during invoke, false after', async () => {
    let resolveUpsert!: (value: unknown) => void;

    mockInvoke.mockImplementation((cmd) => {
      if (cmd === 'upsert_settings') {
        return new Promise<unknown>((res) => {
          resolveUpsert = res;
        });
      }
      // get_settings called after upsert to refresh state
      if (cmd === 'get_settings') {
        return Promise.resolve(null);
      }
      return Promise.resolve(undefined);
    });

    const input: UpsertSettingsInput = {
      budgetName: 'Test',
      onboardingComplete: true,
    };

    const upsertPromise = useSettingsStore.getState().upsertSettings(input);

    // While upsert_settings is in-flight, isWriting must be true
    expect(useSettingsStore.getState().isWriting).toBe(true);

    // Settle the upsert
    resolveUpsert(undefined);
    await upsertPromise;

    // After completion, isWriting must be false
    expect(useSettingsStore.getState().isWriting).toBe(false);
  });

  it('clears isWriting on upsert error and re-throws', async () => {
    mockInvoke.mockRejectedValue({ code: 'DB_ERROR', message: 'write failed' });

    const input: UpsertSettingsInput = { budgetName: 'Test' };

    await expect(
      useSettingsStore.getState().upsertSettings(input),
    ).rejects.toMatchObject({ code: 'DB_ERROR' });

    expect(useSettingsStore.getState().isWriting).toBe(false);
    expect(useSettingsStore.getState().error).toMatchObject({ code: 'DB_ERROR' });
  });
});
