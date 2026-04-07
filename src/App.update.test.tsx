import { vi, describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('@tauri-apps/plugin-updater', () => ({
  check: vi.fn(),
}));
vi.mock('@tauri-apps/plugin-process', () => ({
  relaunch: vi.fn(),
}));
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

// Mock router — provide Outlet as a no-op, useRouterState returns main app path
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
  Outlet: () => <div data-testid="outlet" />,
  useRouterState: vi.fn(() => false), // not onboarding by default
}));

vi.mock('@/stores/useSettingsStore', () => ({
  useSettingsStore: vi.fn(() => ({ isReadOnly: false })),
}));

vi.mock('@/stores/useUpdateStore', () => ({
  useUpdateStore: vi.fn(),
}));

// ── Import after mocks ────────────────────────────────────────────────────────

import App from './App';
import { useUpdateStore } from '@/stores/useUpdateStore';

// ── Helpers ───────────────────────────────────────────────────────────────────

function mockUpdateStore(overrides?: {
  pendingUpdate?: { version: string } | null;
  isDismissed?: boolean;
  isInstalling?: boolean;
  installError?: string | null;
}) {
  const applyUpdate = vi.fn().mockResolvedValue(undefined);
  const dismissUpdate = vi.fn();
  const checkForUpdate = vi.fn().mockResolvedValue(undefined);

  vi.mocked(useUpdateStore).mockReturnValue({
    pendingUpdate: overrides?.pendingUpdate ?? null,
    isDismissed: overrides?.isDismissed ?? false,
    isInstalling: overrides?.isInstalling ?? false,
    installError: overrides?.installError ?? null,
    applyUpdate,
    dismissUpdate,
    checkForUpdate,
  } as any);

  // Also mock getState for the useEffect call
  vi.mocked(useUpdateStore).getState = vi.fn().mockReturnValue({
    checkForUpdate,
  }) as any;

  return { applyUpdate, dismissUpdate, checkForUpdate };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('App — update prompt', () => {
  it('shows update prompt when pendingUpdate is set and not dismissed', () => {
    mockUpdateStore({ pendingUpdate: { version: '2.0.0' }, isDismissed: false });

    render(<App />);

    expect(screen.getByTestId('update-prompt')).toBeInTheDocument();
    expect(screen.getByText('v2.0.0 available')).toBeInTheDocument();
    expect(screen.getByTestId('update-confirm-button')).toBeInTheDocument();
    expect(screen.getByTestId('update-dismiss-button')).toBeInTheDocument();
  });

  it('does not show update prompt when pendingUpdate is null', () => {
    mockUpdateStore({ pendingUpdate: null });

    render(<App />);

    expect(screen.queryByTestId('update-prompt')).not.toBeInTheDocument();
  });

  it('does not show update prompt when isDismissed is true', () => {
    mockUpdateStore({ pendingUpdate: { version: '2.0.0' }, isDismissed: true });

    render(<App />);

    expect(screen.queryByTestId('update-prompt')).not.toBeInTheDocument();
  });

  it('calls dismissUpdate when "Later" button is clicked', () => {
    const { dismissUpdate } = mockUpdateStore({ pendingUpdate: { version: '2.0.0' } });

    render(<App />);

    fireEvent.click(screen.getByTestId('update-dismiss-button'));

    expect(dismissUpdate).toHaveBeenCalledOnce();
  });

  it('calls applyUpdate when "Update Now" button is clicked', () => {
    const { applyUpdate } = mockUpdateStore({ pendingUpdate: { version: '2.0.0' } });

    render(<App />);

    fireEvent.click(screen.getByTestId('update-confirm-button'));

    expect(applyUpdate).toHaveBeenCalledOnce();
  });

  it('shows "Installing…" and disables buttons while isInstalling is true', () => {
    mockUpdateStore({ pendingUpdate: { version: '2.0.0' }, isInstalling: true });

    render(<App />);

    const confirmBtn = screen.getByTestId('update-confirm-button');
    const dismissBtn = screen.getByTestId('update-dismiss-button');

    expect(confirmBtn).toHaveTextContent('Installing…');
    expect(confirmBtn).toBeDisabled();
    expect(dismissBtn).toBeDisabled();
  });

  it('shows installError text in the prompt when install fails', () => {
    mockUpdateStore({
      pendingUpdate: { version: '2.0.0' },
      installError: 'Install failed — try again',
    });

    render(<App />);

    expect(screen.getByTestId('update-error')).toBeInTheDocument();
    expect(screen.getByTestId('update-error')).toHaveTextContent('Install failed — try again');
  });
});
