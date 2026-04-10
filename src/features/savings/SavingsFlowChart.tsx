import { BarChart, Bar, XAxis, YAxis, Cell, ResponsiveContainer } from 'recharts';
import { useSavingsStore } from '@/stores/useSavingsStore';

function getCurrentMonth(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

function getBarColor(month: string, netFlowCents: number, currentMonth: string): string {
  if (month === currentMonth) return 'var(--color-runway-healthy)';
  if (netFlowCents >= 0) return 'var(--color-savings-positive)';
  return 'var(--color-savings-negative)';
}

function formatMonthLabel(month: string): string {
  const [year, m] = month.split('-');
  const date = new Date(parseInt(year!, 10), parseInt(m!, 10) - 1, 1);
  return date.toLocaleString('default', { month: 'short' });
}

export default function SavingsFlowChart() {
  const { monthlyFlow } = useSavingsStore();
  const currentMonth = getCurrentMonth();

  if (monthlyFlow.length === 0) return null;

  const data = monthlyFlow.map((entry) => ({
    month: formatMonthLabel(entry.month),
    monthKey: entry.month,
    netFlowCents: entry.netFlowCents,
  }));

  return (
    <div data-testid="savings-flow-chart" className="flex-1">
      <ResponsiveContainer width="100%" height={80}>
        <BarChart data={data} barCategoryGap="20%">
          <XAxis
            dataKey="month"
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 10, fill: 'var(--color-text-secondary)' }}
          />
          <YAxis hide />
          <Bar dataKey="netFlowCents" radius={[2, 2, 0, 0]}>
            {data.map((entry) => (
              <Cell
                key={entry.monthKey}
                fill={getBarColor(entry.monthKey, entry.netFlowCents, currentMonth)}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
