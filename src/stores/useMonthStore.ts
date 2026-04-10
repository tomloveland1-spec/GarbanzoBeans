import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import type { Month, MonthStatus, AdvanceTurnTheMonthStepInput, CloseMonthInput, AppError, BillDateEntry, ConfirmBillDatesInput, IncomeTimingEntry, ConfirmIncomeTimingInput } from '@/lib/types';

interface MonthState {
  currentMonth: Month | null;
  monthStatus: MonthStatus;
  isWriting: boolean;
  error: string | null;
  loadMonthStatus: () => Promise<void>;
  advanceStep: (currentStep: number) => Promise<void>;
  closeMonth: (allocations: Array<{ id: number; allocatedCents: number }>) => Promise<void>;
  confirmBillDates: (dates: BillDateEntry[]) => Promise<void>;
  confirmIncomeTiming: (entries: IncomeTimingEntry[]) => Promise<void>;
}

export const useMonthStore = create<MonthState>((set, get) => ({
  currentMonth: null,
  monthStatus: 'open',  // optimistic default; overwritten by loadMonthStatus
  isWriting: false,
  error: null,

  loadMonthStatus: async () => {
    try {
      let month = await invoke<Month | null>('get_current_month');
      if (!month) {
        // No months record yet — create the first one
        month = await invoke<Month>('open_month');
      }
      // If open, check whether calendar has passed month end → transitions to closing:step-1 if so
      if (month.status === 'open') {
        month = await invoke<Month>('begin_turn_the_month', { input: { monthId: month.id } });
      }
      set({
        currentMonth: month,
        monthStatus: month.status as MonthStatus,
        error: null,
      });
    } catch (e) {
      const err = e as AppError;
      set({ error: err.message ?? 'Failed to load month status' });
    }
  },

  advanceStep: async (currentStep: number) => {
    const { currentMonth } = get();
    if (!currentMonth) return;
    set({ isWriting: true });
    try {
      const input: AdvanceTurnTheMonthStepInput = {
        monthId: currentMonth.id,
        currentStep,
      };
      const updated = await invoke<Month>('advance_turn_the_month_step', { input });
      set({
        currentMonth: updated,
        monthStatus: updated.status as MonthStatus,
        isWriting: false,
        error: null,
      });
    } catch (e) {
      const err = e as AppError;
      set({ isWriting: false, error: err.message ?? 'Failed to advance step' });
      throw e;
    }
  },

  closeMonth: async (allocations: Array<{ id: number; allocatedCents: number }>) => {
    const { currentMonth } = get();
    if (!currentMonth) return;
    set({ isWriting: true });
    try {
      const input: CloseMonthInput = { monthId: currentMonth.id, allocations };
      const newMonth = await invoke<Month>('close_month', { input });
      set({
        currentMonth: newMonth,
        monthStatus: newMonth.status as MonthStatus,
        isWriting: false,
        error: null,
      });
    } catch (e) {
      const err = e as AppError;
      set({ isWriting: false, error: err.message ?? 'Failed to close month' });
      throw e;
    }
  },

  confirmBillDates: async (dates: BillDateEntry[]) => {
    const { currentMonth } = get();
    if (!currentMonth) return;
    set({ isWriting: true });
    try {
      const input: ConfirmBillDatesInput = {
        monthId: currentMonth.id,
        dates,
      };
      const updated = await invoke<Month>('confirm_bill_dates', { input });
      set({
        currentMonth: updated,
        monthStatus: updated.status as MonthStatus,
        isWriting: false,
        error: null,
      });
    } catch (e) {
      const err = e as AppError;
      set({ isWriting: false, error: err.message ?? 'Failed to confirm bill dates' });
      throw e;
    }
  },

  confirmIncomeTiming: async (entries: IncomeTimingEntry[]) => {
    const { currentMonth } = get();
    if (!currentMonth) return;
    set({ isWriting: true });
    try {
      const input: ConfirmIncomeTimingInput = {
        monthId: currentMonth.id,
        entries,
      };
      const updated = await invoke<Month>('confirm_income_timing', { input });
      set({
        currentMonth: updated,
        monthStatus: updated.status as MonthStatus,
        isWriting: false,
        error: null,
      });
    } catch (e) {
      const err = e as AppError;
      set({ isWriting: false, error: err.message ?? 'Failed to confirm income timing' });
      throw e;
    }
  },
}));
