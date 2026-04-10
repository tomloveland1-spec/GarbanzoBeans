import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

const mockLocationPathname = vi.fn(() => '/');
vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children, ...rest }: { to: string; children: React.ReactNode; [key: string]: unknown }) =>
    <a href={to} {...rest}>{children}</a>,
  Outlet: () => <div data-testid="outlet" />,
  useRouterState: ({ select }: { select: (s: unknown) => unknown }) =>
    select({ location: { pathname: mockLocationPathname() } }),
}));

vi.mock('@/stores/useSettingsStore', () => ({
  useSettingsStore: (selector: (s: unknown) => unknown) =>
    selector({ isReadOnly: false }),
}));

vi.mock('@/stores/useUpdateStore', () => ({
  useUpdateStore: Object.assign(
    (selector?: (s: unknown) => unknown) => {
      const state = { pendingUpdate: null, isDismissed: false, isInstalling: false, installError: null, dismissUpdate: vi.fn(), applyUpdate: vi.fn() };
      return selector ? selector(state) : state;
    },
    { getState: vi.fn(() => ({ checkForUpdate: vi.fn() })) },
  ),
}));

const mockMonthStatus = vi.fn(() => 'open');
vi.mock('@/stores/useMonthStore', () => ({
  useMonthStore: (selector: (s: unknown) => unknown) =>
    selector({ monthStatus: mockMonthStatus() }),
}));

import App from './App';

describe('App TTM resume prompt', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLocationPathname.mockReturnValue('/');
    mockMonthStatus.mockReturnValue('open');
  });

  it('TTM prompt not shown when monthStatus is open', () => {
    mockMonthStatus.mockReturnValue('open');
    render(<App />);
    expect(screen.queryByTestId('ttm-resume-prompt')).toBeNull();
  });

  it('TTM prompt shown when monthStatus is closing:step-1', () => {
    mockMonthStatus.mockReturnValue('closing:step-1');
    render(<App />);
    expect(screen.getByTestId('ttm-resume-prompt')).toBeTruthy();
    expect(screen.getByText('Turn the Month pending')).toBeTruthy();
  });

  it('TTM prompt shown when monthStatus is closing:step-3', () => {
    mockMonthStatus.mockReturnValue('closing:step-3');
    render(<App />);
    expect(screen.getByTestId('ttm-resume-prompt')).toBeTruthy();
  });

  it('TTM prompt Continue link points to /turn-the-month', () => {
    mockMonthStatus.mockReturnValue('closing:step-2');
    render(<App />);
    const link = screen.getByText('Continue →') as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('/turn-the-month');
  });

  it('TTM prompt not shown when already on /turn-the-month route', () => {
    mockMonthStatus.mockReturnValue('closing:step-2');
    mockLocationPathname.mockReturnValue('/turn-the-month');
    render(<App />);
    expect(screen.queryByTestId('ttm-resume-prompt')).toBeNull();
  });
});
