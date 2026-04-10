import { vi, describe, it, expect, beforeEach } from 'vitest';
import { useEnvelopeStore } from './useEnvelopeStore';
import type { Envelope } from '@/lib/types';

// Mock Tauri invoke so tests don't require a running Tauri backend
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

import { invoke } from '@tauri-apps/api/core';
const mockInvoke = vi.mocked(invoke);

const makeEnvelope = (overrides: Partial<Envelope> = {}): Envelope => ({
  id: 1,
  name: 'Groceries',
  type: 'Rolling',
  priority: 'Need',
  allocatedCents: 50000,
  monthId: null,
  createdAt: '2026-01-01T00:00:00Z',
  isSavings: false,
  ...overrides,
});

describe('useEnvelopeStore', () => {
  beforeEach(() => {
    useEnvelopeStore.setState({ envelopes: [], isWriting: false, error: null, borrowError: null });
    vi.clearAllMocks();
  });

  it('initial state has envelopes: [], isWriting: false, error: null', () => {
    expect(useEnvelopeStore.getState().envelopes).toEqual([]);
    expect(useEnvelopeStore.getState().isWriting).toBe(false);
    expect(useEnvelopeStore.getState().error).toBeNull();
  });

  describe('loadEnvelopes', () => {
    it('sets isWriting: true during call, false after, populates envelopes', async () => {
      const mockEnvelopes = [makeEnvelope()];
      let resolveInvoke!: (value: Envelope[]) => void;
      mockInvoke.mockReturnValue(
        new Promise<Envelope[]>((res) => {
          resolveInvoke = res;
        }),
      );

      const loadPromise = useEnvelopeStore.getState().loadEnvelopes();

      expect(useEnvelopeStore.getState().isWriting).toBe(true);

      resolveInvoke(mockEnvelopes);
      await loadPromise;

      expect(useEnvelopeStore.getState().isWriting).toBe(false);
      expect(useEnvelopeStore.getState().envelopes).toEqual(mockEnvelopes);
    });

    it('sets error and clears isWriting on failure', async () => {
      mockInvoke.mockRejectedValue({ code: 'DB_ERROR', message: 'failed' });

      await useEnvelopeStore.getState().loadEnvelopes();

      expect(useEnvelopeStore.getState().isWriting).toBe(false);
      expect(useEnvelopeStore.getState().error).toEqual({ code: 'DB_ERROR', message: 'failed' });
    });
  });

  describe('createEnvelope', () => {
    it('adds envelope on success (optimistic → confirmed)', async () => {
      const created = makeEnvelope({ id: 42, name: 'Rent' });
      mockInvoke.mockResolvedValue(created);

      await useEnvelopeStore.getState().createEnvelope({
        name: 'Rent',
        envelopeType: 'Bill',
        priority: 'Need',
        allocatedCents: 100000,
      });

      const { envelopes, isWriting, error } = useEnvelopeStore.getState();
      expect(envelopes).toHaveLength(1);
      expect(envelopes[0]).toEqual(created);
      expect(isWriting).toBe(false);
      expect(error).toBeNull();
    });

    it('removes optimistic entry and sets error on failure', async () => {
      mockInvoke.mockRejectedValue({ code: 'DB_ERROR', message: 'insert failed' });

      await useEnvelopeStore.getState().createEnvelope({
        name: 'Oops',
        envelopeType: 'Rolling',
        priority: 'Want',
        allocatedCents: 0,
      });

      const { envelopes, isWriting, error } = useEnvelopeStore.getState();
      expect(envelopes).toHaveLength(0);
      expect(isWriting).toBe(false);
      expect(error).toEqual({ code: 'DB_ERROR', message: 'insert failed' });
    });

    it('rejects float allocatedCents without invoking', async () => {
      await useEnvelopeStore.getState().createEnvelope({
        name: 'Bad',
        envelopeType: 'Rolling',
        priority: 'Need',
        allocatedCents: 9.99,
      });

      expect(mockInvoke).not.toHaveBeenCalled();
      expect(useEnvelopeStore.getState().error).toEqual({
        code: 'INVALID_ALLOCATED_CENTS',
        message: 'allocatedCents must be an integer (cents).',
      });
    });

    it('optimistic temp id is unique per call (no id:-1 collision)', async () => {
      const first = makeEnvelope({ id: 10, name: 'First' });
      const second = makeEnvelope({ id: 11, name: 'Second' });

      // Resolve both in sequence after both are dispatched
      mockInvoke
        .mockResolvedValueOnce(first)
        .mockResolvedValueOnce(second);

      await useEnvelopeStore.getState().createEnvelope({ name: 'First', envelopeType: 'Rolling', priority: 'Need', allocatedCents: 0 });
      await useEnvelopeStore.getState().createEnvelope({ name: 'Second', envelopeType: 'Rolling', priority: 'Need', allocatedCents: 0 });

      const { envelopes } = useEnvelopeStore.getState();
      expect(envelopes).toHaveLength(2);
      expect(envelopes.map((e) => e.id)).toEqual([10, 11]);
    });
  });

  describe('updateEnvelope', () => {
    it('modifies envelope on success', async () => {
      const original = makeEnvelope({ id: 1, name: 'Groceries', allocatedCents: 50000 });
      useEnvelopeStore.setState({ envelopes: [original] });

      const updated = makeEnvelope({ id: 1, name: 'Groceries Updated', allocatedCents: 75000 });
      mockInvoke.mockResolvedValue(updated);

      await useEnvelopeStore.getState().updateEnvelope({ id: 1, name: 'Groceries Updated', allocatedCents: 75000 });

      const { envelopes, isWriting, error } = useEnvelopeStore.getState();
      expect(envelopes[0]).toEqual(updated);
      expect(isWriting).toBe(false);
      expect(error).toBeNull();
    });

    it('rolls back to original and sets error on failure', async () => {
      const original = makeEnvelope({ id: 1, name: 'Groceries', allocatedCents: 50000 });
      useEnvelopeStore.setState({ envelopes: [original] });

      mockInvoke.mockRejectedValue({ code: 'ENVELOPE_NOT_FOUND', message: 'not found' });

      await useEnvelopeStore.getState().updateEnvelope({ id: 1, name: 'Ghost' });

      const { envelopes, isWriting, error } = useEnvelopeStore.getState();
      expect(envelopes[0]).toEqual(original);
      expect(isWriting).toBe(false);
      expect(error).toEqual({ code: 'ENVELOPE_NOT_FOUND', message: 'not found' });
    });

    it('sets error field when backend rejects with SAVINGS_ALREADY_DESIGNATED', async () => {
      const savings = makeEnvelope({ id: 1, name: 'ING Savings', isSavings: true });
      const other = makeEnvelope({ id: 2, name: 'Emergency Fund', isSavings: false });
      useEnvelopeStore.setState({ envelopes: [savings, other] });

      mockInvoke.mockRejectedValue({ code: 'SAVINGS_ALREADY_DESIGNATED', message: 'Another envelope is already designated as savings.' });

      await useEnvelopeStore.getState().updateEnvelope({ id: 2, isSavings: true });

      const { envelopes, isWriting, error } = useEnvelopeStore.getState();
      expect(error).toEqual({ code: 'SAVINGS_ALREADY_DESIGNATED', message: 'Another envelope is already designated as savings.' });
      expect(isWriting).toBe(false);
      // Rollback: other envelope isSavings remains false
      expect(envelopes.find((e) => e.id === 2)?.isSavings).toBe(false);
    });

    it('rejects float allocatedCents without invoking', async () => {
      const original = makeEnvelope({ id: 1, allocatedCents: 50000 });
      useEnvelopeStore.setState({ envelopes: [original] });

      await useEnvelopeStore.getState().updateEnvelope({ id: 1, allocatedCents: 49.99 });

      expect(mockInvoke).not.toHaveBeenCalled();
      expect(useEnvelopeStore.getState().error).toEqual({
        code: 'INVALID_ALLOCATED_CENTS',
        message: 'allocatedCents must be an integer (cents).',
      });
      // envelope unchanged
      expect(useEnvelopeStore.getState().envelopes[0]).toEqual(original);
    });
  });

  describe('deleteEnvelope', () => {
    it('removes envelope from list on success', async () => {
      const e1 = makeEnvelope({ id: 1, name: 'Groceries' });
      const e2 = makeEnvelope({ id: 2, name: 'Rent' });
      useEnvelopeStore.setState({ envelopes: [e1, e2] });

      mockInvoke.mockResolvedValue(undefined);

      await useEnvelopeStore.getState().deleteEnvelope(1);

      const { envelopes, isWriting, error } = useEnvelopeStore.getState();
      expect(envelopes).toHaveLength(1);
      expect(envelopes[0].id).toBe(2);
      expect(isWriting).toBe(false);
      expect(error).toBeNull();
    });

    it('restores list and sets error on failure', async () => {
      const e1 = makeEnvelope({ id: 1, name: 'Groceries' });
      useEnvelopeStore.setState({ envelopes: [e1] });

      mockInvoke.mockRejectedValue({ code: 'ENVELOPE_NOT_FOUND', message: 'not found' });

      await useEnvelopeStore.getState().deleteEnvelope(1);

      const { envelopes, isWriting, error } = useEnvelopeStore.getState();
      expect(envelopes).toHaveLength(1);
      expect(envelopes[0]).toEqual(e1);
      expect(isWriting).toBe(false);
      expect(error).toEqual({ code: 'ENVELOPE_NOT_FOUND', message: 'not found' });
    });
  });

  describe('borrowFromEnvelope', () => {
    it('optimistic update applies source reduction and target increase immediately', async () => {
      const source = makeEnvelope({ id: 1, name: 'Vacation', allocatedCents: 50000 });
      const target = makeEnvelope({ id: 2, name: 'Car Repair', allocatedCents: 0 });
      useEnvelopeStore.setState({ envelopes: [source, target] });

      let resolveInvoke!: (value: unknown) => void;
      mockInvoke.mockReturnValue(new Promise((res) => { resolveInvoke = res; }));

      const borrowPromise = useEnvelopeStore.getState().borrowFromEnvelope({
        sourceEnvelopeId: 1,
        targetEnvelopeId: 2,
        amountCents: 20000,
      });

      const { envelopes } = useEnvelopeStore.getState();
      expect(envelopes.find((e) => e.id === 1)?.allocatedCents).toBe(30000);
      expect(envelopes.find((e) => e.id === 2)?.allocatedCents).toBe(20000);

      resolveInvoke({ source, target });
      await borrowPromise;
    });

    it('replaces source and target with authoritative DB response on success', async () => {
      const source = makeEnvelope({ id: 1, name: 'Vacation', allocatedCents: 50000 });
      const target = makeEnvelope({ id: 2, name: 'Car Repair', allocatedCents: 0 });
      useEnvelopeStore.setState({ envelopes: [source, target] });

      const dbSource = makeEnvelope({ id: 1, name: 'Vacation', allocatedCents: 30000 });
      const dbTarget = makeEnvelope({ id: 2, name: 'Car Repair', allocatedCents: 20000 });
      mockInvoke.mockResolvedValue({ source: dbSource, target: dbTarget });

      await useEnvelopeStore.getState().borrowFromEnvelope({
        sourceEnvelopeId: 1,
        targetEnvelopeId: 2,
        amountCents: 20000,
      });

      const { envelopes, isWriting, borrowError } = useEnvelopeStore.getState();
      expect(envelopes.find((e) => e.id === 1)).toEqual(dbSource);
      expect(envelopes.find((e) => e.id === 2)).toEqual(dbTarget);
      expect(isWriting).toBe(false);
      expect(borrowError).toBeNull();
    });

    it('rolls back and sets borrowError on failure', async () => {
      const source = makeEnvelope({ id: 1, name: 'Vacation', allocatedCents: 50000 });
      const target = makeEnvelope({ id: 2, name: 'Car Repair', allocatedCents: 0 });
      useEnvelopeStore.setState({ envelopes: [source, target] });

      mockInvoke.mockRejectedValue({ code: 'INSUFFICIENT_BALANCE', message: 'Not enough balance.' });

      await useEnvelopeStore.getState().borrowFromEnvelope({
        sourceEnvelopeId: 1,
        targetEnvelopeId: 2,
        amountCents: 100000,
      });

      const { envelopes, isWriting, borrowError } = useEnvelopeStore.getState();
      expect(envelopes.find((e) => e.id === 1)?.allocatedCents).toBe(50000);
      expect(envelopes.find((e) => e.id === 2)?.allocatedCents).toBe(0);
      expect(isWriting).toBe(false);
      expect(borrowError).toEqual({ code: 'INSUFFICIENT_BALANCE', message: 'Not enough balance.' });
    });
  });
});
