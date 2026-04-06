import { describe, it, expect, beforeEach } from 'vitest';
import { useMonthStore } from './useMonthStore';

describe('useMonthStore', () => {
  beforeEach(() => {
    useMonthStore.setState({ monthStatus: 'open', isWriting: false });
  });

  it('initializes with isWriting: false', () => {
    expect(useMonthStore.getState().isWriting).toBe(false);
  });

  it('initializes with monthStatus: open', () => {
    expect(useMonthStore.getState().monthStatus).toBe('open');
  });
});
