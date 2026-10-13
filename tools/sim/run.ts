// Headless balance runner: npm run sim -- --start 1970 --years 55 --policy baseline --seeds 50
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { advanceMonth, DEFAULT_SETUP, newGame, incomeStatement, fiscalYearOf, type GameState } from '../../src/engine/index';
import { POLICIES, type PolicyId } from '../../src/engine/sim/policies';
import { yearOf } from '../../src/engine/core/calendar';

function arg(name: string, def: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}

const start = Number(arg('start', '1970'));
const years = Number(arg('years', '55'));
const policyId = arg('policy', 'baseline') as PolicyId;
const seeds = Number(arg('seeds', '10'));
const members = Number(arg('members', '400'));
const mode = arg('mode', 'drift') as 'drift' | 'strict';
const outRoot = arg('out', 'runs');
const policy = POLICIES[policyId];
if (!policy) throw new Error(`Unknown policy ${policyId}; choose ${Object.keys(POLICIES).join(', ')}`);

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const dir = join(outRoot, `${stamp}-${policyId}-${start}`);
mkdirSync(dir, { recursive: true });

const yearRows: string[] = ['seed,year,cash,equity,totalAssets,members,farms,acres,netSavingsFY,sales,grainBu,grainShare,lineDrawn,facilities,equityRatio'];
const seedRows: string[] = ['seed,survived,outcome,endYear,finalEquity,finalMembers,minEquity,negEquityYears,savingsPctOfSales,facilities,errors,msPerMonth'];
const pctAll: number[] = [];
let negSeeds = 0;
let survived = 0;
const outcomes: Record<string, number> = {};
let errors = 0;
const t0 = performance.now();

for (let seed = 1; seed <= seeds; seed++) {
  let s: GameState = newGame({ ...DEFAULT_SETUP, startYear: start, startingMembers: members, gameSeed: seed, mapSeed: seed, historyMode: mode });
  let err = '';
  const ts = performance.now();
  let months = 0;
  let minEquity = Infinity;
  let negYears = 0;
  let totSales = 0;
  let totSavings = 0;
  let grainBu = 0;
  try {
    for (let i = 0; i < years * 12; i++) {
      s = advanceMonth(s, policy(s)).state;
      months++;
      if (s.outcome) break;
      const mi = s.clock.monthIndex;
      const h = s.history[s.history.length - 1];
      grainBu += h.grainBu;
      if (mi % 12 === (s.setup.fiscalYearEndMonth - 1)) {
        const fy = fiscalYearOf(mi, s.setup.fiscalYearEndMonth);
        const is = incomeStatement(s.ledger, mi - 11, mi);
        minEquity = Math.min(minEquity, h.equity);
        if (h.equity < 0) negYears++;
        totSales += is.sales;
        totSavings += is.netSavings;
        const facs = s.coop.facilities.filter((f) => f.status !== 'closed').length;
        yearRows.push([seed, fy, h.cash / 100, h.equity / 100, h.totalAssets / 100, h.activeMembers, h.activeFarms, h.totalAcres, is.netSavings / 100, is.sales / 100, Math.round(grainBu), h.grainShare.toFixed(3), h.lineDrawn / 100, facs, h.totalAssets ? (h.equity / h.totalAssets).toFixed(3) : ''].join(','));
        grainBu = 0;
      }
    }
  } catch (e) {
    err = (e as Error).message.replace(/[,\n]/g, ' ');
    errors++;
  }
  // Three years of negative equity also counts as failure, even if neither the lender nor
  // the board has ended the game.
  const insolvent = negYears >= 3;
  const kind = s.outcome?.kind ?? (insolvent ? 'insolvent' : err ? 'error' : 'survived');
  outcomes[kind] = (outcomes[kind] ?? 0) + 1;
  if (insolvent) negSeeds++;
  const ok = !s.outcome && !err && !insolvent;
  if (ok) survived++;
  const h = s.history[s.history.length - 1];
  const pct = totSales > 0 ? totSavings / totSales : 0;
  if (totSales > 0) pctAll.push(pct);
  const facs = s.coop.facilities.filter((f) => f.status !== 'closed').length;
  seedRows.push([seed, ok, s.outcome?.kind ?? (insolvent ? 'insolvent' : ''), yearOf(s.clock.monthIndex), h.equity / 100, h.activeMembers, Number.isFinite(minEquity) ? minEquity / 100 : '', negYears, (pct * 100).toFixed(2), facs, `"${err}"`, ((performance.now() - ts) / Math.max(1, months)).toFixed(1)].join(','));
  process.stdout.write(`seed ${seed}/${seeds} ${ok ? 'ok' : 'FAILED'}${insolvent ? ' (insolvent)' : ''} savings ${(pct * 100).toFixed(2)}% of sales, ${facs} facilities${err ? `: ${err}` : ''}\n`);
}

const secs = (performance.now() - t0) / 1000;
void negSeeds;
writeFileSync(join(dir, 'years.csv'), yearRows.join('\n') + '\n');
writeFileSync(join(dir, 'seeds.csv'), seedRows.join('\n') + '\n');
pctAll.sort((a, b) => a - b);
const med = pctAll.length ? pctAll[Math.floor(pctAll.length / 2)] : 0;
const summary = `# Balance run\n\n- Policy: ${policyId}\n- Start: ${start}, years: ${years}, members: ${members}, mode: ${mode}\n- Seeds: ${seeds}\n- Survived: ${survived}/${seeds} (${Object.entries(outcomes).filter(([k]) => k !== 'survived').map(([k, n]) => `${k}: ${n}`).join(', ') || 'no failures'})\n- Median net savings: ${(med * 100).toFixed(2)}% of sales\n- Engine errors: ${errors}\n- Wall time: ${secs.toFixed(1)} s\n`;
writeFileSync(join(dir, 'summary.md'), summary);
process.stdout.write(`\n${summary}\nOutput: ${dir}\n`);
if (errors) process.exitCode = 1;
