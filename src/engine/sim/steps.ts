// Small world tick steps.

import { HISTORY } from '../../data/history';
import { SERIES_IDS, type SeriesId } from '../../data/markets';
import type { GameState } from '../types';
import { eventMonth } from '../world/drift';
import { pathFor } from '../world/macro';
import { marketValue } from '../world/marketPath';
import { weatherFor } from '../world/weather';
import type { TickContext } from './context';

export function refreshMarkets(state: GameState): void {
  const path = pathFor(state);
  const mi = state.clock.monthIndex;
  const prev = state.markets.current;
  const current: Partial<Record<SeriesId, number>> = {};
  for (const id of SERIES_IDS) {
    const v = marketValue(path, id, mi);
    if (Number.isFinite(v)) current[id] = v;
  }
  state.markets = { current, previous: Object.keys(prev).length ? prev : current };
}

export function stepWeather(ctx: TickContext): void {
  ctx.state.world.weather = weatherFor(ctx.state.setup.gameSeed, ctx.state.world.regionId, ctx.mi);
}

/** Fire historical events whose (drifted) date is this month. Returns fired ids. */
export function stepHistory(ctx: TickContext): string[] {
  const fired: string[] = [];
  for (const ev of HISTORY) {
    if (eventMonth(ev.id, ctx.state.drift) !== ctx.mi) continue;
    if (ctx.state.firedEvents.some((f) => f.id === ev.id)) continue;
    ctx.state.firedEvents.push({ id: ev.id, monthIndex: ctx.mi });
    ctx.inbox({ kind: 'history', title: ev.headline, body: ev.body, eventId: ev.id });
    fired.push(ev.id);
  }
  return fired;
}
