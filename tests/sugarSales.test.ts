import { describe, expect, it } from 'vitest';
import { advanceMonth, applyCommand, checkInvariants, DEFAULT_SETUP, marketingYear, newGame, type GameState } from '../src/engine/index';
import { SUGAR_SALES } from '../src/data/sugar';
import { monthOf } from '../src/engine/core/calendar';

const setup = (seed = 3) => ({ ...DEFAULT_SETUP, coopType: 'sugar' as const, startYear: 1985, gameSeed: seed, mapSeed: seed });
const run = (s: GameState, months: number, each?: (s: GameState) => void) => {
  for (let i = 0; i < months && !s.outcome; i++) {
    s = advanceMonth(s).state;
    each?.(s);
  }
  return s;
};

describe('sugar sales channels (D-141)', () => {
  it('a sugar co-op sells to industrial users, distributors and grocers, and its books tie', () => {
    const s0 = newGame(setup());
    expect(s0.coop.sugarPolicy.sales).toBeDefined();
    expect(s0.coop.sugar.brand).toBeGreaterThan(0);
    const seen = { contract: 0, spot: 0, wholesale: 0, retail: 0 };
    const s = run(s0, 14, (st) => {
      const r = st.coop.sugar.report;
      if (!r?.channels) return;
      const sum = Object.values(r.channels).reduce((a, c) => a + c.cwt, 0);
      expect(sum).toBeCloseTo(r.sugarSold, 3);
      for (const k of Object.keys(seen) as (keyof typeof seen)[]) seen[k] += r.channels[k].cwt;
    });
    expect(checkInvariants(s)).toEqual([]);
    expect(seen.contract).toBeGreaterThan(0);
    expect(seen.wholesale).toBeGreaterThan(0);
    expect(seen.retail).toBeGreaterThan(0);
    // Bulk sugar is the bulk of it.
    expect(seen.contract + seen.spot).toBeGreaterThan(seen.wholesale + seen.retail);
  }, 60_000);

  it('retail packs need a packaging line', () => {
    const s0 = newGame(setup());
    for (const f of s0.coop.facilities) if (f.kind === 'sugarfactory') {
      delete f.components['sugar-packaging'];
      f.units = f.units.filter((u) => u.component !== 'sugar-packaging');
    }
    let retail = 0;
    run(s0, 8, (st) => { retail += st.coop.sugar.report?.channels?.retail.cwt ?? 0; });
    expect(retail).toBe(0);
  }, 60_000);

  it('industrial contracts are priced in October for the marketing year', () => {
    let s = newGame(setup());
    let priced: { year: number; price: number } | undefined;
    s = run(s, 18, (st) => {
      if (monthOf(st.clock.monthIndex) === SUGAR_SALES.contractMonth + 1 && !priced) priced = st.coop.sugar.contractPrice;
    });
    expect(priced).toBeDefined();
    expect(priced!.price).toBeGreaterThan(0);
    expect(s.coop.sugar.contractPrice?.year).toBe(marketingYear(s.clock.monthIndex - 1));
  }, 60_000);

  it('a co-op with no sales policy sells everything in bulk at the market, as before', () => {
    const s0 = newGame(setup());
    s0.coop.sugarPolicy.sales = undefined;
    let other = 0;
    let spot = 0;
    run(s0, 8, (st) => {
      const c = st.coop.sugar.report?.channels;
      if (!c) return;
      other += c.contract.cwt + c.wholesale.cwt + c.retail.cwt;
      spot += c.spot.cwt;
    });
    expect(other).toBe(0);
    expect(spot).toBeGreaterThan(0);
  }, 60_000);

  it('brand support builds the brand and the policy is checked', () => {
    let s = newGame(setup());
    const b0 = s.coop.sugar.brand ?? 0;
    const pol = s.coop.sugarPolicy.sales!;
    expect(applyCommand(s, { type: 'setSugarPolicy', policy: { sales: { ...pol, retailShare: 0.9 } } }).state.coop.sugarPolicy.sales!.retailShare).toBe(pol.retailShare);
    s = applyCommand(s, { type: 'setSugarPolicy', policy: { sales: { ...pol, brand: 'strong' } } }).state;
    expect(s.coop.sugarPolicy.sales!.brand).toBe('strong');
    s = run(s, 24);
    expect(s.coop.sugar.brand!).toBeGreaterThan(b0 + 0.1);
  }, 60_000);
});
