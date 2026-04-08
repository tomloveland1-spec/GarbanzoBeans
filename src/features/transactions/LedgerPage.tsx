import { useEffect } from 'react';
import OFXImporter from './OFXImporter';
import LedgerView from './LedgerView';
import { useTransactionStore } from '@/stores/useTransactionStore';

export default function LedgerPage() {
  const loadTransactions = useTransactionStore(s => s.loadTransactions);

  useEffect(() => {
    loadTransactions();
  }, [loadTransactions]);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <OFXImporter />
      <LedgerView />
    </div>
  );
}
