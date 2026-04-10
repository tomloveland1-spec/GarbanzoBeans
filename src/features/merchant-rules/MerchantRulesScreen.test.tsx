import { vi, describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { MerchantRule } from '@/lib/types';

// ── Store mocks ──────────────────────────────────────────────────────────────

const merchantRuleStore = {
  rules: [] as MerchantRule[],
  isWriting: false,
  error: null,
  updateRule: vi.fn(),
  deleteRule: vi.fn(),
  loadRules: vi.fn(),
  createRule: vi.fn(),
  conflictingRules: () => [] as [MerchantRule, MerchantRule][],
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
import MerchantRulesScreen from './MerchantRulesScreen';
import { useMerchantRuleStore } from '@/stores/useMerchantRuleStore';

// ── Helpers ──────────────────────────────────────────────────────────────────

const makeRule = (overrides: Partial<MerchantRule> = {}): MerchantRule => ({
  id: 1,
  payeeSubstring: 'Kroger',
  envelopeId: 10,
  version: 1,
  createdAt: '2026-01-01T00:00:00Z',
  lastMatchedAt: null,
  matchCount: 5,
  ...overrides,
});

function resetStore(rules: MerchantRule[] = []) {
  merchantRuleStore.rules = rules;
  merchantRuleStore.isWriting = false;
  (useMerchantRuleStore as ReturnType<typeof vi.fn>).mockImplementation(
    (selector: (s: typeof merchantRuleStore) => unknown) => selector(merchantRuleStore),
  );
  (useMerchantRuleStore as ReturnType<typeof vi.fn>).getState.mockReturnValue(merchantRuleStore);
}

describe('MerchantRulesScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetStore();
  });

  it('renders wrapper with data-testid="merchant-rules-screen"', () => {
    render(<MerchantRulesScreen />);
    expect(screen.getByTestId('merchant-rules-screen')).toBeInTheDocument();
  });

  it('renders empty state when rules array is empty', () => {
    resetStore([]);
    render(<MerchantRulesScreen />);
    expect(screen.getByTestId('empty-state')).toBeInTheDocument();
    expect(screen.getByText(/No merchant rules yet/)).toBeInTheDocument();
  });

  it('renders a rule row for each rule (payee substring, envelope name, match count)', () => {
    resetStore([
      makeRule({ id: 1, payeeSubstring: 'Kroger', envelopeId: 10, matchCount: 5 }),
      makeRule({ id: 2, payeeSubstring: 'Amazon', envelopeId: 20, matchCount: 3 }),
    ]);
    render(<MerchantRulesScreen />);
    expect(screen.getByTestId('rule-row-1')).toBeInTheDocument();
    expect(screen.getByTestId('rule-row-2')).toBeInTheDocument();
    expect(screen.getByText('Kroger')).toBeInTheDocument();
    expect(screen.getByText('Amazon')).toBeInTheDocument();
    // Envelope names resolved
    expect(screen.getAllByText('Groceries').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Transport').length).toBeGreaterThan(0);
  });

  it('default sort is by matchCount descending — higher matchCount row appears first', () => {
    resetStore([
      makeRule({ id: 1, payeeSubstring: 'Low', envelopeId: 10, matchCount: 2 }),
      makeRule({ id: 2, payeeSubstring: 'High', envelopeId: 10, matchCount: 10 }),
    ]);
    render(<MerchantRulesScreen />);
    const rows = screen.getAllByRole('row').filter(r => r.dataset.testid?.startsWith('rule-row'));
    // Alternatively, check order of rule-row test IDs in document
    const row1 = screen.getByTestId('rule-row-1');
    const row2 = screen.getByTestId('rule-row-2');
    // row-2 (matchCount=10) should come before row-1 (matchCount=2)
    expect(row2.compareDocumentPosition(row1) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('clicking sort-by-last-matched re-sorts by lastMatchedAt descending', () => {
    resetStore([
      makeRule({ id: 1, payeeSubstring: 'Earlier', envelopeId: 10, matchCount: 5, lastMatchedAt: '2026-01-01T00:00:00Z' }),
      makeRule({ id: 2, payeeSubstring: 'Later', envelopeId: 10, matchCount: 3, lastMatchedAt: '2026-06-01T00:00:00Z' }),
    ]);
    render(<MerchantRulesScreen />);
    fireEvent.click(screen.getByTestId('sort-by-last-matched'));

    const row1 = screen.getByTestId('rule-row-1');
    const row2 = screen.getByTestId('rule-row-2');
    // row-2 (later date) should come before row-1
    expect(row2.compareDocumentPosition(row1) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('clicking a rule row renders RuleEditor for that rule', () => {
    resetStore([makeRule({ id: 1 })]);
    render(<MerchantRulesScreen />);
    expect(screen.queryByTestId('rule-editor')).toBeNull();
    fireEvent.click(screen.getByTestId('rule-row-1'));
    expect(screen.getByTestId('rule-editor')).toBeInTheDocument();
  });

  it('RuleEditor is not rendered when no rule is selected', () => {
    resetStore([makeRule({ id: 1 })]);
    render(<MerchantRulesScreen />);
    expect(screen.queryByTestId('rule-editor')).toBeNull();
  });

  it('RuleConflictBanner is rendered (presence by testid)', () => {
    // conflictingRules returns empty array → banner returns null, so just verify no crash
    // Override to simulate conflicts
    merchantRuleStore.conflictingRules = () => [
      [makeRule({ id: 1, payeeSubstring: 'Kroger' }), makeRule({ id: 2, payeeSubstring: 'Kroger #1234' })],
    ];
    (useMerchantRuleStore as ReturnType<typeof vi.fn>).mockImplementation(
      (selector: (s: typeof merchantRuleStore) => unknown) => selector(merchantRuleStore),
    );
    resetStore([makeRule({ id: 1 }), makeRule({ id: 2, payeeSubstring: 'Kroger #1234' })]);
    render(<MerchantRulesScreen />);
    expect(screen.getByTestId('rule-conflict-banner')).toBeInTheDocument();
  });

  it('sort buttons are present', () => {
    render(<MerchantRulesScreen />);
    expect(screen.getByTestId('sort-by-match-count')).toBeInTheDocument();
    expect(screen.getByTestId('sort-by-last-matched')).toBeInTheDocument();
  });
});
