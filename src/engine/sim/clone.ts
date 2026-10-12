// Working-copy clone (D-003). Copies everything a tick or command may mutate and shares,
// by reference, the parts that are immutable once created:
//  - map geometry (counties, towns, roads, destinations, distances) after newGame
//  - closed ledger months, history snapshots, grain reports, inbox items, fired events
// Code that changes a shared element must replace it (copy-on-write), never mutate it.

import { deepClone } from '../core/clone';
import type { GameState, Member } from '../types';

function cloneMember(m: Member): Member {
  return {
    ...m,
    acres: { ...m.acres },
    livestock: { ...m.livestock },
    grievances: m.grievances.map((g) => ({ ...g })),
    relationship: { ...m.relationship },
    share: { ...m.share },
    ytd: { ...m.ytd },
  };
}

export function cloneState(s: GameState): GameState {
  const { ledger, history, members, world, coop, inbox, firedEvents, equity, ...rest } = s;
  const c = deepClone(rest) as GameState;
  const months = ledger.months.slice(0, -1);
  months.push(deepClone(ledger.months[ledger.months.length - 1]));
  c.ledger = { balances: { ...ledger.balances }, months, nextEntryId: ledger.nextEntryId, firstMonth: ledger.firstMonth };
  c.history = history.slice();
  c.members = { list: members.list.map(cloneMember), nextId: members.nextId };
  c.world = { ...world, weather: { ...world.weather, fieldDays: world.weather.fieldDays.slice() }, rail: world.rail.map((r) => ({ ...r })) };
  const { grain, ...coopRest } = coop;
  c.coop = { ...deepClone(coopRest), grain: { ...deepClone({ ...grain, reports: [] }), reports: grain.reports.slice() } } as GameState['coop'];
  c.inbox = inbox.slice();
  c.firedEvents = firedEvents.slice();
  c.equity = { commonStock: { ...equity.commonStock }, preferredStock: { ...equity.preferredStock }, allocated: deepClone(equity.allocated) };
  return c;
}
