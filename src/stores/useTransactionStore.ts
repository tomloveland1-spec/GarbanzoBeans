import { create } from 'zustand';

interface TransactionState {
  transactions: never[];   // typed properly in Story 3.1
  importQueue: never[];
  isWriting: boolean;
}

export const useTransactionStore = create<TransactionState>(() => ({
  transactions: [],
  importQueue: [],
  isWriting: false,
}));
