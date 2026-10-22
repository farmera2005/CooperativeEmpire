// Balance sheet rating (D-118): a letter grade, with the why, from the ratios a co-op lender reads.

import { BS_RATING } from '../../data/finance';
import { bd, type Breakdown } from '../core/breakdown';
import { clamp } from '../core/math';
import { ratios } from '../ledger/ratios';
import type { GameState } from '../types';
import { STATUS_LABEL } from './covenants';

export interface BalanceSheetRating {
  grade: string;
  score: number;
  /** The grade the ratios alone would earn, when the lender's standing caps it lower. */
  uncapped?: string;
  why: Breakdown;
}

/** Piecewise-linear score through [ratio, score] points; flat beyond the ends. */
export function scoreOn(points: [number, number][], x: number): number {
  if (!Number.isFinite(x)) x = x > 0 ? Number.MAX_VALUE : -Number.MAX_VALUE;
  if (x <= points[0][0]) return points[0][1];
  for (let i = 1; i < points.length; i++) {
    const [x0, y0] = points[i - 1];
    const [x1, y1] = points[i];
    if (x <= x1) return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
  }
  return points[points.length - 1][1];
}

export const gradeFor = (score: number): string => BS_RATING.grades.value.find(([, min]) => score >= min)?.[0] ?? 'D';
const rank = (g: string) => BS_RATING.grades.value.findIndex(([x]) => x === g);

export function balanceSheetRating(state: GameState): BalanceSheetRating {
  const r = ratios(state);
  const P = BS_RATING.parts.value;
  const fmt = (x: number, d = 2) => (Number.isFinite(x) ? x.toFixed(d) : 'no term debt');
  const parts: { key: keyof typeof P; label: string; value: number; shown: string; note: string }[] = [
    { key: 'equity', label: 'Solvency: owner equity / total assets', value: r.ownerEquityPct, shown: `${(r.ownerEquityPct * 100).toFixed(1)}%`, note: '40–50% is healthy; lenders get nervous well before 30%.' },
    { key: 'liquidity', label: 'Liquidity: current ratio', value: r.currentRatio, shown: fmt(r.currentRatio), note: 'Current assets over current liabilities; 1.25 or better is comfortable.' },
    { key: 'fixedFinancing', label: 'Term debt / net fixed assets', value: r.termDebtToNetFixed, shown: `${(r.termDebtToNetFixed * 100).toFixed(0)}%`, note: 'How much of the plant is still owed to the bank.' },
    { key: 'debtService', label: 'Debt service coverage', value: r.debtServiceCoverage, shown: fmt(r.debtServiceCoverage), note: 'Cash earnings over term loan payments, trailing 12 months; below 1.25 worries the lender.' },
    { key: 'earnings', label: 'Return on local equity', value: r.returnOnLocalEquity, shown: `${(r.returnOnLocalEquity * 100).toFixed(1)}%`, note: 'Local savings over equity, trailing 12 months.' },
  ];
  let score = 0;
  const comps: Breakdown[] = [];
  for (const p of parts) {
    const s = scoreOn(P[p.key].points, p.value);
    score += P[p.key].weight * s;
    comps.push(bd(`r-${p.key}`, `${p.label}: ${p.shown}`, P[p.key].weight * s, [bd(`r-${p.key}-score`, `Scored ${Math.round(s)} of 100, weight ${Math.round(P[p.key].weight * 100)}%`, s, undefined, undefined, 'score')], p.note, 'score'));
  }
  score = clamp(score, 0, 100);
  const byRatios = gradeFor(score);
  const status = state.coop.finance.status;
  const cap = BS_RATING.statusCap[status] ?? 'AAA';
  const capped = rank(byRatios) < rank(cap);
  const grade = capped ? cap : byRatios;
  if (capped) comps.push(bd('r-cap', `Lender standing: ${STATUS_LABEL[status]} (best grade ${cap})`, 0, undefined, 'While the lender has the credit on watch or worse, the grade cannot rise above this.', 'score'));
  const why = bd('bs-rating', `Balance sheet rating ${grade}`, score, comps, `Weighted score out of 100: AAA 90+, AA 80+, A 70+, BBB 60+ (a sound credit), BB 50+, B 40+, CCC 25+, D below.`, 'score');
  return { grade, score, ...(capped ? { uncapped: byRatios } : {}), why };
}
