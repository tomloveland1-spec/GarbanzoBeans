import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import RunwayGauge from './RunwayGauge';
import SavingsFlowChart from './SavingsFlowChart';
import ReconciliationForm from './ReconciliationForm';

const STORAGE_KEY = 'wealth-panel-collapsed';

export default function WealthPanel() {
  const [isCollapsed, setIsCollapsed] = useState(
    () => localStorage.getItem(STORAGE_KEY) === 'true',
  );

  const toggle = () => {
    const next = !isCollapsed;
    localStorage.setItem(STORAGE_KEY, String(next));
    setIsCollapsed(next);
  };

  return (
    <div
      className="shrink-0 border-b"
      style={{ borderColor: 'var(--color-border)' }}
      data-testid="wealth-panel"
    >
      {isCollapsed ? (
        <div className="flex items-center justify-between px-3 py-2">
          <span
            className="type-label"
            style={{ color: 'var(--color-text-secondary)' }}
          >
            Wealth Panel
          </span>
          <button
            onClick={toggle}
            aria-label="Expand wealth panel"
            className="p-1 rounded"
            style={{ color: 'var(--color-text-secondary)' }}
          >
            <ChevronDown className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <>
          <div className="flex items-start gap-4 p-3">
            <RunwayGauge />
            <SavingsFlowChart />
            <div className="flex-1">
              <ReconciliationForm />
            </div>
          </div>
          <div className="flex justify-end px-3 pb-1">
            <button
              onClick={toggle}
              aria-label="Collapse wealth panel"
              className="p-1 rounded"
              style={{ color: 'var(--color-text-secondary)' }}
            >
              <ChevronUp className="h-4 w-4" />
            </button>
          </div>
        </>
      )}
    </div>
  );
}
