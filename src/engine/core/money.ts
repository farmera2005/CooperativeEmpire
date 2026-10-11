// Money is integer cents everywhere in the engine (D-005).

export type Cents = number;

/** Banker's rounding to an integer number of cents. */
export function roundCents(x: number): Cents {
  const r = Math.round(x);
  // Math.round rounds .5 up; fix exact halves to even.
  if (Math.abs(x - Math.trunc(x)) === 0.5) {
    const f = Math.floor(x);
    return f % 2 === 0 ? f : f + 1;
  }
  return r === 0 ? 0 : r; // normalize -0
}

export const dollars = (d: number): Cents => roundCents(d * 100);
export const toDollars = (c: Cents): number => c / 100;

/** Split an amount into integer parts proportional to weights; parts sum exactly to total. */
export function allocateCents(total: Cents, weights: readonly number[]): Cents[] {
  const sum = weights.reduce((a, b) => a + Math.max(0, b), 0);
  if (sum <= 0) return weights.map((_, i) => (i === 0 ? total : 0));
  const raw = weights.map((w) => (total * Math.max(0, w)) / sum);
  const parts = raw.map((r) => Math.trunc(r));
  let rem = total - parts.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => ({ i, frac: Math.abs(r - Math.trunc(r)) })).sort((a, b) => b.frac - a.frac || a.i - b.i);
  const step = rem > 0 ? 1 : -1;
  for (let k = 0; rem !== 0; k = (k + 1) % order.length) {
    parts[order[k].i] += step;
    rem -= step;
  }
  return parts;
}
