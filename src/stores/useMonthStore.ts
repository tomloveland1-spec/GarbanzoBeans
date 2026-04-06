import { create } from 'zustand';
import type { MonthStatus } from '@/lib/types';

interface MonthState {
  monthStatus: MonthStatus;
  isWriting: boolean;
}

export const useMonthStore = create<MonthState>(() => ({
  monthStatus: 'open',  // default; months table doesn't exist until Epic 6
  isWriting: false,
}));
