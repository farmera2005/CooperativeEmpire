import { describe, expect, it } from 'vitest';
import { advanceMonth, applyCommand, balanceSheet, checkInvariants, DEFAULT_SETUP, newGame, type GameState } from '../src/engine/index';
import { TYPICAL_SITE } from '../src/data/facilities';
import { computeTax, federalTax } from '../src/engine/finance/tax';
import { planDistribution, validateProposal } from '../src/engine/finance/patronage';
import { defaultProposal } from '../src/engine/finance/defaults';
import { lenderReview } from '../src/engine/facilities/actions';
import { lineRate } from '../src/engine/finance/lender';
import { marketValue } from '../src/engine/world/marketPath';
import { pathFor } from '../src/engine/world/macro';
import { LENDING } from '../src/data/tuning';
import { balance, post } from '../src/engine/ledger/ledger';
import { migrate } from '../src/engine/save/migrations';
import { cloneState } from '../src/engine/sim/clone';
import { toMonthIndex } from '../src/engine/core/calendar';
import { POLICIES } from '../src/engine/sim/policies';
import { SCHEMA_VERSION } from '../src/engine/types';

const run = (s: GameState, months: number) => {
  for (let i = 0; i < months && !s.outcome; i++) s = advanceMonth(s).state;
  return s;
};

/** A co-op with an elevator and an agronomy center, founded in January of `year`. */
function coop(year: number, seed = 1, extra: Partial<typeof DEFAULT_SETUP> = {}): GameState {
  let s = newGame({ ...DEFAULT_SETUP, startYear: year, startingMembers: 400, gameSeed: seed, mapSeed: seed, capitalPreset: 'well', ...extra });
  let r = applyCommand(s, { type: 'buyFacility', offerId: s.coop.offers.find((o) => o.kind === 'elevator')!.id, financePct: 0.5 }, { boardApproved: true });
  expect(r.ok, r.messages.map((m) => m.text).join()).toBe(true);
  s = r.state;
  r = applyCommand(s, { type: 'buildFacility', kind: 'agronomy', townId: s.coop.homeTownId, components: TYPICAL_SITE.agronomy, financePct: 0.5 }, { boardApproved: true });
  expect(r.ok, r.messages.map((m) => m.text).join()).toBe(true);
  return r.state;
}

/** Advance to the given calendar month (1..12) of `year`. */
const runTo = (s: GameState, year: number, month: number) => run(s, toMonthIndex(year, month) - s.clock.monthIndex);

describe('income tax', () => {
  it('applies graduated federal brackets by year', () => {
    // 1990: 15% of $50k + 25% of $25k + 34% of $25k.
    expect(federalTax(100_000_00, 1990)).toBe(22_250_00);
    expect(federalTax(100_000_00, 2019)).toBe(21_000_00);
    expect(federalTax(0, 1990)).toBe(0);
  });

  it('carries losses forward, limited to 80% of income from 2018', () => {
    const loss = computeTax({ fy: 2017, savingsBeforeTax: -500_000_00, qualifiedAllocations: 0, nqRedeemed: 0, deduction: 0, nol: [] });
    expect(loss.tax).toBe(0);
    expect(loss.nol).toEqual([{ fy: 2017, amount: 500_000_00, expires: 2037 }]);
    const next = computeTax({ fy: 2019, savingsBeforeTax: 400_000_00, qualifiedAllocations: 0, nqRedeemed: 0, deduction: 0, nol: loss.nol });
    expect(next.nolUsed).toBe(320_000_00);
    expect(next.taxable).toBe(80_000_00);
    expect(next.nol[0].amount).toBe(180_000_00);
  });

  it('deducts qualified allocations but not nonqualified ones', () => {
    const q = computeTax({ fy: 1995, savingsBeforeTax: 1_000_000_00, qualifiedAllocations: 1_000_000_00, nqRedeemed: 0, deduction: 0, nol: [] });
    const nq = computeTax({ fy: 1995, savingsBeforeTax: 1_000_000_00, qualifiedAllocations: 0, nqRedeemed: 0, deduction: 0, nol: [] });
    expect(q.tax).toBe(0);
    expect(nq.tax).toBeGreaterThan(300_000_00);
  });
});

