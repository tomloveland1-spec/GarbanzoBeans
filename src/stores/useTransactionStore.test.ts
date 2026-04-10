import { vi, describe, it, expect, beforeEach } from 'vitest';
import { useTransactionStore } from './useTransactionStore';
import type { Transaction, ImportResult } from '@/lib/types';

// Mock Tauri invoke so tests don't require a running Tauri backend
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

import { invoke } from '@tauri-apps/api/core';
const mockInvoke = vi.mocked(invoke);

// Mock useMerchantRuleStore so importOFX tests can assert loadRules is called
const mockLoadRules = vi.fn().mockResolvedValue(undefined);
vi.mock('@/stores/useMerchantRuleStore', () => ({
  useMerchantRuleStore: {
    getState: () => ({ loadRules: mockLoadRules }),
  },
}));

const makeTx = (overrides: Partial<Transaction> = {}): Transaction => ({
  id: 1,
  payee: 'Grocery Store',
  amountCents: 5000,
  date: '2026-04-05',
  envelopeId: null,
  isCleared: false,
  importBatchId: null,
  createdAt: '2026-04-05T10:00:00Z',
  ...overrides,
});

describe('useTransactionStore', () => {
  beforeEach(() => {
    useTransactionStore.setState({ transactions: [], isWriting: false, error: null, importResult: null, importError: null });
    vi.clearAllMocks();
    mockLoadRules.mockClear();
  });

  it('initial state has transactions: [], isWriting: false, error: null', () => {
    expect(useTransactionStore.getState().transactions).toEqual([]);
    expect(useTransactionStore.getState().isWriting).toBe(false);
    expect(useTransactionStore.getState().error).toBeNull();
  });

  describe('clearedTransactions / unclearedTransactions', () => {
    it('returns correct filtered views', () => {
      const cleared = makeTx({ id: 1, isCleared: true });
      const uncleared = makeTx({ id: 2, isCleared: false });
      useTransactionStore.setState({ transactions: [cleared, uncleared] });

      expect(useTransactionStore.getState().clearedTransactions()).toEqual([cleared]);
      expect(useTransactionStore.getState().unclearedTransactions()).toEqual([uncleared]);
    });
  });

  describe('loadTransactions', () => {
    it('populates transactions and clears isWriting on success', async () => {
      const mockTxs = [makeTx()];
      mockInvoke.mockResolvedValueOnce(mockTxs);

      await useTransactionStore.getState().loadTransactions('2026-04');

      const { transactions, isWriting, error } = useTransactionStore.getState();
      expect(transactions).toEqual(mockTxs);
      expect(isWriting).toBe(false);
      expect(error).toBeNull();
    });

    it('sets error and clears isWriting on failure', async () => {
      mockInvoke.mockRejectedValueOnce({ code: 'DB_ERROR', message: 'oops' });

      await useTransactionStore.getState().loadTransactions('2026-04');

      const { transactions, isWriting, error } = useTransactionStore.getState();
      expect(transactions).toEqual([]);
      expect(isWriting).toBe(false);
      expect(error).toEqual({ code: 'DB_ERROR', message: 'oops' });
    });

    it('calls invoke with monthKey when provided', async () => {
      mockInvoke.mockResolvedValueOnce([]);

      await useTransactionStore.getState().loadTransactions('2026-04');

      expect(mockInvoke).toHaveBeenCalledWith('get_transactions', { monthKey: '2026-04' });
    });

    it('calls invoke with undefined monthKey when not provided', async () => {
      mockInvoke.mockResolvedValueOnce([]);

      await useTransactionStore.getState().loadTransactions();

      expect(mockInvoke).toHaveBeenCalledWith('get_transactions', { monthKey: undefined });
    });
  });

  describe('createTransaction', () => {
    it('optimistically adds transaction, then replaces with DB response', async () => {
      const created = makeTx({ id: 42, payee: 'Coffee Shop', amountCents: 500 });
      mockInvoke.mockResolvedValueOnce(created);

      await useTransactionStore.getState().createTransaction({
        payee: 'Coffee Shop',
        amountCents: 500,
        date: '2026-04-06',
      });

      const { transactions, isWriting, error } = useTransactionStore.getState();
      expect(transactions).toHaveLength(1);
      expect(transactions[0]).toEqual(created);
      expect(isWriting).toBe(false);
      expect(error).toBeNull();
    });

    it('shows optimistic entry immediately before invoke resolves', async () => {
      let resolveInvoke!: (value: Transaction) => void;
      mockInvoke.mockReturnValueOnce(new Promise((res) => { resolveInvoke = res; }) as Promise<unknown>);

      const promise = useTransactionStore.getState().createTransaction({
        payee: 'Pending Payee',
        amountCents: 1000,
        date: '2026-04-07',
      });

      // Before resolve: optimistic entry present with a temp negative id
      const { transactions: before } = useTransactionStore.getState();
      expect(before).toHaveLength(1);
      expect(before[0]!.id).toBeLessThan(0);
      expect(before[0]!.payee).toBe('Pending Payee');

      resolveInvoke(makeTx({ id: 99, payee: 'Pending Payee', amountCents: 1000 }));
      await promise;

      // After resolve: temp entry replaced with real id
      expect(useTransactionStore.getState().transactions[0]!.id).toBe(99);
    });

    it('rolls back on failure and sets error', async () => {
      const existing = makeTx({ id: 1 });
      useTransactionStore.setState({ transactions: [existing] });
      mockInvoke.mockRejectedValueOnce({ code: 'DB_ERROR', message: 'fail' });

      await useTransactionStore.getState().createTransaction({
        payee: 'Bad',
        amountCents: 0,
        date: '2026-04-07',
      });

      const { transactions, error } = useTransactionStore.getState();
      expect(transactions).toEqual([existing]);
      expect(error).toEqual({ code: 'DB_ERROR', message: 'fail' });
    });

    it('sets isCleared false and envelopeId null by default on optimistic entry', async () => {
      mockInvoke.mockReturnValueOnce(new Promise(() => {})); // never resolves

      useTransactionStore.getState().createTransaction({
        payee: 'Test',
        amountCents: 100,
        date: '2026-04-07',
      });

      const tx = useTransactionStore.getState().transactions[0]!;
      expect(tx.isCleared).toBe(false);
      expect(tx.envelopeId).toBeNull();
      expect(tx.importBatchId).toBeNull();
    });
  });

  describe('importOFX', () => {
    const makeImportResult = (overrides: Partial<ImportResult> = {}): ImportResult => ({
      count: 2,
      batchId: 'import_1234567890',
      latestDate: '2026-10-15',
      transactions: [
        makeTx({ id: 10, payee: 'Store A', importBatchId: 'import_1234567890', isCleared: true }),
        makeTx({ id: 11, payee: 'Store B', importBatchId: 'import_1234567890', isCleared: true }),
      ],
      matchedTransactions: [],
      categorizedAnnotations: {},
      uncategorizedIds: [],
      conflictedIds: [],
      ...overrides,
    });

    it('appends returned transactions to existing list', async () => {
      const existing = makeTx({ id: 1 });
      useTransactionStore.setState({ transactions: [existing] });
      const result = makeImportResult();
      mockInvoke.mockResolvedValueOnce(result);

      await useTransactionStore.getState().importOFX('/path/to/file.ofx');

      const { transactions } = useTransactionStore.getState();
      expect(transactions).toHaveLength(3);
      expect(transactions[0]).toEqual(existing);
      expect(transactions[1]!.payee).toBe('Store A');
      expect(transactions[2]!.payee).toBe('Store B');
    });

    it('sets importResult on success', async () => {
      const result = makeImportResult();
      mockInvoke.mockResolvedValueOnce(result);

      await useTransactionStore.getState().importOFX('/path/to/file.ofx');

      expect(useTransactionStore.getState().importResult).toEqual(result);
      expect(useTransactionStore.getState().isWriting).toBe(false);
    });

    it('sets importError on failure', async () => {
      mockInvoke.mockRejectedValueOnce({ code: 'OFX_PARSE_ERROR', message: 'No transactions found' });

      await useTransactionStore.getState().importOFX('/path/to/bad.ofx');

      expect(useTransactionStore.getState().importError).toBe('No transactions found');
      expect(useTransactionStore.getState().importResult).toBeNull();
      expect(useTransactionStore.getState().isWriting).toBe(false);
    });

    it('does not change transactions on failure', async () => {
      const existing = makeTx({ id: 1 });
      useTransactionStore.setState({ transactions: [existing] });
      mockInvoke.mockRejectedValueOnce({ code: 'OFX_READ_ERROR', message: 'File not found' });

      await useTransactionStore.getState().importOFX('/path/to/missing.ofx');

      expect(useTransactionStore.getState().transactions).toEqual([existing]);
    });

    it('clearImportResult resets importResult and importError', () => {
      useTransactionStore.setState({
        importResult: makeImportResult(),
        importError: 'some error',
      });

      useTransactionStore.getState().clearImportResult();

      expect(useTransactionStore.getState().importResult).toBeNull();
      expect(useTransactionStore.getState().importError).toBeNull();
    });

    it('importOFX updates matched transactions in-place', async () => {
      const existingUncleared = makeTx({ id: 5, payee: 'Kroger', isCleared: false });
      useTransactionStore.setState({ transactions: [existingUncleared] });

      const clearedVersion = makeTx({ id: 5, payee: 'Kroger', isCleared: true, importBatchId: 'import_abc' });
      const result = makeImportResult({
        count: 1,
        transactions: [],
        matchedTransactions: [clearedVersion],
      });
      mockInvoke.mockResolvedValueOnce(result);

      await useTransactionStore.getState().importOFX('/path/to/file.ofx');

      const { transactions } = useTransactionStore.getState();
      expect(transactions).toHaveLength(1);
      expect(transactions[0]!.id).toBe(5);
      expect(transactions[0]!.isCleared).toBe(true);
    });

    it('importResult preserves categorizedAnnotations and uncategorizedIds from backend', async () => {
      const categorizedTx = makeTx({ id: 20, payee: 'KROGER #123', envelopeId: 7, importBatchId: 'import_abc', isCleared: true });
      const uncategorizedTx = makeTx({ id: 21, payee: 'UNKNOWN STORE', envelopeId: null, importBatchId: 'import_abc', isCleared: true });
      const result = makeImportResult({
        count: 2,
        transactions: [categorizedTx, uncategorizedTx],
        matchedTransactions: [],
        categorizedAnnotations: { '20': 'Kroger' },
        uncategorizedIds: [21],
      });
      mockInvoke.mockResolvedValueOnce(result);

      await useTransactionStore.getState().importOFX('/path/to/file.ofx');

      const { importResult } = useTransactionStore.getState();
      expect(importResult).not.toBeNull();
      expect(importResult!.categorizedAnnotations['20']).toBe('Kroger');
      expect(importResult!.uncategorizedIds).toEqual([21]);
    });

    it('importOFX appends new and updates matched transactions together', async () => {
      const existingUncleared = makeTx({ id: 5, payee: 'Kroger', isCleared: false });
      useTransactionStore.setState({ transactions: [existingUncleared] });

      const clearedVersion = makeTx({ id: 5, payee: 'Kroger', isCleared: true, importBatchId: 'import_abc' });
      const newTx = makeTx({ id: 10, payee: 'New Store', isCleared: true, importBatchId: 'import_abc' });
      const result = makeImportResult({
        count: 2,
        transactions: [newTx],
        matchedTransactions: [clearedVersion],
      });
      mockInvoke.mockResolvedValueOnce(result);

      await useTransactionStore.getState().importOFX('/path/to/file.ofx');

      const { transactions } = useTransactionStore.getState();
      expect(transactions).toHaveLength(2);
      expect(transactions.find(t => t.id === 5)!.isCleared).toBe(true);
      expect(transactions.find(t => t.id === 10)).toBeDefined();
    });

    describe('merchant rule refresh (AC1)', () => {
      it('calls loadRules after a successful import so match_count stays current', async () => {
        mockInvoke.mockResolvedValueOnce(makeImportResult());

        await useTransactionStore.getState().importOFX('/path/to/file.ofx');

        expect(mockLoadRules).toHaveBeenCalledOnce();
      });

      it('does NOT call loadRules when the import fails', async () => {
        mockInvoke.mockRejectedValueOnce({ code: 'OFX_PARSE_ERROR', message: 'bad file' });

        await useTransactionStore.getState().importOFX('/path/to/bad.ofx');

        expect(mockLoadRules).not.toHaveBeenCalled();
      });
    });
  });

  describe('updateTransaction', () => {
    it('replaces the updated transaction in the list on success', async () => {
      const original = makeTx({ id: 5, payee: 'Old Payee', isCleared: false });
      const updated = makeTx({ id: 5, payee: 'New Payee', isCleared: true });
      useTransactionStore.setState({ transactions: [original] });
      mockInvoke.mockResolvedValueOnce(updated);

      await useTransactionStore.getState().updateTransaction({ id: 5, payee: 'New Payee', isCleared: true });

      const { transactions, isWriting, error } = useTransactionStore.getState();
      expect(transactions).toHaveLength(1);
      expect(transactions[0]).toEqual(updated);
      expect(isWriting).toBe(false);
      expect(error).toBeNull();
    });

    it('rolls back on failure and sets error', async () => {
      const original = makeTx({ id: 5 });
      useTransactionStore.setState({ transactions: [original] });
      mockInvoke.mockRejectedValueOnce({ code: 'TRANSACTION_NOT_FOUND', message: 'not found' });

      await useTransactionStore.getState().updateTransaction({ id: 5, payee: 'Ghost' });

      const { transactions, error } = useTransactionStore.getState();
      expect(transactions).toEqual([original]);
      expect(error).toEqual({ code: 'TRANSACTION_NOT_FOUND', message: 'not found' });
    });

    describe('queue removal on category assignment', () => {
      const makeImportResultWithQueue = (): ImportResult => ({
        count: 3,
        batchId: 'import_abc',
        latestDate: '2026-04-08',
        transactions: [],
        matchedTransactions: [],
        categorizedAnnotations: {},
        uncategorizedIds: [10, 11],
        conflictedIds: [12],
      });

      it('removes transaction ID from uncategorizedIds when envelopeId is assigned', async () => {
        const tx = makeTx({ id: 10, envelopeId: null });
        const updated = makeTx({ id: 10, envelopeId: 5 });
        useTransactionStore.setState({
          transactions: [tx],
          importResult: makeImportResultWithQueue(),
        });
        mockInvoke.mockResolvedValueOnce(updated);

        await useTransactionStore.getState().updateTransaction({ id: 10, envelopeId: 5 });

        const { importResult } = useTransactionStore.getState();
        expect(importResult!.uncategorizedIds).not.toContain(10);
        expect(importResult!.uncategorizedIds).toContain(11);
      });

      it('removes transaction ID from conflictedIds when envelopeId is assigned', async () => {
        const tx = makeTx({ id: 12, envelopeId: null });
        const updated = makeTx({ id: 12, envelopeId: 5 });
        useTransactionStore.setState({
          transactions: [tx],
          importResult: makeImportResultWithQueue(),
        });
        mockInvoke.mockResolvedValueOnce(updated);

        await useTransactionStore.getState().updateTransaction({ id: 12, envelopeId: 5 });

        const { importResult } = useTransactionStore.getState();
        expect(importResult!.conflictedIds).not.toContain(12);
      });

      it('does NOT alter uncategorizedIds or conflictedIds when clearEnvelopeId is used', async () => {
        const tx = makeTx({ id: 10, envelopeId: 5 });
        const updated = makeTx({ id: 10, envelopeId: null });
        useTransactionStore.setState({
          transactions: [tx],
          importResult: makeImportResultWithQueue(),
        });
        mockInvoke.mockResolvedValueOnce(updated);

        await useTransactionStore.getState().updateTransaction({ id: 10, clearEnvelopeId: true });

        const { importResult } = useTransactionStore.getState();
        expect(importResult!.uncategorizedIds).toEqual([10, 11]);
        expect(importResult!.conflictedIds).toEqual([12]);
      });

      it('leaves other IDs untouched when removing a specific ID', async () => {
        const tx = makeTx({ id: 11, envelopeId: null });
        const updated = makeTx({ id: 11, envelopeId: 3 });
        useTransactionStore.setState({
          transactions: [tx],
          importResult: makeImportResultWithQueue(),
        });
        mockInvoke.mockResolvedValueOnce(updated);

        await useTransactionStore.getState().updateTransaction({ id: 11, envelopeId: 3 });

        const { importResult } = useTransactionStore.getState();
        expect(importResult!.uncategorizedIds).toEqual([10]);
        expect(importResult!.conflictedIds).toEqual([12]);
      });
    });
  });
});
