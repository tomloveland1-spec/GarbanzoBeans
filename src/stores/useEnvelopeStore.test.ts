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
  ...overrides,
});

describe('useEnvelopeStore', () => {
  beforeEach(() => {
    useEnvelopeStore.setState({ envelopes: [], isWriting: false, error: null });
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
});
