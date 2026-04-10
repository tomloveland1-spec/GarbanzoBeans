import { Fragment, useEffect, useState } from 'react';
import { useMerchantRuleStore } from '@/stores/useMerchantRuleStore';
import { useEnvelopeStore } from '@/stores/useEnvelopeStore';
import type { MerchantRule } from '@/lib/types';
import RuleConflictBanner from './RuleConflictBanner';
import RuleEditor from './RuleEditor';

type SortBy = 'matchCount' | 'lastMatchedAt';

export default function MerchantRulesScreen() {
  const rules = useMerchantRuleStore(s => s.rules);
  const envelopes = useEnvelopeStore(s => s.envelopes);

  const [sortBy, setSortBy] = useState<SortBy>('matchCount');
  const [selectedRuleId, setSelectedRuleId] = useState<number | null>(null);

  useEffect(() => {
    useMerchantRuleStore.getState().loadRules();
  }, []);

  const envelopeName = (envelopeId: number) =>
    envelopes.find(e => e.id === envelopeId)?.name ?? 'Unknown';

  const sorted = [...rules].sort((a: MerchantRule, b: MerchantRule) => {
    if (sortBy === 'matchCount') return b.matchCount - a.matchCount;
    if (!a.lastMatchedAt && !b.lastMatchedAt) return 0;
    if (!a.lastMatchedAt) return 1;
    if (!b.lastMatchedAt) return -1;
    return new Date(b.lastMatchedAt).getTime() - new Date(a.lastMatchedAt).getTime();
  });

  const selectedRule = selectedRuleId !== null ? rules.find(r => r.id === selectedRuleId) ?? null : null;

  return (
    <div
      data-testid="merchant-rules-screen"
      style={{
        padding: '1.5rem',
        color: 'var(--color-text-primary)',
        background: 'var(--color-bg)',
        minHeight: '100%',
      }}
    >
      <h1 className="type-label" style={{ marginBottom: '1rem', fontSize: '1.25rem' }}>
        Merchant Rules
      </h1>

      <RuleConflictBanner />

      {/* Sort controls */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
        <button
          data-testid="sort-by-match-count"
          onClick={() => setSortBy('matchCount')}
          className="type-label"
          style={{
            padding: '0.375rem 0.75rem',
            background: 'transparent',
            border: '1px solid var(--color-border)',
            borderRadius: '4px',
            cursor: 'pointer',
            color: sortBy === 'matchCount' ? 'var(--color-lime)' : 'var(--color-text-secondary)',
            borderColor: sortBy === 'matchCount' ? 'var(--color-lime)' : 'var(--color-border)',
          }}
        >
          Sort: Match Count
        </button>
        <button
          data-testid="sort-by-last-matched"
          onClick={() => setSortBy('lastMatchedAt')}
          className="type-label"
          style={{
            padding: '0.375rem 0.75rem',
            background: 'transparent',
            border: '1px solid var(--color-border)',
            borderRadius: '4px',
            cursor: 'pointer',
            color: sortBy === 'lastMatchedAt' ? 'var(--color-lime)' : 'var(--color-text-secondary)',
            borderColor: sortBy === 'lastMatchedAt' ? 'var(--color-lime)' : 'var(--color-border)',
          }}
        >
          Sort: Last Matched
        </button>
      </div>

      {/* Empty state */}
      {rules.length === 0 && (
        <div
          data-testid="empty-state"
          className="type-body"
          style={{ color: 'var(--color-text-secondary)', marginTop: '2rem', textAlign: 'center' }}
        >
          No merchant rules yet. Rules are created automatically when you categorize unknown transactions.
        </div>
      )}

      {/* Rules table */}
      {rules.length > 0 && (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th className="type-caption" style={{ textAlign: 'left', color: 'var(--color-text-secondary)', padding: '0.5rem 0.75rem', borderBottom: '1px solid var(--color-border)' }}>Payee Substring</th>
              <th className="type-caption" style={{ textAlign: 'left', color: 'var(--color-text-secondary)', padding: '0.5rem 0.75rem', borderBottom: '1px solid var(--color-border)' }}>Envelope</th>
              <th className="type-caption" style={{ textAlign: 'right', color: 'var(--color-text-secondary)', padding: '0.5rem 0.75rem', borderBottom: '1px solid var(--color-border)' }}>Matches</th>
              <th className="type-caption" style={{ textAlign: 'left', color: 'var(--color-text-secondary)', padding: '0.5rem 0.75rem', borderBottom: '1px solid var(--color-border)' }}>Last Matched</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(rule => (
              <Fragment key={rule.id}>
                <tr
                  data-testid={`rule-row-${rule.id}`}
                  role="row"
                  onClick={() => setSelectedRuleId(prev => (prev === rule.id ? null : rule.id))}
                  style={{
                    cursor: 'pointer',
                    borderBottom: '1px solid var(--color-border)',
                    backgroundColor: selectedRuleId === rule.id ? 'rgba(192, 245, 0, 0.06)' : 'transparent',
                  }}
                >
                  <td className="type-body" style={{ padding: '0.625rem 0.75rem', color: 'var(--color-text-primary)' }}>
                    {rule.payeeSubstring}
                  </td>
                  <td className="type-body" style={{ padding: '0.625rem 0.75rem', color: 'var(--color-text-secondary)' }}>
                    {envelopeName(rule.envelopeId)}
                  </td>
                  <td className="type-body" style={{ padding: '0.625rem 0.75rem', color: 'var(--color-text-secondary)', textAlign: 'right' }}>
                    {rule.matchCount}
                  </td>
                  <td className="type-caption" style={{ padding: '0.625rem 0.75rem', color: 'var(--color-text-secondary)' }}>
                    {rule.lastMatchedAt ? new Date(rule.lastMatchedAt).toLocaleDateString() : 'Never'}
                  </td>
                </tr>
                {selectedRuleId === rule.id && selectedRule && (
                  <tr>
                    <td colSpan={4} style={{ padding: '0 0.75rem 0.75rem' }}>
                      <RuleEditor rule={selectedRule} onClose={() => setSelectedRuleId(null)} />
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
