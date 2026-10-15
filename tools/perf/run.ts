// Performance check (M8): a large co-op played for many years. Game-over outcomes are cleared so
// the clock keeps running; this measures speed and save size, not balance.
//   npx tsx tools/perf/run.ts --members 5000 --years 60
import { advanceMonth, DEFAULT_SETUP, newGame, serializeSave, toSaveFile, yearOf, type GameState } from '../../src/engine/index';
import { POLICIES } from '../../src/engine/sim/policies';

const arg = (n: string, d: string) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : d; };
const members = Number(arg('members', '5000'));
const years = Number(arg('years', '60'));
let s: GameState = newGame({ ...DEFAULT_SETUP, startYear: 1970, startingMembers: members, gameSeed: 1, mapSeed: 1, capitalPreset: 'well' });
const t0 = performance.now();
let tDecade = t0;
let worst = 0;
let endings = 0;
for (let i = 0; i < years * 12; i++) {
  const t = performance.now();
  s = advanceMonth(s, POLICIES.baseline(s)).state;
  worst = Math.max(worst, performance.now() - t);
  if (s.outcome) { endings++; s = { ...s, outcome: null }; }
  if ((i + 1) % 120 === 0) {
    const ms = (performance.now() - tDecade) / 120;
    process.stdout.write(`${yearOf(s.clock.monthIndex)}: ${ms.toFixed(1)} ms/month, ${s.members.list.length} member records, ${s.history.length} snapshots\n`);
    tDecade = performance.now();
  }
}
const json = serializeSave(toSaveFile(s, 'perf', '2026-01-01T00:00:00Z'));
process.stdout.write(`\n${members} members x ${years} years: ${((performance.now() - t0) / 1000).toFixed(1)} s total, ${((performance.now() - t0) / (years * 12)).toFixed(1)} ms/month average, worst month ${worst.toFixed(0)} ms, save ${(json.length / 1e6).toFixed(1)} MB uncompressed, ${endings} game-over(s) cleared\n`);
