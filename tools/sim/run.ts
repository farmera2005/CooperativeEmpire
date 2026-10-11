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

const yearRows: string[] = ['seed,year,cash,equity,totalAssets,members,farms,acres,netSavingsFY,sales'];
const seedRows: string[] = ['seed,survived,outcome,endYear,finalEquity,finalMembers,errors,msPerMonth'];
let survived = 0;
let errors = 0;
const t0 = performance.now();

for (let seed = 1; seed <= seeds; seed++) {
  let s: GameState = newGame({ ...DEFAULT_SETUP, startYear: start, startingMembers: members, gameSeed: seed, mapSeed: seed, historyMode: mode });
  let err = '';
  const ts = performance.now();
  let months = 0;
  try {
    for (let i = 0; i < years * 12; i++) {
      s = advanceMonth(s, policy(s)).state;
      months++;
      if (s.outcome) break;
      const mi = s.clock.monthIndex;
      if (mi % 12 === (s.setup.fiscalYearEndMonth - 1)) {
        const fy = fiscalYearOf(mi, s.setup.fiscalYearEndMonth);
        const is = incomeStatement(s.ledger, mi - 11, mi);
        const h = s.history[s.history.length - 1];
        yearRows.push([seed, fy, h.cash / 100, h.equity / 100, h.totalAssets / 100, h.activeMembers, h.activeFarms, h.totalAcres, is.netSavings / 100, is.sales / 100].join(','));
      }
    }
  } catch (e) {
    err = (e as Error).message.replace(/[,\n]/g, ' ');
    errors++;
  }
  const ok = !s.outcome && !err;
  if (ok) survived++;
  const h = s.history[s.history.length - 1];
  seedRows.push([seed, ok, s.outcome?.kind ?? '', yearOf(s.clock.monthIndex), h.equity / 100, h.activeMembers, `"${err}"`, ((performance.now() - ts) / Math.max(1, months)).toFixed(1)].join(','));
  process.stdout.write(`seed ${seed}/${seeds} ${ok ? 'ok' : 'FAILED'}${err ? `: ${err}` : ''}\n`);
}

const secs = (performance.now() - t0) / 1000;
writeFileSync(join(dir, 'years.csv'), yearRows.join('\n') + '\n');
writeFileSync(join(dir, 'seeds.csv'), seedRows.join('\n') + '\n');
const summary = `# Balance run\n\n- Policy: ${policyId}\n- Start: ${start}, years: ${years}, members: ${members}, mode: ${mode}\n- Seeds: ${seeds}\n- Survived: ${survived}/${seeds}\n- Engine errors: ${errors}\n- Wall time: ${secs.toFixed(1)} s\n`;
writeFileSync(join(dir, 'summary.md'), summary);
process.stdout.write(`\n${summary}\nOutput: ${dir}\n`);
if (errors) process.exitCode = 1;
