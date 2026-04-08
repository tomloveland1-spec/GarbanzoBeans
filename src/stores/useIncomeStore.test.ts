import { vi, describe, it, expect, beforeEach } from 'vitest';
import { useIncomeStore } from './useIncomeStore';
import type { IncomeEntry } from '@/lib/types';

// Mock Tauri invoke so tests don't require a running Tauri backend
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

import { invoke } from '@tauri-apps/api/core';
const mockInvoke = vi.mocked(invoke);

const makeEntry = (overrides: Partial<IncomeEntry> = {}): IncomeEntry => ({
  id: 1,
  name: '1st Paycheck',
  amountCents: 250000,
  ...overrides,
});

describe('useIncomeStore', () => {
  beforeEach(() => {
    useIncomeStore.setState({ entries: [], isWriting: false, error: null });
    vi.clearAllMocks();
  });

  it('initial state has entries: [], isWriting: false, error: null', () => {
    expect(useIncomeStore.getState().entries).toEqual([]);
    expect(useIncomeStore.getState().isWriting).toBe(false);
    expect(useIncomeStore.getState().error).toBeNull();
  });

  describe('loadIncomeEntries', () => {
    it('populates entries and clears isWriting on success', async () => {
      const mockEntries = [makeEntry()];
      mockInvoke.mockResolvedValueOnce(mockEntries);

      await useIncomeStore.getState().loadIncomeEntries();

      const { entries, isWriting, error } = useIncomeStore.getState();
      expect(entries).toEqual(mockEntries);
      expect(isWriting).toBe(false);
      expect(error).toBeNull();
    });

    it('sets error and clears isWriting on failure', async () => {
      mockInvoke.mockRejectedValueOnce({ code: 'DB_ERROR', message: 'oops' });

      await useIncomeStore.getState().loadIncomeEntries();

      const { entries, isWriting, error } = useIncomeStore.getState();
      expect(entries).toEqual([]);
      expect(isWriting).toBe(false);
      expect(error).toEqual({ code: 'DB_ERROR', message: 'oops' });
    });
  });

  describe('createIncomeEntry', () => {
    it('optimistically adds entry, then replaces with DB response', async () => {
      const created = makeEntry({ id: 42, name: '2nd Paycheck', amountCents: 180000 });
      mockInvoke.mockResolvedValueOnce(created);

      await useIncomeStore.getState().createIncomeEntry({ name: '2nd Paycheck', amountCents: 180000 });

      const { entries, isWriting, error } = useIncomeStore.getState();
      expect(entries).toHaveLength(1);
      expect(entries[0]).toEqual(created);
      expect(isWriting).toBe(false);
      expect(error).toBeNull();
    });

    it('shows optimistic entry immediately before invoke resolves', async () => {
      let resolveInvoke!: (value: IncomeEntry) => void;
      mockInvoke.mockReturnValueOnce(new Promise((res) => { resolveInvoke = res; }) as Promise<unknown>);

      const promise = useIncomeStore.getState().createIncomeEntry({ name: 'Bonus', amountCents: 50000 });

      // Before resolve: optimistic entry present with a temp negative id
      const { entries: before } = useIncomeStore.getState();
      expect(before).toHaveLength(1);
      expect(before[0]!.id).toBeLessThan(0);
      expect(before[0]!.name).toBe('Bonus');

      resolveInvoke(makeEntry({ id: 99, name: 'Bonus', amountCents: 50000 }));
      await promise;

      // After resolve: temp entry replaced with real id
      expect(useIncomeStore.getState().entries[0]!.id).toBe(99);
    });

    it('rolls back on failure and sets error', async () => {
      const existing = makeEntry({ id: 1 });
      useIncomeStore.setState({ entries: [existing] });
      mockInvoke.mockRejectedValueOnce({ code: 'DB_ERROR', message: 'fail' });

      await useIncomeStore.getState().createIncomeEntry({ name: 'Bad', amountCents: 0 });

      const { entries, error } = useIncomeStore.getState();
      expect(entries).toEqual([existing]);
      expect(error).toEqual({ code: 'DB_ERROR', message: 'fail' });
    });
  });

  describe('deleteIncomeEntry', () => {
    it('optimistically removes entry, then confirms on success', async () => {
      const e1 = makeEntry({ id: 1, name: '1st Paycheck' });
      const e2 = makeEntry({ id: 2, name: '2nd Paycheck' });
      useIncomeStore.setState({ entries: [e1, e2] });
      mockInvoke.mockResolvedValueOnce(undefined);

      await useIncomeStore.getState().deleteIncomeEntry(1);

      const { entries, isWriting, error } = useIncomeStore.getState();
      expect(entries).toHaveLength(1);
      expect(entries[0]!.id).toBe(2);
      expect(isWriting).toBe(false);
      expect(error).toBeNull();
    });

    it('rolls back on failure and sets error', async () => {
      const e1 = makeEntry({ id: 1 });
      useIncomeStore.setState({ entries: [e1] });
      mockInvoke.mockRejectedValueOnce({ code: 'ENTRY_NOT_FOUND', message: 'not found' });

      await useIncomeStore.getState().deleteIncomeEntry(1);

      const { entries, error } = useIncomeStore.getState();
      expect(entries).toEqual([e1]);
      expect(error).toEqual({ code: 'ENTRY_NOT_FOUND', message: 'not found' });
    });
  });
});
