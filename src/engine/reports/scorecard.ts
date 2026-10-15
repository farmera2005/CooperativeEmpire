// Scorecard (DESIGN §18): how the co-op is doing against what members and lenders expect of
// a sound local cooperative, from the annual reports and the latest month. Each measure scores
// 0–100 against a stated target; the overall grade weights them.

import { SCORECARD } from '../../data/tuning';
import { clamp } from '../core/math';
import { averageSatisfaction } from '../governance/review';
import type { GameState } from '../types';

export interface ScoreMeasure {
  key: string;
  label: string;
  value: number;
  unit: 'pct' | 'number' | 'score' | 'years';
  target: string;
  score: number;
  weight: number;
  note: string;
}

export interface Scorecard {
  measures: ScoreMeasure[];
  overall: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  years: number;
}

/** Linear score: 0 at `bad`, 100 at `good` (either direction). */
const lin = (x: number, bad: number, good: number) => clamp(((x - bad) / (good - bad)) * 100, 0, 100);

export function scorecard(s: GameState): Scorecard {
  const reps = s.reports.slice(-3);
  const hist = s.coop.equityProgram.history.slice(-3);
  const last = s.reports[s.reports.length - 1];
  const sales = reps.reduce((a, r) => a + r.sales, 0);
  const savings = reps.reduce((a, r) => a + r.savingsBeforeTax, 0);
  const margin = sales > 0 ? savings / sales : 0;
  const returned = hist.reduce((a, h) => a + h.cash + (h.redemption?.total ?? 0), 0);
  const patronageEarned = hist.reduce((a, h) => a + Math.max(0, h.patronageSourced), 0);
  const returnShare = patronageEarned > 0 ? returned / patronageEarned : 0;
  const equityPct = last?.ownerEquityPct ?? 0;
  const sat = averageSatisfaction(s);
  const share = s.history[s.history.length - 1]?.grainShare ?? 0;
  const first = s.reports[0];
  const growth = first && last && first !== last && first.activeMembers > 0 ? last.activeMembers / first.activeMembers - 1 : 0;
  const serious = s.people.incidents.filter((i) => i.serious && s.clock.monthIndex - i.monthIndex < 36).length;
  const lenderScore: Record<string, number> = { standard: 100, watch: 60, waiver: 35, specialCredit: 10, forcedAction: 0 };
  const W = SCORECARD.weights.value;
  const m: ScoreMeasure[] = [
    { key: 'savings', label: 'Net savings, last 3 years', value: margin, unit: 'pct', target: '2–4% of sales', score: lin(margin, -0.01, 0.025), weight: W.savings, note: 'Local co-ops typically earn 1–4% of sales.' },
    { key: 'equity', label: 'Owner equity', value: equityPct, unit: 'pct', target: '50% of assets or more', score: lin(equityPct, 0.2, 0.5), weight: W.equity, note: 'Strong equity carries a co-op through bad years and keeps the lender comfortable.' },
    { key: 'returns', label: 'Returned to members in cash, last 3 years', value: returnShare, unit: 'pct', target: '40% of patronage earnings or more', score: lin(returnShare, 0, 0.4), weight: W.returns, note: 'Cash patronage and equity redemptions: what members see of their co-op\'s earnings.' },
    { key: 'satisfaction', label: 'Member satisfaction', value: sat, unit: 'score', target: '60 or more', score: lin(sat, 30, 60), weight: W.satisfaction, note: 'Weighted by how much business each member does with us.' },
    { key: 'share', label: 'Share of area grain', value: share, unit: 'pct', target: '30% or more', score: lin(share, 0.05, 0.3), weight: W.share, note: 'Bushels received against all grain marketed in our trade area.' },
    { key: 'growth', label: 'Membership growth since the first annual report', value: growth, unit: 'pct', target: 'steady or growing', score: lin(growth, -0.3, 0.1), weight: W.growth, note: 'Farm numbers fall over time; mergers and new members offset it.' },
    { key: 'lender', label: 'Standing with the lender', value: lenderScore[s.coop.finance.status] ?? 50, unit: 'score', target: 'Standard', score: lenderScore[s.coop.finance.status] ?? 50, weight: W.lender, note: 'Covenant compliance at the last fiscal year end.' },
    { key: 'safety', label: 'Serious incidents, last 3 years', value: serious, unit: 'number', target: 'none', score: lin(serious, 3, 0), weight: W.safety, note: 'Explosions, rollovers and serious injuries.' },
    { key: 'board', label: 'Board confidence', value: s.governance.boardConfidence, unit: 'score', target: '60 or more', score: lin(s.governance.boardConfidence, 25, 60), weight: W.board, note: 'Your standing with the directors.' },
  ];
  const tw = m.reduce((a, x) => a + x.weight, 0);
  const overall = Math.round(m.reduce((a, x) => a + x.score * x.weight, 0) / tw);
  const grade = overall >= 85 ? 'A' : overall >= 70 ? 'B' : overall >= 55 ? 'C' : overall >= 40 ? 'D' : 'F';
  return { measures: m, overall, grade, years: Math.floor((s.clock.monthIndex - s.clock.startMonth) / 12) };
}
