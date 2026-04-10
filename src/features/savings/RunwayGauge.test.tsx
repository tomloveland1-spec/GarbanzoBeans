import { vi, describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import RunwayGauge from './RunwayGauge';
import type { SavingsReconciliation } from '@/lib/types';

// ── Store mock ─────────────────────────────────────────────────────────────────

const savingsStore = {
  reconciliations: [] as SavingsReconciliation[],
  runway: vi.fn(() => 0),
  runwayDelta: vi.fn(() => null as number | null),
};

vi.mock('@/stores/useSavingsStore', () => {
  const useSavingsStore = vi.fn(() => savingsStore);
  return { useSavingsStore };
});

const makeReconciliation = (overrides: Partial<SavingsReconciliation> = {}): SavingsReconciliation => ({
  id: 1,
  date: '2026-04-08',
  enteredBalanceCents: 500_000,
  previousTrackedBalanceCents: 0,
  deltaCents: 500_000,
  note: null,
  ...overrides,
});

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('RunwayGauge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    savingsStore.reconciliations = [];
    savingsStore.runway.mockReturnValue(0);
    savingsStore.runwayDelta.mockReturnValue(null);
  });

  it('renders with data-testid="runway-gauge"', () => {
    render(<RunwayGauge />);
    expect(screen.getByTestId('runway-gauge')).toBeInTheDocument();
  });

  it('shows "—" as center text when no reconciliations', () => {
    savingsStore.reconciliations = [];
    render(<RunwayGauge />);
    expect(screen.getByTestId('runway-value')).toHaveTextContent('—');
  });

  it('shows runway number as center text when reconciliations exist', () => {
    savingsStore.reconciliations = [makeReconciliation()];
    savingsStore.runway.mockReturnValue(3);
    render(<RunwayGauge />);
    expect(screen.getByTestId('runway-value')).toHaveTextContent('3');
  });

  it('renders no fill arc when no reconciliations', () => {
    savingsStore.reconciliations = [];
    render(<RunwayGauge />);
    expect(screen.queryByTestId('runway-fill')).toBeNull();
  });

  it('renders fill arc when reconciliations exist', () => {
    savingsStore.reconciliations = [makeReconciliation()];
    savingsStore.runway.mockReturnValue(3);
    render(<RunwayGauge />);
    expect(screen.getByTestId('runway-fill')).toBeInTheDocument();
  });

  it('fill arc uses critical color when runway < 1', () => {
    savingsStore.reconciliations = [makeReconciliation()];
    savingsStore.runway.mockReturnValue(0.5);
    render(<RunwayGauge />);
    expect(screen.getByTestId('runway-fill')).toHaveAttribute('stroke', 'var(--color-runway-critical)');
  });

  it('fill arc uses caution color when runway is 1–3', () => {
    savingsStore.reconciliations = [makeReconciliation()];
    savingsStore.runway.mockReturnValue(2);
    render(<RunwayGauge />);
    expect(screen.getByTestId('runway-fill')).toHaveAttribute('stroke', 'var(--color-runway-caution)');
  });

  it('fill arc uses healthy color when runway >= 3', () => {
    savingsStore.reconciliations = [makeReconciliation()];
    savingsStore.runway.mockReturnValue(5);
    render(<RunwayGauge />);
    expect(screen.getByTestId('runway-fill')).toHaveAttribute('stroke', 'var(--color-runway-healthy)');
  });

  it('background track uses gauge-track color', () => {
    render(<RunwayGauge />);
    expect(screen.getByTestId('runway-track')).toHaveAttribute('stroke', 'var(--color-gauge-track)');
  });

  it('has role="img"', () => {
    render(<RunwayGauge />);
    expect(screen.getByRole('img')).toBeInTheDocument();
  });

  it('shows delta when >= 2 reconciliations and runwayDelta returns value', () => {
    savingsStore.reconciliations = [makeReconciliation({ id: 1 }), makeReconciliation({ id: 2 })];
    savingsStore.runway.mockReturnValue(3);
    savingsStore.runwayDelta.mockReturnValue(1);
    render(<RunwayGauge />);
    expect(screen.getByTestId('runway-delta')).toHaveTextContent('↑ +1 this month');
  });

  it('shows no delta when fewer than 2 reconciliations', () => {
    savingsStore.reconciliations = [makeReconciliation()];
    savingsStore.runwayDelta.mockReturnValue(1);
    render(<RunwayGauge />);
    expect(screen.queryByTestId('runway-delta')).toBeNull();
  });

  it('shows empty-state prompt when no reconciliations', () => {
    savingsStore.reconciliations = [];
    render(<RunwayGauge />);
    expect(screen.getByText('Enter your savings balance to start tracking runway')).toBeInTheDocument();
  });

  it('does NOT show empty-state prompt when reconciliations exist', () => {
    savingsStore.reconciliations = [makeReconciliation()];
    savingsStore.runway.mockReturnValue(3);
    render(<RunwayGauge />);
    expect(screen.queryByText('Enter your savings balance to start tracking runway')).toBeNull();
  });
});
