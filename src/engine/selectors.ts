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
