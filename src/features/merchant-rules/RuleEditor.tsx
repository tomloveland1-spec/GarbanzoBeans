import { useState } from 'react';
import type { MerchantRule } from '@/lib/types';
import { useMerchantRuleStore } from '@/stores/useMerchantRuleStore';
import { useEnvelopeStore } from '@/stores/useEnvelopeStore';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface RuleEditorProps {
  rule: MerchantRule;
  onClose: () => void;
}

export default function RuleEditor({ rule, onClose }: RuleEditorProps) {
  const [substring, setSubstring] = useState(rule.payeeSubstring);
  const [envelopeId, setEnvelopeId] = useState(rule.envelopeId);

  const isWriting = useMerchantRuleStore(s => s.isWriting);
  const envelopes = useEnvelopeStore(s => s.envelopes);

  function handleSave() {
    useMerchantRuleStore.getState().updateRule({ id: rule.id, payeeSubstring: substring, envelopeId });
    onClose();
  }

  function handleDelete() {
    useMerchantRuleStore.getState().deleteRule(rule.id);
    onClose();
  }

  return (
    <div
      data-testid="rule-editor"
      style={{
        border: '1px solid var(--color-border)',
        borderRadius: '6px',
        padding: '1rem',
        backgroundColor: 'var(--color-surface-card)',
        marginTop: '0.5rem',
      }}
    >
      <div style={{ marginBottom: '0.75rem' }}>
        <label className="type-label" style={{ display: 'block', color: 'var(--color-text-secondary)', marginBottom: '0.25rem' }}>
          Payee Substring
        </label>
        <input
          data-testid="rule-editor-substring-input"
          type="text"
          value={substring}
          onChange={e => setSubstring(e.target.value)}
          className="type-body"
          style={{
            width: '100%',
            padding: '0.5rem',
            background: 'var(--color-bg)',
            border: '1px solid var(--color-border)',
            borderRadius: '4px',
            color: 'var(--color-text-primary)',
          }}
        />
      </div>

      <div style={{ marginBottom: '1rem' }}>
        <label className="type-label" style={{ display: 'block', color: 'var(--color-text-secondary)', marginBottom: '0.25rem' }}>
          Envelope
        </label>
        <Select
          value={String(envelopeId)}
          onValueChange={val => setEnvelopeId(Number(val))}
        >
          <SelectTrigger data-testid="rule-editor-envelope-select">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {envelopes.map(e => (
              <SelectItem key={e.id} value={String(e.id)}>
                {e.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <button
          data-testid="rule-editor-save"
          onClick={handleSave}
          disabled={isWriting || !substring.trim()}
          className="type-label"
          style={{
            padding: '0.5rem 1rem',
            backgroundColor: 'var(--color-lime)',
            color: 'var(--color-bg)',
            border: 'none',
            borderRadius: '4px',
            cursor: isWriting ? 'not-allowed' : 'pointer',
            opacity: isWriting ? 0.5 : 1,
          }}
        >
          Save
        </button>
        <button
          data-testid="rule-editor-delete"
          onClick={handleDelete}
          disabled={isWriting}
          className="type-label"
          style={{
            padding: '0.5rem 1rem',
            backgroundColor: 'transparent',
            color: 'var(--color-text-secondary)',
            border: '1px solid var(--color-border)',
            borderRadius: '4px',
            cursor: isWriting ? 'not-allowed' : 'pointer',
            opacity: isWriting ? 0.5 : 1,
          }}
        >
          Delete
        </button>
        <button
          data-testid="rule-editor-cancel"
          onClick={onClose}
          className="type-label"
          style={{
            padding: '0.5rem 1rem',
            backgroundColor: 'transparent',
            color: 'var(--color-text-secondary)',
            border: '1px solid var(--color-border)',
            borderRadius: '4px',
            cursor: 'pointer',
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
