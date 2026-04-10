import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useMonthStore } from './useMonthStore';
import type { Month } from '@/lib/types';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

import { invoke } from '@tauri-apps/api/core';

const mockMonth = (overrides: Partial<Month> = {}): Month => ({
  id: 1,
  year: 2026,
  month: 4,
  status: 'open',
  openedAt: '2026-04-01T00:00:00Z',
  closedAt: null,
  ...overrides,
});

describe('useMonthStore', () => {
  beforeEach(() => {
    useMonthStore.setState({
      currentMonth: null,
      monthStatus: 'open',
      isWriting: false,
      error: null,
    });
    vi.clearAllMocks();
  });

  it('initializes with monthStatus: open', () => {
    expect(useMonthStore.getState().monthStatus).toBe('open');
  });

  it('initializes with isWriting: false', () => {
    expect(useMonthStore.getState().isWriting).toBe(false);
  });

  it('loadMonthStatus: sets month from get_current_month', async () => {
    const openMonth = mockMonth({ status: 'open' });
    // get_current_month returns open → begin_turn_the_month also returns open (still in month)
    vi.mocked(invoke)
      .mockResolvedValueOnce(openMonth)   // get_current_month
      .mockResolvedValueOnce(openMonth);  // begin_turn_the_month
    await useMonthStore.getState().loadMonthStatus();
    expect(useMonthStore.getState().currentMonth).toEqual(openMonth);
    expect(useMonthStore.getState().monthStatus).toBe('open');
  });

  it('loadMonthStatus: calls open_month when get_current_month returns null', async () => {
    const newMonth = mockMonth();
    vi.mocked(invoke)
      .mockResolvedValueOnce(null)       // get_current_month
      .mockResolvedValueOnce(newMonth)   // open_month
      .mockResolvedValueOnce(newMonth);  // begin_turn_the_month
    await useMonthStore.getState().loadMonthStatus();
    expect(invoke).toHaveBeenCalledWith('open_month');
    expect(useMonthStore.getState().currentMonth).toEqual(newMonth);
  });

  it('loadMonthStatus: sets closing status when month is closing', async () => {
    const month = mockMonth({ status: 'closing:step-2' });
    // Closing status — begin_turn_the_month is NOT called
    vi.mocked(invoke).mockResolvedValueOnce(month);
    await useMonthStore.getState().loadMonthStatus();
    expect(useMonthStore.getState().monthStatus).toBe('closing:step-2');
  });

  it('loadMonthStatus: calls begin_turn_the_month when month is open', async () => {
    const openMonth = mockMonth({ status: 'open' });
    const closingMonth = mockMonth({ status: 'closing:step-1' });
    vi.mocked(invoke)
      .mockResolvedValueOnce(openMonth)     // get_current_month
      .mockResolvedValueOnce(closingMonth); // begin_turn_the_month
    await useMonthStore.getState().loadMonthStatus();
    expect(useMonthStore.getState().monthStatus).toBe('closing:step-1');
  });

  it('loadMonthStatus: does not call begin_turn_the_month when already closing', async () => {
    const closingMonth = mockMonth({ status: 'closing:step-2' });
    vi.mocked(invoke).mockResolvedValueOnce(closingMonth); // get_current_month only
    await useMonthStore.getState().loadMonthStatus();
    // Only one invoke call (get_current_month); begin_turn_the_month not called
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(useMonthStore.getState().monthStatus).toBe('closing:step-2');
  });

  it('loadMonthStatus: keeps open status when begin_turn_the_month returns open', async () => {
    const openMonth = mockMonth({ status: 'open' });
    vi.mocked(invoke)
      .mockResolvedValueOnce(openMonth)   // get_current_month
      .mockResolvedValueOnce(openMonth);  // begin_turn_the_month returns open (still in month)
    await useMonthStore.getState().loadMonthStatus();
    expect(useMonthStore.getState().monthStatus).toBe('open');
  });

  it('loadMonthStatus: sets error on failure', async () => {
    vi.mocked(invoke).mockRejectedValueOnce({ code: 'DB_LOCK_POISON', message: 'Poisoned' });
    await useMonthStore.getState().loadMonthStatus();
    expect(useMonthStore.getState().error).toBe('Poisoned');
  });

  it('advanceStep: updates monthStatus to next step', async () => {
    const current = mockMonth({ status: 'closing:step-1' });
    const advanced = mockMonth({ status: 'closing:step-2' });
    useMonthStore.setState({ currentMonth: current, monthStatus: 'closing:step-1' });
    vi.mocked(invoke).mockResolvedValueOnce(advanced);
    await useMonthStore.getState().advanceStep(1);
    expect(useMonthStore.getState().monthStatus).toBe('closing:step-2');
    expect(useMonthStore.getState().isWriting).toBe(false);
    expect(useMonthStore.getState().error).toBeNull();
  });

  it('closeMonth: sets monthStatus to open after close', async () => {
    const current = mockMonth({ id: 1, status: 'closing:step-4' });
    const newMonth = mockMonth({ id: 2, year: 2026, month: 5, status: 'open' });
    useMonthStore.setState({ currentMonth: current, monthStatus: 'closing:step-4' });
    vi.mocked(invoke).mockResolvedValueOnce(newMonth);
    await useMonthStore.getState().closeMonth([]);
    expect(useMonthStore.getState().monthStatus).toBe('open');
    expect(useMonthStore.getState().currentMonth?.month).toBe(5);
    expect(useMonthStore.getState().isWriting).toBe(false);
    expect(vi.mocked(invoke)).toHaveBeenCalledWith('close_month', { input: { monthId: 1, allocations: [] } });
  });

  it('advanceStep: sets error and re-throws on failure', async () => {
    const current = mockMonth({ status: 'closing:step-1' });
    useMonthStore.setState({ currentMonth: current, monthStatus: 'closing:step-1' });
    vi.mocked(invoke).mockRejectedValueOnce({ code: 'INVALID_STEP_TRANSITION', message: 'Already advanced' });
    await expect(useMonthStore.getState().advanceStep(1)).rejects.toBeDefined();
    expect(useMonthStore.getState().isWriting).toBe(false);
    expect(useMonthStore.getState().error).toBeTruthy();
  });

  it('closeMonth: sets error and re-throws on failure', async () => {
    const current = mockMonth({ id: 1, status: 'closing:step-4' });
    useMonthStore.setState({ currentMonth: current, monthStatus: 'closing:step-4' });
    vi.mocked(invoke).mockRejectedValueOnce({ code: 'MONTH_NOT_FOUND', message: 'Not found' });
    await expect(useMonthStore.getState().closeMonth([])).rejects.toBeDefined();
    expect(useMonthStore.getState().isWriting).toBe(false);
    expect(useMonthStore.getState().error).toBeTruthy();
  });

  it('advanceStep: does nothing when currentMonth is null', async () => {
    useMonthStore.setState({ currentMonth: null });
    await useMonthStore.getState().advanceStep(1);
    expect(invoke).not.toHaveBeenCalled();
  });

  it('closeMonth: does nothing when currentMonth is null', async () => {
    useMonthStore.setState({ currentMonth: null });
    await useMonthStore.getState().closeMonth([]);
    expect(invoke).not.toHaveBeenCalled();
  });

  it('confirmBillDates: updates monthStatus to closing:step-3', async () => {
    const current = mockMonth({ status: 'closing:step-2' });
    const updated = mockMonth({ status: 'closing:step-3' });
    useMonthStore.setState({ currentMonth: current, monthStatus: 'closing:step-2' });
    vi.mocked(invoke).mockResolvedValueOnce(updated);
    await useMonthStore.getState().confirmBillDates([]);
    expect(useMonthStore.getState().monthStatus).toBe('closing:step-3');
    expect(useMonthStore.getState().isWriting).toBe(false);
    expect(useMonthStore.getState().error).toBeNull();
  });

  it('confirmBillDates: calls confirm_bill_dates Tauri command with correct input shape', async () => {
    const current = mockMonth({ id: 42, status: 'closing:step-2' });
    const updated = mockMonth({ status: 'closing:step-3' });
    useMonthStore.setState({ currentMonth: current, monthStatus: 'closing:step-2' });
    vi.mocked(invoke).mockResolvedValueOnce(updated);
    await useMonthStore.getState().confirmBillDates([{ envelopeId: 1, dueDay: 15 }]);
    expect(invoke).toHaveBeenCalledWith('confirm_bill_dates', {
      input: { monthId: 42, dates: [{ envelopeId: 1, dueDay: 15 }] },
    });
  });

  it('confirmBillDates: sets error and re-throws on failure', async () => {
    const current = mockMonth({ status: 'closing:step-2' });
    useMonthStore.setState({ currentMonth: current, monthStatus: 'closing:step-2' });
    vi.mocked(invoke).mockRejectedValueOnce({ code: 'INVALID_STEP_TRANSITION', message: 'Already advanced' });
    await expect(useMonthStore.getState().confirmBillDates([])).rejects.toBeDefined();
    expect(useMonthStore.getState().isWriting).toBe(false);
    expect(useMonthStore.getState().error).toBeTruthy();
  });

  it('confirmBillDates: does nothing when currentMonth is null', async () => {
    useMonthStore.setState({ currentMonth: null });
    await useMonthStore.getState().confirmBillDates([]);
    expect(invoke).not.toHaveBeenCalled();
  });
});