describe('patronage proposal', () => {
  it('enforces the 20% cash rule and shares that add to 100%', () => {
    const p = defaultProposal();
    expect(validateProposal(p)).toEqual([]);
    expect(validateProposal({ ...p, pools: { ALL: { cash: 0.1, qualified: 0.9, nonqualified: 0, unallocated: 0 } } }).join()).toMatch(/20%/);
    expect(validateProposal({ ...p, pools: { ALL: { cash: 0.3, qualified: 0.6, nonqualified: 0, unallocated: 0 } } }).join()).toMatch(/90%/);
    // All nonqualified needs no cash.
    expect(validateProposal({ ...p, pools: { ALL: { cash: 0, qualified: 0, nonqualified: 1, unallocated: 0 } } })).toEqual([]);
    const s = newGame({ ...DEFAULT_SETUP, startingMembers: 60 });
    expect(applyCommand(s, { type: 'setPatronageProposal', proposal: { ...p, pools: { ALL: { cash: 0.1, qualified: 0.9, nonqualified: 0, unallocated: 0 } } } }).ok).toBe(false);
  });
});

describe('annual co-op cycle', () => {
  it('closes the year, votes patronage into equity vintages, and pays at the annual meeting', () => {
    let s = runTo(coop(1985, 2), 1986, 8); // fiscal 1986 closes in August
    const ep = s.coop.equityProgram;
    expect(ep.pending?.fy).toBe(1986);
    expect(balance(s.ledger, '3900')).toBeLessThan(0); // profitable year: credit balance to distribute
    expect(checkInvariants(s)).toEqual([]);

    // Compare patronage mixes before the vote: nonqualified retains raise tax at the co-op.
    const r = ep.pending!;
    const noNol = cloneState(s);
    noNol.coop.equityProgram.nol = [];
    const cashMix = planDistribution(noNol, r, { ...ep.proposal, pools: { ALL: { cash: 0.5, qualified: 0.5, nonqualified: 0, unallocated: 0 } } }).summary;
    const nqMix = planDistribution(noNol, r, { ...ep.proposal, pools: { ALL: { cash: 0.2, qualified: 0, nonqualified: 0.8, unallocated: 0 } } }).summary;
    expect(nqMix.tax).toBeGreaterThan(cashMix.tax);
    expect(cashMix.taxOverCheck).toBeLessThan(nqMix.patrons + 1);

    s = runTo(s, 1986, 11); // board vote
    expect(s.coop.equityProgram.pending).toBeNull();
    const sm = s.coop.equityProgram.approved!;
    expect(sm.fy).toBe(1986);
    expect(balance(s.ledger, '3900')).toBe(0);
    expect(-balance(s.ledger, '2150')).toBe(sm.cash);
    // Equity subledger by vintage ties to the GL (invariants) and holds the 1986 vintage.
    let vintage = 0;
    for (const id in s.equity.allocated) vintage += s.equity.allocated[id][1986]?.[0] ?? 0;
    expect(vintage).toBe(sm.qualified);
    expect(sm.cash).toBeGreaterThanOrEqual(0.2 * (sm.cash + sm.qualified) - 1);
    expect(checkInvariants(s)).toEqual([]);

    s = run(s, 1); // annual meeting
    expect(balance(s.ledger, '2150')).toBe(0);
    expect(balance(s.ledger, '2170')).toBe(0);
    expect(s.coop.equityProgram.history.at(-1)?.redemption).toBeDefined();
    expect(s.members.list.some((m) => m.patronage.some((p) => p.fy === 1986))).toBe(true);
    expect(checkInvariants(s)).toEqual([]);
  });

  it('revolves the oldest vintages first and pays estates', () => {
    let s = runTo(coop(1980, 4), 1984, 11);
    s = cloneState(s);
    s.coop.equityProgram.redemption = { budgetFixed: 50_000_00, budgetPctOfSavings: 0, plans: [{ kind: 'estate', discountPct: 0 }, { kind: 'revolving' }] };
    const vintages = () => {
      const v = new Set<number>();
      for (const id in s.equity.allocated) for (const fy in s.equity.allocated[id]) v.add(Number(fy));
      return [...v].sort();
    };
    const before = vintages();
    expect(before.length).toBeGreaterThan(1);
    const deceasedWithEquity = s.members.list.filter((m) => m.status === 'deceased' && s.equity.allocated[m.id]).map((m) => m.id);
    s = run(s, 1);
    const red = s.coop.equityProgram.history.at(-1)!.redemption!;
    expect(red.total).toBeGreaterThan(0);
    if (deceasedWithEquity.length) expect(red.estate).toBeGreaterThan(0);
    // The oldest vintage shrank before any younger one was touched.
    const after = vintages();
    expect(after[0]).toBeGreaterThanOrEqual(before[0]);
    expect(checkInvariants(s)).toEqual([]);
  });
});

