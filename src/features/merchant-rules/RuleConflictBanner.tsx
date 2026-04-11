import { useMemo } from 'react';
import { useMerchantRuleStore } from '@/stores/useMerchantRuleStore';

export default function RuleConflictBanner() {
  const conflictingRules = useMerchantRuleStore(s => s.conflictingRules);
  const conflicts = useMemo(() => conflictingRules(), [conflictingRules]);

  if (conflicts.length === 0) return null;

  return (
    <div
      data-testid="rule-conflict-banner"
      style={{
        border: '1px solid var(--color-amber, #f59e0b)',
        borderRadius: '6px',
        padding: '0.75rem 1rem',
        marginBottom: '1rem',
        backgroundColor: 'rgba(245, 158, 11, 0.08)',
      }}
    >
      <p className="type-label" style={{ color: 'var(--color-text-primary)', marginBottom: '0.5rem' }}>
        ⚠ Overlapping merchant rules detected
      </p>
      {conflicts.map(([ruleA, ruleB]) => (
        <p
          key={`${ruleA.id}-${ruleB.id}`}
          data-testid={`conflict-pair-${ruleA.id}-${ruleB.id}`}
          className="type-caption"
          style={{ color: 'var(--color-text-secondary)' }}
        >
          &ldquo;{ruleA.payeeSubstring}&rdquo; overlaps with &ldquo;{ruleB.payeeSubstring}&rdquo;
        </p>
      ))}
    </div>
  );
}
