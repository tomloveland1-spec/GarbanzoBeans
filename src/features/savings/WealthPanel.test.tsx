import { vi, describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import WealthPanel from './WealthPanel';

// ── Store mocks ────────────────────────────────────────────────────────────────

vi.mock('./RunwayGauge', () => ({
  default: () => <div data-testid="runway-gauge-mock" />,
}));

vi.mock('./SavingsFlowChart', () => ({
  default: () => <div data-testid="savings-flow-chart-mock" />,
}));

vi.mock('lucide-react', () => ({
  ChevronDown: () => <svg data-testid="chevron-down" />,
  ChevronUp: () => <svg data-testid="chevron-up" />,
}));

const settingsStore = { isReadOnly: false };
vi.mock('@/stores/useSettingsStore', () => {
  const useSettingsStore = vi.fn((selector?: (s: typeof settingsStore) => unknown) =>
    selector ? selector(settingsStore) : settingsStore,
  );
  return { useSettingsStore };
});

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('WealthPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    settingsStore.isReadOnly = false;
    localStorage.clear();
  });

  it('renders with data-testid="wealth-panel"', () => {
    render(<WealthPanel />);
    expect(screen.getByTestId('wealth-panel')).toBeInTheDocument();
  });

  it('renders ReconciliationForm (save button present)', () => {
    render(<WealthPanel />);
    expect(screen.getByRole('button', { name: 'Save Balance' })).toBeInTheDocument();
  });

  it('renders RunwayGauge', () => {
    render(<WealthPanel />);
    expect(screen.getByTestId('runway-gauge-mock')).toBeInTheDocument();
  });

  it('renders SavingsFlowChart', () => {
    render(<WealthPanel />);
    expect(screen.getByTestId('savings-flow-chart-mock')).toBeInTheDocument();
  });

  it('renders collapse button when expanded', () => {
    render(<WealthPanel />);
    expect(screen.getByRole('button', { name: 'Collapse wealth panel' })).toBeInTheDocument();
    expect(screen.getByTestId('chevron-up')).toBeInTheDocument();
  });

  it('clicking collapse hides panel content', () => {
    render(<WealthPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Collapse wealth panel' }));
    expect(screen.queryByTestId('runway-gauge-mock')).toBeNull();
    expect(screen.queryByTestId('savings-flow-chart-mock')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Save Balance' })).toBeNull();
  });

  it('clicking collapse shows expand button', () => {
    render(<WealthPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Collapse wealth panel' }));
    expect(screen.getByRole('button', { name: 'Expand wealth panel' })).toBeInTheDocument();
    expect(screen.getByTestId('chevron-down')).toBeInTheDocument();
  });

  it('clicking expand restores panel content', () => {
    render(<WealthPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Collapse wealth panel' }));
    fireEvent.click(screen.getByRole('button', { name: 'Expand wealth panel' }));
    expect(screen.getByTestId('runway-gauge-mock')).toBeInTheDocument();
  });

  it('initializes collapsed when localStorage has true', () => {
    localStorage.setItem('wealth-panel-collapsed', 'true');
    render(<WealthPanel />);
    expect(screen.queryByTestId('runway-gauge-mock')).toBeNull();
    expect(screen.getByRole('button', { name: 'Expand wealth panel' })).toBeInTheDocument();
  });

  it('persists collapsed state to localStorage', () => {
    render(<WealthPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Collapse wealth panel' }));
    expect(localStorage.getItem('wealth-panel-collapsed')).toBe('true');
  });
});
