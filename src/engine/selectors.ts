// Read-only helpers for the UI. Nothing here changes state.

import { COMMODITIES, MAX_HAUL_MILES, type Commodity } from '../data/grain';
import { DIVISION_CONFIG } from '../data/supply';
import { valueAt } from '../data/types';
import { yearOf } from './core/calendar';
import type { GameState } from './types';
import { GRAIN_LINE, YIELD_SERIES } from './grain/operate';
import { pathFor } from './world/macro';
import { marketValue } from './world/marketPath';

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

export interface CatchmentTown {
  /** Business this facility draws from the town, in the catchment's unit. */
  value: number;
  /** Farms (or, for retail, residents) in the town whose business with us goes to this site. */
  farms: number;
  /** Our share of that business in the town. */
  share: number;
}

export interface FacilityCatchment {
  facilityId: number;
  unit: string;
  total: number;
  reachMiles: number;
  byTown: Record<number, CatchmentTown>;
}

/**
 * Where a facility's business comes from, by town (the map heatmap, D-119). Each farm's business
 * with us in the facility's division is credited to our nearest operating site of that division
 * within reach — the site that usually wins it, since our sites post the same prices — and
 * measured in the division's natural unit. An estimate from current shares, not a ledger figure.
 */
export function facilityCatchment(state: GameState, facilityId: number): FacilityCatchment | null {
  const f = state.coop.facilities.find((x) => x.id === facilityId);
  if (!f || f.status === 'closed') return null;
  const d = f.division;
  const year = yearOf(state.clock.monthIndex);
  const reachMiles = d === 'GRAIN' ? valueAt(MAX_HAUL_MILES, year) : d === 'CORP' ? 0 : DIVISION_CONFIG[d].reachMiles;
  const sites = state.coop.facilities.filter((x) => x.division === d && (x.status === 'operating' || x.id === f.id)).sort((a, b) => a.id - b.id);
  const dist = state.world.distances;
  /** Our site that serves a town: the nearest within reach, the lower id on a tie. */
  const servedBy = (townId: number): number | null => {
    let best: { id: number; dd: number } | null = null;
    for (const s of sites) {
      const dd = dist[townId][s.townId];
      if (dd > reachMiles) continue;
      if (!best || dd < best.dd) best = { id: s.id, dd };
    }
    return best?.id ?? null;
  };
  const byTown: Record<number, CatchmentTown> = {};
  for (const t of state.world.towns) byTown[t.id] = { value: 0, farms: 0, share: 0 };
  const served = new Set(state.world.towns.filter((t) => servedBy(t.id) === f.id).map((t) => t.id));
  let unit: string;
  if (d === 'RETAIL') {
    unit = 'residents';
    const book = state.coop.supply.RETAIL;
    for (const t of state.world.towns) {
      if (!served.has(t.id)) continue;
      const share = book.townShare[`${f.kind}:${t.id}`] ?? 0;
      byTown[t.id] = { value: t.population * share, farms: t.population, share };
    }
  } else {
    const path = pathFor(state);
    const yields = Object.fromEntries(COMMODITIES.map((c) => [c, marketValue(path, YIELD_SERIES[c], state.clock.monthIndex)])) as Record<Commodity, number>;
    unit = d === 'GRAIN' ? 'bushels a year' : d === 'FEED' ? 'head of livestock' : 'crop acres';
    const base: Record<number, number> = {};
    for (const m of state.members.list) {
      if (m.status !== 'active' || !served.has(m.townId)) continue;
      const crop = m.acres.corn + m.acres.soybeans + m.acres.wheat + m.acres.other;
      const head = m.livestock.hogs + m.livestock.dairy + m.livestock.beefCows + m.livestock.cattleOnFeed;
      let v = 0;
      let all = 0;
      if (d === 'GRAIN') for (const c of COMMODITIES) {
        const bu = m.acres[c] * yields[c] * m.weight;
        v += bu * (m.share[GRAIN_LINE[c]] ?? 0);
        all += bu;
      } else {
        const size = (d === 'FEED' ? head : crop) * m.weight;
        v = size * (m.share[d] ?? 0);
        all = size;
      }
      const b = byTown[m.townId];
      b.value += v;
      if (v > 0) b.farms += m.weight;
      base[m.townId] = (base[m.townId] ?? 0) + all;
    }
    for (const t of state.world.towns) if (base[t.id]) byTown[t.id].share = byTown[t.id].value / base[t.id];
  }
  const total = Object.values(byTown).reduce((a, b) => a + b.value, 0);
  return { facilityId, unit, total, reachMiles, byTown };
}
