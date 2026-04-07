import EnvelopeList from './EnvelopeList';

export default function BudgetPage() {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Wealth panel — placeholder until Epic 5 */}
      <div
        data-testid="wealth-panel-placeholder"
        className="shrink-0 h-[56px] border-b"
        style={{ borderColor: 'var(--color-border)' }}
      />
      {/* Envelope list — fills remaining height */}
      <div className="flex-1 overflow-y-auto">
        <EnvelopeList />
      </div>
    </div>
  );
}
