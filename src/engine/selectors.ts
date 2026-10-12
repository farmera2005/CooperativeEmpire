// Read-only helpers for the UI. Nothing here changes state.

import { COMMODITIES } from '../data/grain';
import type { GameState } from './types';
import { GRAIN_LINE } from './grain/operate';

/** The co-op's grain share of wallet by town (acre-weighted over active farms). */
export function grainShareByTown(state: GameState): Record<number, { share: number; farms: number; members: number }> {
  const out: Record<number, { share: number; farms: number; members: number; w: number }> = {};
  for (const t of state.world.towns) out[t.id] = { share: 0, farms: 0, members: 0, w: 0 };
  for (const m of state.members.list) {
    if (m.status !== 'active') continue;
    const o = out[m.townId];
    o.farms += m.weight;
    if (m.kind === 'member') o.members += m.weight;
    for (const c of COMMODITIES) {
      const a = m.acres[c] * m.weight;
      o.share += (m.share[GRAIN_LINE[c]] ?? 0) * a;
      o.w += a;
    }
  }
  const res: Record<number, { share: number; farms: number; members: number }> = {};
  for (const id in out) res[id] = { share: out[id].w > 0 ? out[id].share / out[id].w : 0, farms: out[id].farms, members: out[id].members };
  return res;
}

/** Share of wallet by town for a supply division (farm-weighted; retail uses town shares). */
export function supplyShareByTown(state: GameState, division: 'AGRONOMY' | 'FEED' | 'ENERGY' | 'RETAIL'): Record<number, number> {
  const out: Record<number, number> = {};
  if (division === 'RETAIL') {
    const book = state.coop.supply.RETAIL;
    for (const t of state.world.towns) out[t.id] = Math.max(book.townShare[`station:${t.id}`] ?? 0, book.townShare[`farmstore:${t.id}`] ?? 0);
    return out;
  }
  const sum: Record<number, [number, number]> = {};
  for (const m of state.members.list) {
    if (m.status !== 'active') continue;
    const s = (sum[m.townId] ??= [0, 0]);
    s[0] += (m.share[division] ?? 0) * m.weight;
    s[1] += m.weight;
  }
  for (const t of state.world.towns) out[t.id] = sum[t.id] && sum[t.id][1] > 0 ? sum[t.id][0] / sum[t.id][1] : 0;
  return out;
}