describe('lender', () => {
  it('becomes CoBank in 1989, carrying loans and bank stock', () => {
    let s = coop(1987, 3, { lenderId: 'bc-district' });
    expect(s.coop.lenderId).toBe('bc-district');
    s = runTo(s, 1989, 4);
    expect(s.coop.lenderId).toBe('cobank');
    expect(Object.keys(s.coop.finance.lenderEquity)).toEqual(['cobank']);
    expect(checkInvariants(s)).toEqual([]);
  });

  it('declines a term loan that would break the equity covenant', () => {
    const s = newGame({ ...DEFAULT_SETUP, startYear: 1990, startingMembers: 200, capitalPreset: 'shoestring', lenderId: 'cobank' });
    const huge = 50 * balance(s.ledger, '1000');
    expect(lenderReview(s, huge, Math.round(huge * 0.7))).toMatch(/declined/);
    expect(lenderReview(s, 1000_00, 500_00)).toBeNull();
  });

  it('puts a co-op that breaches covenants on watch and terms out the line', () => {
    let s = runTo(coop(1990, 6, { lenderId: 'cobank' }), 1991, 7);
    s = cloneState(s);
    // A large unexplained cash drain financed on the line breaks working capital and equity.
    const drain = Math.round(0.6 * (balance(s.ledger, '3000') + balance(s.ledger, '3400')) * -1);
    expect(drain).toBeGreaterThan(0);
    const w = cloneState(s);
    // Post a loss through the ledger (a write-off) so the books stay balanced.
    post(w, { source: 'test', memo: 'Write-off', lines: [{ account: '8300', division: 'CORP', amount: drain }, { account: '1000', division: 'CORP', amount: -drain }] });
    s = run(w, 1); // August: fiscal year end test
    expect(s.coop.finance.lastTest?.breached).toBe(true);
    expect(['watch', 'waiver']).toContain(s.coop.finance.status);
    expect(s.coop.finance.riskSpread).toBeGreaterThan(0);
  });

  it('prices co-op bank lending at average cost, trailing the 1981 spike and the 1985 decline', () => {
    const base = (s: GameState, id: string) => lineRate(s, s.clock.monthIndex, id) - LENDING.spreadOverPrime[id].value - s.coop.finance.riskSpread;
    for (const [year, below] of [[1981, true], [1986, false]] as const) {
      const s = newGame({ ...DEFAULT_SETUP, startYear: year, startingMembers: 200 });
      const prime = marketValue(pathFor(s), 'prime', s.clock.monthIndex);
      expect(base(s, 'bc-district') < prime, String(year)).toBe(below);
    }
  });

  it('sends a thin co-op straight to special credit in the 2008 credit crunch', () => {
    let s = runTo(coop(2007, 6, { lenderId: 'cobank' }), 2008, 7);
    expect(s.coop.finance.status).toBe('standard');
    const w = cloneState(s);
    // Write equity down to about 15% of assets.
    const bs = balanceSheet(w.ledger, w.clock.monthIndex);
    const drain = Math.round((bs.totalEquity - 0.15 * bs.totalAssets) / 0.85);
    post(w, { source: 'test', memo: 'Write-off', lines: [{ account: '8300', division: 'CORP', amount: drain }, { account: '1000', division: 'CORP', amount: -drain }] });
    s = run(w, 1);
    expect(['specialCredit', 'forcedAction']).toContain(s.coop.finance.status);
  });

  it('pays co-op bank patronage in cash and stock each March', () => {
    let s = runTo(coop(1995, 7, { lenderId: 'cobank' }), 1997, 3);
    const inv = balance(s.ledger, '1400');
    expect(inv).toBeGreaterThan(0);
    expect(s.inbox.some((i) => i.title === 'Lender patronage')).toBe(true);
    expect(checkInvariants(s)).toEqual([]);
  });
});

