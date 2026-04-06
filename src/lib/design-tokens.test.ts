import { describe, it, expect } from 'vitest';
import { DESIGN_TOKENS } from './design-tokens';

describe('DESIGN_TOKENS', () => {
  it('has all 28 required design tokens (22 semantic + 6 aliases)', () => {
    expect(Object.keys(DESIGN_TOKENS)).toHaveLength(28);
  });

  it('Dark Forest base palette values are correct', () => {
    expect(DESIGN_TOKENS.bgApp).toBe('#111214');
    expect(DESIGN_TOKENS.bgSurface).toBe('#1C1E21');
    expect(DESIGN_TOKENS.bgSidebar).toBe('#0F2218');
    expect(DESIGN_TOKENS.sidebarActive).toBe('#C0F500');
  });

  it('envelope state colors match UX spec', () => {
    expect(DESIGN_TOKENS.envelopeGreen).toBe('#C0F500');
    expect(DESIGN_TOKENS.envelopeOrange).toBe('#F5A800');
    expect(DESIGN_TOKENS.envelopeRed).toBe('#ff5555');
  });

  it('runway zone colors match UX spec', () => {
    expect(DESIGN_TOKENS.runwayHealthy).toBe('#C0F500');
    expect(DESIGN_TOKENS.runwayCaution).toBe('#F5A800');
    expect(DESIGN_TOKENS.runwayCritical).toBe('#ff5555');
  });

  it('interactive/lime token is consistent everywhere it appears', () => {
    // Lime is the single positive signal — must be identical in all roles
    expect(DESIGN_TOKENS.interactive).toBe(DESIGN_TOKENS.envelopeGreen);
    expect(DESIGN_TOKENS.interactive).toBe(DESIGN_TOKENS.sidebarActive);
    expect(DESIGN_TOKENS.interactive).toBe(DESIGN_TOKENS.runwayHealthy);
  });

  it('savings positive uses desaturated lime, not full lime', () => {
    // savingsPositive is #90c820, NOT #C0F500 — used only in savings flow chart bars
    expect(DESIGN_TOKENS.savingsPositive).toBe('#90c820');
    expect(DESIGN_TOKENS.savingsPositive).not.toBe(DESIGN_TOKENS.envelopeGreen);
  });
});
