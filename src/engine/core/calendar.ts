// Time model: monthIndex = year * 12 + (month - 1). Fiscal years are labeled by the
// calendar year in which they end.

export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;
export const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

export const toMonthIndex = (year: number, month: number): number => year * 12 + (month - 1);
export const yearOf = (mi: number): number => Math.floor(mi / 12);
/** 1..12 */
export const monthOf = (mi: number): number => (mi % 12) + 1;
export const formatMonth = (mi: number): string => `${MONTH_NAMES[monthOf(mi) - 1]} ${yearOf(mi)}`;
export const formatMonthShort = (mi: number): string => `${MONTH_ABBR[monthOf(mi) - 1]} ${yearOf(mi)}`;

/** Fiscal year label containing month mi, for a fiscal year ending in month fyeMonth (1..12). */
export function fiscalYearOf(mi: number, fyeMonth: number): number {
  const y = yearOf(mi);
  return monthOf(mi) <= fyeMonth ? y : y + 1;
}

export const isFiscalYearEnd = (mi: number, fyeMonth: number): boolean => monthOf(mi) === fyeMonth;

/** First month index of fiscal year fy. */
export function fiscalYearStart(fy: number, fyeMonth: number): number {
  return toMonthIndex(fy, fyeMonth) - 11;
}

export function fiscalYearEnd(fy: number, fyeMonth: number): number {
  return toMonthIndex(fy, fyeMonth);
}

/** 1-based period number within the fiscal year. */
export function fiscalPeriod(mi: number, fyeMonth: number): number {
  return mi - fiscalYearStart(fiscalYearOf(mi, fyeMonth), fyeMonth) + 1;
}

export const isQuarterEnd = (mi: number, fyeMonth: number): boolean => fiscalPeriod(mi, fyeMonth) % 3 === 0;