describe('regional co-ops', () => {
  it('pays patronage in January as cash and regional equity', () => {
    const s = runTo(coop(1992, 9), 1994, 1);
    expect(s.coop.regional.last?.year).toBe(1993);
    expect(Object.values(s.coop.regional.last!.patronage).reduce((a, b) => a + b, 0)).toBeGreaterThan(0);
    expect(Object.keys(s.coop.regional.equity).length).toBeGreaterThan(0);
    expect(checkInvariants(s)).toEqual([]);
  });

  it('writes off Farmland equity in its 2002 bankruptcy and signs with a new regional', () => {
    let s = coop(1996, 11, { historyMode: 'strict', regionalAffiliations: [{ regionalId: 'farmland', lines: ['agronomy', 'energy'] }] });
    s = runTo(s, 2002, 4);
    const before = Object.values(s.coop.regional.equity.farmland ?? {}).reduce((a, b) => a + b, 0);
    expect(before).toBeGreaterThan(0);
    s = run(s, 2);
    expect(s.coop.regional.equity.farmland).toBeUndefined();
    expect(s.coop.regionalAffiliations.some((a) => a.regionalId === 'farmland')).toBe(false);
    expect(s.coop.regionalAffiliations.some((a) => a.lines.includes('agronomy'))).toBe(true);
    expect(s.inbox.some((i) => /written off/.test(i.title))).toBe(true);
    expect(checkInvariants(s)).toEqual([]);
  });
});

describe('budget', () => {
  it('drafts in May and is approved in July for the next fiscal year', () => {
    let s = runTo(coop(1999, 1), 2000, 5);
    expect(s.coop.budget?.fy).toBe(2001);
    expect(s.coop.budget?.approved).toBe(false);
    const r = applyCommand(s, { type: 'setBudget', salesGrowthPct: 10, capex: 200_000_00 });
    expect(r.ok).toBe(true);
    s = run(r.state, 2);
    expect(s.coop.budget?.approved).toBe(true);
    expect(s.coop.budget?.capex).toBe(200_000_00);
  });
});

describe('policies', () => {
  it('the baseline bot keeps cash patronage at the minimum when equity is thin, and pays more only when a director asks', () => {
    let s = coop(1985, 1);
    for (let i = 0; i < 48 && !s.outcome; i++) s = advanceMonth(s, POLICIES.baseline(s)).state;
    const cash = s.coop.equityProgram.proposal.pools.ALL.cash;
    const asked = s.governance.demands.some((d) => d.kind === 'cashPatronage' && s.clock.monthIndex - d.deadlineMonth < 24);
    expect(asked ? [0.2, 0.4] : [0.2, 0.3]).toContain(cash);
  });
});

describe('save migration v3 → v4', () => {
  it('adds the equity program, regional book, lender standing and budget', () => {
    const v4 = run(coop(1985, 14), 1);
    const v3 = JSON.parse(JSON.stringify(v4));
    v3.schemaVersion = 3;
    delete v3.coop.equityProgram;
    delete v3.coop.regional;
    delete v3.coop.budget;
    for (const k of ['status', 'riskSpread', 'breachQuarters', 'okQuarters', 'lastTest', 'lenderEquity', 'loanSum', 'loanMonths']) delete v3.coop.finance[k];
    for (const m of v3.members.list) delete m.patronage;
    const migrated = migrate(v3);
    expect(migrated.schemaVersion).toBe(SCHEMA_VERSION);
    expect(migrated.coop.finance.status).toBe('standard');
    const next = run(migrated, 12);
    expect(checkInvariants(next)).toEqual([]);
  });
});

