import { create } from 'zustand';

interface SavingsState {
  reconciliationHistory: never[];   // typed properly in Story 5.1
  savingsFlow: never[];
  isWriting: boolean;
}

export const useSavingsStore = create<SavingsState>(() => ({
  reconciliationHistory: [],
  savingsFlow: [],
  isWriting: false,
}));
