/**
 * PR-Agent CLI Theme
 * Invariant-branded colors and dimensions
 */

export const colors = {
  // Primary brand color (Invariant green)
  primary: '#10b981',
  primaryLight: '#34d399',
  primaryDark: '#059669',

  // Status colors
  success: '#22c55e',
  error: '#ef4444',
  warning: '#f59e0b',
  info: '#3b82f6',

  // Neutral colors
  muted: '#6b7280',
  mutedLight: '#9ca3af',
  mutedDark: '#374151',

  // Text colors
  white: '#ffffff',
  text: '#f3f4f6',
  textDim: '#9ca3af',

  // Accent colors
  accent: '#06b6d4',
  highlight: '#8b5cf6',
} as const;

export const dimensions = {
  // Box widths
  boxWidth: 60,
  introWidth: 56,
  resultBoxWidth: 54,

  // Padding
  paddingX: 2,
  paddingY: 1,
} as const;

export const statusIcons = {
  pending: '\u25CB',     // ○
  running: '\u25CF',     // ● (animated spinner in component)
  completed: '\u2713',   // ✓
  failed: '\u2717',      // ✗
} as const;

export type ColorKey = keyof typeof colors;
export type DimensionKey = keyof typeof dimensions;
