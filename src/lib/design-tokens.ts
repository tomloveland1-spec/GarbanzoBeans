// Design token registry — single source of truth for token values.
// Update this when UX design changes tokens; unit test catches drift.
export const DESIGN_TOKENS = {
  // Background
  bgApp: '#111214',
  bgSurface: '#1C1E21',
  bgSidebar: '#0F2218',
  // Text
  textPrimary: '#EEEEF0',
  textSecondary: '#888A90',
  // Border
  border: '#26282C',
  // Sidebar
  sidebarText: 'rgba(255, 255, 255, 0.65)',
  sidebarActive: '#C0F500',
  sidebarHover: 'rgba(255, 255, 255, 0.07)',
  // Envelope states
  envelopeGreen: '#C0F500',
  envelopeGreenBg: 'rgba(192, 245, 0, 0.13)',
  envelopeOrange: '#F5A800',
  envelopeOrangeBg: 'rgba(245, 168, 0, 0.13)',
  envelopeRed: '#ff5555',
  envelopeRedBg: 'rgba(255, 85, 85, 0.13)',
  // Savings
  savingsPositive: '#90c820',
  savingsNegative: '#ff5555',
  // Aliases
  lime: '#C0F500',
  amber: '#F5A800',
  red: '#ff5555',
  forestDeep: '#0F2218',
  neutralBlack: '#111214',
  neutralSurface: '#1C1E21',
  // Runway
  runwayHealthy: '#C0F500',
  runwayCaution: '#F5A800',
  runwayCritical: '#ff5555',
  gaugeTrack: '#26282C',
  // Interactive
  interactive: '#C0F500',
} as const;

export type DesignTokenKey = keyof typeof DESIGN_TOKENS;
