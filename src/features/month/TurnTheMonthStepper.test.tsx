import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import TurnTheMonthStepper from './TurnTheMonthStepper';

function renderStepper(overrides: Partial<React.ComponentProps<typeof TurnTheMonthStepper>> = {}) {
  const defaults = {
    currentStep: 1,
    totalSteps: 4,
    stepTitle: 'Last Month in Review',
    onBack: undefined as (() => void) | undefined,
    onContinue: vi.fn(),
    isFinalStep: false,
    isWriting: false,
    children: <div>Step content</div>,
  };
  return render(<TurnTheMonthStepper {...defaults} {...overrides} />);
}

describe('TurnTheMonthStepper', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders step counter as "Step N of M"', () => {
    renderStepper({ currentStep: 2, totalSteps: 4 });
    expect(screen.getByText('Step 2 of 4')).toBeTruthy();
  });

  it('renders step title', () => {
    renderStepper({ stepTitle: 'Confirm Bill Dates' });
    expect(screen.getByText('Confirm Bill Dates')).toBeTruthy();
  });

  it('hides Back button when onBack is undefined', () => {
    renderStepper({ onBack: undefined });
    expect(screen.queryByText('Back')).toBeNull();
  });

  it('shows Back button when onBack provided', () => {
    renderStepper({ onBack: vi.fn() });
    expect(screen.getByText('Back')).toBeTruthy();
  });

  it('Continue button label is "Continue" when not final step', () => {
    renderStepper({ isFinalStep: false });
    expect(screen.getByText('Continue')).toBeTruthy();
  });

  it('Continue button label is "Close Month" when final step', () => {
    renderStepper({ isFinalStep: true });
    expect(screen.getByText('Close Month')).toBeTruthy();
  });

  it('Continue is disabled when isWriting', () => {
    renderStepper({ isWriting: true });
    const continueBtn = screen.getByText('Continue') as HTMLButtonElement;
    expect(continueBtn.disabled).toBe(true);
  });

  it('Back button is disabled when isWriting', () => {
    renderStepper({ onBack: vi.fn(), isWriting: true });
    const backBtn = screen.getByText('Back') as HTMLButtonElement;
    expect(backBtn.disabled).toBe(true);
  });

  it('Escape key does not call onContinue or onBack', () => {
    const onContinue = vi.fn();
    const onBack = vi.fn();
    renderStepper({ onContinue, onBack });
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onContinue).not.toHaveBeenCalled();
    expect(onBack).not.toHaveBeenCalled();
  });

  it('calls onBack when Back button is pressed', () => {
    const onBack = vi.fn();
    renderStepper({ onBack });
    fireEvent.click(screen.getByText('Back'));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('Not yet button absent when onDismiss is undefined', () => {
    renderStepper({ onDismiss: undefined });
    expect(screen.queryByText('Not yet — finish later')).toBeNull();
  });

  it('Not yet button visible when onDismiss is provided', () => {
    renderStepper({ onDismiss: vi.fn() });
    expect(screen.getByText('Not yet — finish later')).toBeTruthy();
  });

  it('clicking Not yet calls onDismiss', () => {
    const onDismiss = vi.fn();
    renderStepper({ onDismiss });
    fireEvent.click(screen.getByText('Not yet — finish later'));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('Not yet button is NOT disabled when isWriting=true', () => {
    const onDismiss = vi.fn();
    renderStepper({ onDismiss, isWriting: true });
    const btn = screen.getByText('Not yet — finish later') as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
  });
});
