import { vi, describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { MerchantRule } from '@/lib/types';

// ── Store mocks ──────────────────────────────────────────────────────────────

const mockUpdateRule = vi.fn();
const mockDeleteRule = vi.fn();

const merchantRuleStore = {
  rules: [],
  isWriting: false,
  error: null,
  updateRule: mockUpdateRule,
  deleteRule: mockDeleteRule,
  loadRules: vi.fn(),
  createRule: vi.fn(),
  conflictingRules: () => [],
};

vi.mock('@/stores/useMerchantRuleStore', () => {
  const useMerchantRuleStore = Object.assign(
    vi.fn((selector: (s: typeof merchantRuleStore) => unknown) => selector(merchantRuleStore)),
    { getState: vi.fn(() => merchantRuleStore) },
  );
  return { useMerchantRuleStore };
});

const envelopeStore = {
  envelopes: [
    { id: 10, name: 'Groceries', type: 'Rolling', priority: 'Need', allocatedCents: 0, monthId: null, createdAt: '' },
    { id: 20, name: 'Transport', type: 'Rolling', priority: 'Need', allocatedCents: 0, monthId: null, createdAt: '' },
  ],
};

vi.mock('@/stores/useEnvelopeStore', () => {
  const useEnvelopeStore = vi.fn((selector: (s: typeof envelopeStore) => unknown) => selector(envelopeStore));
  return { useEnvelopeStore };
});

// ── Import component under test ──────────────────────────────────────────────
import RuleEditor from './RuleEditor';
import { useMerchantRuleStore } from '@/stores/useMerchantRuleStore';

// ── Helpers ──────────────────────────────────────────────────────────────────

const makeRule = (overrides: Partial<MerchantRule> = {}): MerchantRule => ({
  id: 1,
  payeeSubstring: 'Kroger',
  envelopeId: 10,
  version: 1,
  createdAt: '2026-01-01T00:00:00Z',
  lastMatchedAt: null,
  matchCount: 0,
  ...overrides,
});

describe('RuleEditor', () => {
  const mockOnClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    merchantRuleStore.isWriting = false;
    (useMerchantRuleStore as ReturnType<typeof vi.fn>).mockImplementation(
      (selector: (s: typeof merchantRuleStore) => unknown) => selector(merchantRuleStore),
    );
    (useMerchantRuleStore as ReturnType<typeof vi.fn>).getState.mockReturnValue(merchantRuleStore);
  });

  it('renders with data-testid="rule-editor"', () => {
    render(<RuleEditor rule={makeRule()} onClose={mockOnClose} />);
    expect(screen.getByTestId('rule-editor')).toBeInTheDocument();
  });

  it('pre-fills substring input from rule.payeeSubstring', () => {
    render(<RuleEditor rule={makeRule({ payeeSubstring: 'Kroger' })} onClose={mockOnClose} />);
    const input = screen.getByTestId('rule-editor-substring-input') as HTMLInputElement;
    expect(input.value).toBe('Kroger');
  });

  it('renders Save, Delete, and Cancel buttons', () => {
    render(<RuleEditor rule={makeRule()} onClose={mockOnClose} />);
    expect(screen.getByTestId('rule-editor-save')).toBeInTheDocument();
    expect(screen.getByTestId('rule-editor-delete')).toBeInTheDocument();
    expect(screen.getByTestId('rule-editor-cancel')).toBeInTheDocument();
  });

  it('Save calls updateRule with correct args and then onClose', () => {
    render(<RuleEditor rule={makeRule({ id: 1, payeeSubstring: 'Kroger', envelopeId: 10 })} onClose={mockOnClose} />);

    // Change substring
    const input = screen.getByTestId('rule-editor-substring-input');
    fireEvent.change(input, { target: { value: 'KROGER' } });

    fireEvent.click(screen.getByTestId('rule-editor-save'));

    expect(mockUpdateRule).toHaveBeenCalledWith({ id: 1, payeeSubstring: 'KROGER', envelopeId: 10 });
    expect(mockOnClose).toHaveBeenCalled();
  });

  it('Delete calls deleteRule(rule.id) and then onClose', () => {
    render(<RuleEditor rule={makeRule({ id: 5 })} onClose={mockOnClose} />);
    fireEvent.click(screen.getByTestId('rule-editor-delete'));
    expect(mockDeleteRule).toHaveBeenCalledWith(5);
    expect(mockOnClose).toHaveBeenCalled();
  });

  it('Cancel calls onClose without invoking any store action', () => {
    render(<RuleEditor rule={makeRule()} onClose={mockOnClose} />);
    fireEvent.click(screen.getByTestId('rule-editor-cancel'));
    expect(mockOnClose).toHaveBeenCalled();
    expect(mockUpdateRule).not.toHaveBeenCalled();
    expect(mockDeleteRule).not.toHaveBeenCalled();
  });

  it('Save and Delete buttons are disabled when isWriting: true', () => {
    merchantRuleStore.isWriting = true;
    (useMerchantRuleStore as ReturnType<typeof vi.fn>).mockImplementation(
      (selector: (s: typeof merchantRuleStore) => unknown) => selector(merchantRuleStore),
    );

    render(<RuleEditor rule={makeRule()} onClose={mockOnClose} />);

    expect(screen.getByTestId('rule-editor-save')).toBeDisabled();
    expect(screen.getByTestId('rule-editor-delete')).toBeDisabled();
  });
});