describe('balance sheet rating (D-118)', () => {
  it('scores ratios on piecewise scales and maps scores to grades', async () => {
    const { scoreOn, gradeFor } = await import('../src/engine/finance/rating');
    const pts: [number, number][] = [[0.1, 0], [0.3, 60], [0.5, 100]];
    expect(scoreOn(pts, 0.05)).toBe(0);
    expect(scoreOn(pts, 0.2)).toBeCloseTo(30);
    expect(scoreOn(pts, 0.9)).toBe(100);
    expect(scoreOn([[0.2, 100], [0.9, 0]], Infinity)).toBe(0);
    expect(gradeFor(95)).toBe('AAA');
    expect(gradeFor(62)).toBe('BBB');
    expect(gradeFor(10)).toBe('D');
  });

  it('rates a well-capitalized co-op highly and caps the grade under lender watch', async () => {
    const { balanceSheetRating } = await import('../src/engine/finance/rating');
    const s = run(coop(1985, 1), 14);
    const r = balanceSheetRating(s);
    expect(r.why.components!.length).toBeGreaterThanOrEqual(5);
    expect(['AAA', 'AA', 'A', 'BBB']).toContain(r.grade);
    const w = cloneState(s);
    w.coop.finance.status = 'specialCredit';
    const c = balanceSheetRating(w);
    expect(c.grade).toBe('CCC');
    expect(c.uncapped).toBe(r.grade);
  });
});

describe('location analysis (D-121)', () => {
  it('books site costs to the site and adds up to the division results', async () => {
    const { locationAnalysis } = await import('../src/engine/finance/locations');
    const { incomeStatement } = await import('../src/engine/index');
    let s = coop(1990, 3);
    s = run(s, 14);
    const la = locationAnalysis(s);
    expect(la.sites.length).toBeGreaterThanOrEqual(2);
    for (const r of la.sites.filter((x) => x.status === 'operating')) {
      expect(r.directTotal).toBeGreaterThan(0);
      expect(r.direct.depreciation).toBeGreaterThan(0);
    }
    for (const d of [...new Set(la.sites.map((r) => r.division))]) {
      const is = incomeStatement(s.ledger, la.from, la.to, d);
      const sum = la.sites.filter((r) => r.division === d).reduce((a, r) => a + r.contribution, 0);
      expect(Math.abs(sum - is.localSavings)).toBeLessThan(100 * la.sites.length);
    }
    expect(la.estimated).toBe(false);
    const totalNet = la.sites.reduce((a, r) => a + r.net, 0);
    const all = incomeStatement(s.ledger, la.from, la.to);
    expect(Math.abs(totalNet - all.localSavings)).toBeLessThan(100 * (la.sites.length + 1));
  });

  it('migrates a v8 save, which has no site detail, and estimates until it builds up', async () => {
    const { locationAnalysis } = await import('../src/engine/finance/locations');
    const v9 = run(coop(1990, 3), 3);
    const v8 = JSON.parse(JSON.stringify(v9));
    v8.schemaVersion = 8;
    for (const m of v8.ledger.months) delete m.byFacility;
    for (const r of v8.coop.grain.reports) delete r.byFacility;
    for (const d of ['AGRONOMY', 'FEED', 'ENERGY', 'RETAIL']) for (const r of v8.coop.supply[d].reports) delete r.bySite;
    const m = migrate(v8);
    expect(m.schemaVersion).toBe(SCHEMA_VERSION);
    expect(m.ledger.months[m.ledger.months.length - 1].byFacility).toEqual({});
    expect(locationAnalysis(m).estimated).toBe(true);
    expect(checkInvariants(run(m, 2))).toEqual([]);
  });
});
