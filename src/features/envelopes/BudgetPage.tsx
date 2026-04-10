import EnvelopeList from './EnvelopeList';
import WealthPanel from '@/features/savings/WealthPanel';

export default function BudgetPage() {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <WealthPanel />
      {/* Envelope list — fills remaining height */}
      <div className="flex-1 overflow-y-auto">
        <EnvelopeList />
      </div>
    </div>
  );
}
