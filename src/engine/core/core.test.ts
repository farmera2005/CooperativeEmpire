import { describe, expect, it } from 'vitest';
import { stream } from './rng';
import { allocateCents, roundCents } from './money';
import { fiscalPeriod, fiscalYearOf, isFiscalYearEnd, toMonthIndex } from './calendar';

describe('rng', () => {
  it('is deterministic per stream', () => {
    const a = stream(42, 100, 'x');
    const b = stream(42, 100, 'x');
    expect([a.next(), a.next(), a.next()]).toEqual([b.next(), b.next(), b.next()]);
  });
  it('separates named streams', () => {
    expect(stream(42, 100, 'x').next()).not.toEqual(stream(42, 100, 'y').next());
    expect(stream(42, 100, 'x').next()).not.toEqual(stream(42, 101, 'x').next());
  });
  it('produces sane distributions', () => {
    const r = stream(1, 0, 'dist');
    let s = 0;
    let s2 = 0;
    const n = 20000;
    for (let i = 0; i < n; i++) {
      const z = r.normal();
      s += z;
      s2 += z * z;
    }
    expect(Math.abs(s / n)).toBeLessThan(0.03);
    expect(Math.abs(s2 / n - 1)).toBeLessThan(0.05);
  });
});

describe('money', () => {
  it('uses banker rounding', () => {
    expect(roundCents(2.5)).toBe(2);
    expect(roundCents(3.5)).toBe(4);
    expect(roundCents(-2.5)).toBe(-2);
    expect(roundCents(2.4)).toBe(2);
  });
  it('allocates exactly', () => {
    const parts = allocateCents(1000, [1, 1, 1]);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(1000);
    expect(Math.max(...parts) - Math.min(...parts)).toBeLessThanOrEqual(1);
    expect(allocateCents(-7, [2, 1]).reduce((a, b) => a + b, 0)).toBe(-7);
  });
});

describe('calendar', () => {
  it('labels fiscal years by the year they end (FYE August)', () => {
    expect(fiscalYearOf(toMonthIndex(1975, 8), 8)).toBe(1975);
    expect(fiscalYearOf(toMonthIndex(1975, 9), 8)).toBe(1976);
    expect(fiscalPeriod(toMonthIndex(1975, 9), 8)).toBe(1);
    expect(fiscalPeriod(toMonthIndex(1976, 8), 8)).toBe(12);
    expect(isFiscalYearEnd(toMonthIndex(1976, 8), 8)).toBe(true);
    expect(fiscalYearOf(toMonthIndex(1976, 12), 12)).toBe(1976);
  });
});
