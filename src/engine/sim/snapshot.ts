import { COMMODITIES } from '../../data/grain';
import { balance } from '../ledger/ledger';
import { activityFor, balanceSheet, netSavingsOf } from '../ledger/statements';
import { totalAcres } from '../members/generate';
import type { GameState, MonthSnapshot } from '../types';

export function snapshot(state: GameState): MonthSnapshot {
  const mi = state.clock.monthIndex;
  const bs = balanceSheet(state.ledger, mi);
  let farms = 0;
  let acres = 0;
  let members = 0;
  let sat = 0;
  for (const m of state.members.list) {
    if (m.status !== 'active') continue;
    farms += m.weight;
    acres += totalAcres(m) * m.weight;
    if (m.kind === 'member') {
      members += m.weight;
      sat += m.satisfaction * m.weight;
    }
  }
  return {
    monthIndex: mi,
    cash: balance(state.ledger, '1000'),
    totalAssets: bs.totalAssets,
    equity: bs.totalEquity,
    netSavingsMonth: netSavingsOf(activityFor(state.ledger, mi, mi)),
    activeMembers: members,
    activeFarms: farms,
    totalAcres: acres,
    avgSatisfaction: members ? sat / members : 0,
    grainBu: COMMODITIES.reduce((a, c) => a + (state.coop.grain.report?.byCommodity[c]?.receivedBu ?? 0), 0),
    grainShare: state.coop.grainStats.marketBu > 0 ? COMMODITIES.reduce((a, c) => a + (state.coop.grain.report?.byCommodity[c]?.receivedBu ?? 0), 0) / state.coop.grainStats.marketBu : 0,
    lineDrawn: -balance(state.ledger, '2000'),
  };
}
