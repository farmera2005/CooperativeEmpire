// Shared data-layer types. Every historical value or calibration constant carries a
// confidence flag so docs/DATA_REVIEW.md can list what needs expert review.

export type Confidence = 'high' | 'medium' | 'low';

export interface Sourced<T> {
  value: T;
  confidence: Confidence;
  source?: string;
  note?: string;
}

export interface AnnualPoint {
  year: number;
  value: number;
  confidence: Confidence;
  source?: string;
}

export const s = <T>(value: T, confidence: Confidence, note?: string, source?: string): Sourced<T> => ({
  value,
  confidence,
  ...(note ? { note } : {}),
  ...(source ? { source } : {}),
});

/**
 * Build an annual series from a compact start year + values list. Confidence can be
 * overridden for ranges of years (e.g. pre-1983 energy prices are low confidence).
 */
export function annual(
  startYear: number,
  values: readonly number[],
  confidence: Confidence,
  source?: string,
  overrides: readonly { from: number; to: number; confidence: Confidence; source?: string }[] = [],
): AnnualPoint[] {
  return values.map((value, i) => {
    const year = startYear + i;
    const o = overrides.find((r) => year >= r.from && year <= r.to);
    const src = o?.source ?? source;
    return { year, value, confidence: o?.confidence ?? confidence, ...(src ? { source: src } : {}) };
  });
}

/** Linear interpolation across (possibly sparse) annual anchors; clamps at the ends. */
export function valueAt(series: readonly AnnualPoint[], year: number): number {
  if (year <= series[0].year) return series[0].value;
  const last = series[series.length - 1];
  if (year >= last.year) return last.value;
  for (let i = 1; i < series.length; i++) {
    const b = series[i];
    if (year <= b.year) {
      const a = series[i - 1];
      return a.value + ((b.value - a.value) * (year - a.year)) / (b.year - a.year);
    }
  }
  return last.value;
}
