// History drift plan (DESIGN §6.4, D-009): sampled once at newGame.

import { HISTORY, type YM } from '../../data/history';
import { DATA_END_YEAR } from '../../data/markets';
import { MARKETS_BUILD } from '../../data/tuning';
import { stream } from '../core/rng';
import { toMonthIndex } from '../core/calendar';
import type { DriftPlan, HistoryMode } from '../types';

export const ymToMonth = ([y, m]: YM): number => toMonthIndex(y, m);

export function makeDriftPlan(seed: number, mode: HistoryMode): DriftPlan {
  const plan: DriftPlan = {};
  if (mode === 'strict') return plan;
  const rng = stream(seed, -1, 'history.drift');
  const max = MARKETS_BUILD.driftMaxMonths;
  const [magLo, magHi] = MARKETS_BUILD.driftMagnitude.value;
  const lastMonth = toMonthIndex(DATA_END_YEAR, 12);
  const sorted = [...HISTORY].sort((a, b) => ymToMonth(a.date) - ymToMonth(b.date) || a.id.localeCompare(b.id));
  const effective: Record<string, number> = {};
  for (const ev of sorted) {
    const base = ymToMonth(ev.date);
    if (!ev.driftable) {
      effective[ev.id] = base;
      continue;
    }
    let shift = Math.round(rng.triangular(-max, 0, max));
    const magnitude = Math.round(rng.range(magLo, magHi) * 100) / 100;
    // Causality: never before a predecessor's (drifted) date.
    for (const pred of ev.after ?? []) {
      const p = effective[pred];
      if (p !== undefined && base + shift <= p) shift = p + 1 - base;
    }
    if (base + shift > lastMonth) shift = lastMonth - base;
    effective[ev.id] = base + shift;
    plan[ev.id] = { shiftMonths: shift, magnitude };
  }
  return plan;
}

export function eventMonth(id: string, plan: DriftPlan): number {
  const ev = HISTORY.find((e) => e.id === id);
  if (!ev) throw new Error(`Unknown history event ${id}`);
  return ymToMonth(ev.date) + (plan[id]?.shiftMonths ?? 0);
}
