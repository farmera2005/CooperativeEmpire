import { type Cents, formatMonth, formatMonthShort } from '../engine/index';

export const money = (c: Cents, opts: { decimals?: number; compact?: boolean } = {}): string => {
  const d = c / 100;
  if (opts.compact && Math.abs(d) >= 1_000_000) return `${d < 0 ? '-' : ''}$${(Math.abs(d) / 1_000_000).toFixed(2)}M`;
  if (opts.compact && Math.abs(d) >= 10_000) return `${d < 0 ? '-' : ''}$${(Math.abs(d) / 1000).toFixed(0)}K`;
  const s = Math.abs(d).toLocaleString('en-US', { minimumFractionDigits: opts.decimals ?? 0, maximumFractionDigits: opts.decimals ?? 0 });
  return d < 0 ? `($${s})` : `$${s}`;
};
export const num = (x: number, decimals = 0): string => x.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
export const pct = (x: number, decimals = 1): string => `${(x * 100).toFixed(decimals)}%`;
export const signed = (x: number, decimals = 2): string => `${x >= 0 ? '+' : ''}${x.toFixed(decimals)}`;
export { formatMonth, formatMonthShort };
