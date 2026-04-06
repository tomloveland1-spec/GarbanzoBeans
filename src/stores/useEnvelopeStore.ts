import { create } from 'zustand';

interface EnvelopeState {
  envelopes: never[];   // typed properly in Story 2.1
  isWriting: boolean;
}

export const useEnvelopeStore = create<EnvelopeState>(() => ({
  envelopes: [],
  isWriting: false,
}));
