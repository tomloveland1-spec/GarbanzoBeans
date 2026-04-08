import { vi, describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import SubstringRuleBuilder from './SubstringRuleBuilder';

describe('SubstringRuleBuilder', () => {
  it('renders all payee characters as spans', () => {
    render(
      <SubstringRuleBuilder
        payee="Kroger"
        envelopeName="Groceries"
        selectedSubstring=""
        onSubstringChange={vi.fn()}
      />,
    );
    const container = screen.getByTestId('payee-spans-container');
    const spans = container.querySelectorAll('span');
    expect(spans).toHaveLength(6); // K r o g e r
    expect(spans[0].textContent).toBe('K');
    expect(spans[5].textContent).toBe('r');
  });

  it('calls onSubstringChange with correct substring after mouse-drag', () => {
    const onSubstringChange = vi.fn();
    render(
      <SubstringRuleBuilder
        payee="Kroger"
        envelopeName="Groceries"
        selectedSubstring=""
        onSubstringChange={onSubstringChange}
      />,
    );
    const container = screen.getByTestId('payee-spans-container');
    const spans = container.querySelectorAll('span');

    // Drag from index 0 to index 3 → "Krog"
    fireEvent.mouseDown(spans[0]);
    fireEvent.mouseMove(spans[1]);
    fireEvent.mouseMove(spans[2]);
    fireEvent.mouseMove(spans[3]);
    fireEvent.mouseUp(spans[3]);

    expect(onSubstringChange).toHaveBeenCalledWith('Krog');
  });

  it('selected characters receive lime background styling', () => {
    render(
      <SubstringRuleBuilder
        payee="Kroger"
        envelopeName="Groceries"
        selectedSubstring="rog"
        onSubstringChange={vi.fn()}
      />,
    );
    const container = screen.getByTestId('payee-spans-container');
    const spans = container.querySelectorAll('span');

    // "rog" starts at index 1 in "Kroger"
    expect(spans[1].style.background).toBe('var(--color-lime)');
    expect(spans[2].style.background).toBe('var(--color-lime)');
    expect(spans[3].style.background).toBe('var(--color-lime)');
    // Not highlighted
    expect(spans[0].style.background).toBe('');
    expect(spans[4].style.background).toBe('');
  });

  it('renders live preview when selectedSubstring and envelopeName are provided', () => {
    render(
      <SubstringRuleBuilder
        payee="Kroger"
        envelopeName="Groceries"
        selectedSubstring="Krog"
        onSubstringChange={vi.fn()}
      />,
    );
    expect(screen.getByTestId('rule-preview')).toHaveTextContent(
      'Match: Krog → Groceries',
    );
  });

  it('does not render live preview when selectedSubstring is empty', () => {
    render(
      <SubstringRuleBuilder
        payee="Kroger"
        envelopeName="Groceries"
        selectedSubstring=""
        onSubstringChange={vi.fn()}
      />,
    );
    expect(screen.queryByTestId('rule-preview')).not.toBeInTheDocument();
  });

  it('does not render live preview when envelopeName is null (no category selected)', () => {
    render(
      <SubstringRuleBuilder
        payee="Kroger"
        envelopeName={null}
        selectedSubstring="Krog"
        onSubstringChange={vi.fn()}
      />,
    );
    expect(screen.queryByTestId('rule-preview')).not.toBeInTheDocument();
  });

  it('calls onSubstringChange with full payee on Space key', () => {
    const onSubstringChange = vi.fn();
    render(
      <SubstringRuleBuilder
        payee="Kroger"
        envelopeName="Groceries"
        selectedSubstring=""
        onSubstringChange={onSubstringChange}
      />,
    );
    const container = screen.getByTestId('payee-spans-container');
    fireEvent.keyDown(container, { key: ' ' });
    expect(onSubstringChange).toHaveBeenCalledWith('Kroger');
  });

  it('calls onSubstringChange with full payee on Enter key', () => {
    const onSubstringChange = vi.fn();
    render(
      <SubstringRuleBuilder
        payee="Kroger"
        envelopeName="Groceries"
        selectedSubstring=""
        onSubstringChange={onSubstringChange}
      />,
    );
    const container = screen.getByTestId('payee-spans-container');
    fireEvent.keyDown(container, { key: 'Enter' });
    expect(onSubstringChange).toHaveBeenCalledWith('Kroger');
  });
});
