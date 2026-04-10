import { vi, describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import SavingsFlowChart from './SavingsFlowChart';
import type { SavingsFlowMonth } from '@/lib/types';

// Mock recharts — SVG not supported in jsdom; test data flow, not rendering internals
vi.mock('recharts', () => ({
  BarChart: ({ children, data }: { children: React.ReactNode; data: unknown[] }) => (
    <div data-testid="bar-chart" data-items={JSON.stringify(data)}>{children}</div>
  ),
  Bar: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="bar">{children}</div>
  ),
  XAxis: () => <div data-testid="x-axis" />,
  YAxis: () => <div data-testid="y-axis" />,
  Cell: ({ fill }: { fill: string }) => <div data-testid="cell" data-fill={fill} />,
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="responsive-container">{children}</div>
  ),
}));

const savingsStore = {
  monthlyFlow: [] as SavingsFlowMonth[],
};

vi.mock('@/stores/useSavingsStore', () => ({
  useSavingsStore: vi.fn(() => savingsStore),
}));

const _now = new Date();
const currentMonth = `${_now.getFullYear()}-${String(_now.getMonth() + 1).padStart(2, '0')}`;

const makeMonth = (month: string, netFlowCents: number): SavingsFlowMonth => ({
  month,
  netFlowCents,
});

describe('SavingsFlowChart', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    savingsStore.monthlyFlow = [];
  });

  it('renders with data-testid="savings-flow-chart"', () => {
    savingsStore.monthlyFlow = [makeMonth('2026-01', 100)];
    render(<SavingsFlowChart />);
    expect(screen.getByTestId('savings-flow-chart')).toBeInTheDocument();
  });

  it('renders nothing when no monthlyFlow data', () => {
    savingsStore.monthlyFlow = [];
    render(<SavingsFlowChart />);
    expect(screen.queryByTestId('savings-flow-chart')).toBeNull();
  });

  it('passes monthlyFlow data to BarChart', () => {
    savingsStore.monthlyFlow = [makeMonth('2026-03', 500), makeMonth('2026-04', -200)];
    render(<SavingsFlowChart />);
    const chart = screen.getByTestId('bar-chart');
    const data = JSON.parse(chart.getAttribute('data-items') ?? '[]') as Array<{ netFlowCents: number }>;
    expect(data).toHaveLength(2);
    expect(data[0]!.netFlowCents).toBe(500);
    expect(data[1]!.netFlowCents).toBe(-200);
  });

  it('renders Cell for each data point', () => {
    savingsStore.monthlyFlow = [makeMonth('2026-01', 100), makeMonth('2026-02', -50)];
    render(<SavingsFlowChart />);
    expect(screen.getAllByTestId('cell')).toHaveLength(2);
  });

  it('current month Cell uses runway-healthy color', () => {
    savingsStore.monthlyFlow = [makeMonth(currentMonth, 300)];
    render(<SavingsFlowChart />);
    const cells = screen.getAllByTestId('cell');
    expect(cells[0]!.getAttribute('data-fill')).toBe('var(--color-runway-healthy)');
  });

  it('positive non-current month Cell uses savings-positive color', () => {
    savingsStore.monthlyFlow = [makeMonth('2026-01', 500)];
    render(<SavingsFlowChart />);
    const cells = screen.getAllByTestId('cell');
    expect(cells[0]!.getAttribute('data-fill')).toBe('var(--color-savings-positive)');
  });

  it('negative non-current month Cell uses savings-negative color', () => {
    savingsStore.monthlyFlow = [makeMonth('2026-01', -300)];
    render(<SavingsFlowChart />);
    const cells = screen.getAllByTestId('cell');
    expect(cells[0]!.getAttribute('data-fill')).toBe('var(--color-savings-negative)');
  });
});
