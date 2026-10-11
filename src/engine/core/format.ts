// Plain-text formatting used by engine-generated messages.

import type { Cents } from './money';

export function formatCents(c: Cents, decimals = 0): string {
  const neg = c < 0;
  const d = Math.abs(c) / 100;
  const s = d.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  return `${neg ? '-' : ''}$${s}`;
}
