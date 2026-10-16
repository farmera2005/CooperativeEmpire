import { describe, expect, it } from 'vitest';
import { advanceMonth, applyCommand, checkInvariants, DEFAULT_SETUP, newGame, type GameState } from '../src/engine/index';
import { TYPICAL_SITE } from '../src/data/facilities';
import { MAINTENANCE } from '../src/data/grain';
import { breakdownRisk } from '../src/engine/facilities/facilities';
import { balance } from '../src/engine/ledger/ledger';
import { cloneState } from '../src/engine/sim/clone';
import { toMonthIndex } from '../src/engine/core/calendar';

/** A co-op with an elevator and an energy plant in operation. */
function coop(year: number, seed = 1): GameState {
  let s = newGame({ ...DEFAULT_SETUP, startYear: year, startingMembers: 400, gameSeed: seed, mapSeed: seed, capitalPreset: 'well' });
  s = applyCommand(s, { type: 'buyFacility', offerId: s.coop.offers.find((o) => o.kind === 'elevator')!.id, financePct: 0.5 }, { boardApproved: true }).state;
  s = applyCommand(s, { type: 'buildFacility', kind: 'energy', townId: s.coop.homeTownId, components: TYPICAL_SITE.energy, financePct: 0.5 }, { boardApproved: true }).state;
  const w = cloneState(s);
  // Finish construction in place: the project's components become the plant's.
  for (const p of w.coop.projects) {
    const f = w.coop.facilities.find((x) => x.id === p.facilityId)!;
    f.components = { ...p.components };
  }
  for (const f of w.coop.facilities) f.status = 'operating';
  w.coop.projects = [];
  return w;
}

const withUpkeep = (s: GameState, level: 'deferred' | 'routine' | 'preventive'): GameState => {
  const w = cloneState(s);
  for (const f of w.coop.facilities) f.maintenance = level;
  return w;
};

const run = (s: GameState, months: number) => {
  for (let i = 0; i < months; i++) s = advanceMonth(s).state;
  return s;
};

describe('maintenance', () => {
  it('preventive upkeep cuts breakdown risk; deferred and worn equipment raise it', () => {
    const f = coop(1995).coop.facilities[0];
    const at = (level: 'deferred' | 'routine' | 'preventive', condition: number) => breakdownRisk({ ...f, maintenance: level, condition });
    expect(at('preventive', 80)).toBeLessThan(at('routine', 80));
    expect(at('routine', 80)).toBeLessThan(at('deferred', 80));
    expect(at('routine', 30)).toBeGreaterThan(at('routine', 90));
    // Routine upkeep keeps the pre-maintenance risk exactly.
    expect(at('routine', 60)).toBeCloseTo(1 + 40 / 25);
  });

  it('preventive upkeep costs more in repairs and wears the plant more slowly', () => {
    const base = coop(1995, 2);
    const prev = run(withUpkeep(base, 'preventive'), 12);
    const def = run(withUpkeep(base, 'deferred'), 12);
    const repairs = (s: GameState) => s.ledger.months.slice(-12).reduce((a, m) => a + Object.entries(m.activity).filter(([k]) => k.startsWith('7200')).reduce((b, [, v]) => b + v, 0), 0);
    expect(repairs(prev)).toBeGreaterThan(repairs(def));
    for (const f of prev.coop.facilities) expect(f.condition).toBeGreaterThan(def.coop.facilities.find((x) => x.id === f.id)!.condition);
    expect(checkInvariants(prev)).toEqual([]);
  });

  it('a breakdown takes equipment out of service for the month and brings a repair bill', () => {
    // Every busy-season roll fails: an energy plant in December with deferred upkeep and worn trucks.
    let s = withUpkeep(coop(1995, 3), 'deferred');
    s = cloneState(s);
    s.clock = { ...s.clock };
    for (const f of s.coop.facilities) f.condition = 5;
    const saved = MAINTENANCE.supplyBreakdownMonthly.value;
    (MAINTENANCE.supplyBreakdownMonthly as { value: number }).value = 1;
    try {
      while (s.clock.monthIndex < toMonthIndex(1995, 12)) s = advanceMonth(s).state;
      const before = balance(s.ledger, '7200');
      s = advanceMonth(s).state;
      const plant = s.coop.facilities.find((f) => f.division === 'ENERGY')!;
      expect(plant.downMonth).toBe(s.clock.monthIndex);
      expect(s.inbox.some((i) => i.title === `Breakdown at ${plant.name}` && i.monthIndex === s.clock.monthIndex)).toBe(true);
      expect(balance(s.ledger, '7200') - before).toBeGreaterThan(0);
      const trucks = s.coop.supply.ENERGY.report!.capacity.find((c) => c.label === 'Delivery trucks')!;
      const full = trucks.available / (1 - MAINTENANCE.supplyCapacityLoss.value);
      expect(trucks.available).toBeLessThan(full);
      expect(checkInvariants(s)).toEqual([]);
    } finally {
      (MAINTENANCE.supplyBreakdownMonthly as { value: number }).value = saved;
    }
  });

  it('the GM sets a site\'s maintenance program', () => {
    const s = coop(1995, 4);
    const f = s.coop.facilities[0];
    const r = applyCommand(s, { type: 'setMaintenance', facilityId: f.id, level: 'preventive' });
    expect(r.ok).toBe(true);
    expect(r.state.coop.facilities.find((x) => x.id === f.id)!.maintenance).toBe('preventive');
    expect(applyCommand(s, { type: 'setMaintenance', facilityId: 99_999, level: 'preventive' }).ok).toBe(false);
  });
});
