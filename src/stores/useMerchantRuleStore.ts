import { create } from 'zustand';

interface MerchantRuleState {
  rules: never[];   // typed properly in Story 4.1
  isWriting: boolean;
}

export const useMerchantRuleStore = create<MerchantRuleState>(() => ({
  rules: [],
  isWriting: false,
}));
