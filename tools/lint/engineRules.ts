// Enforces the engine purity rules from CLAUDE.md (D-014): no DOM, React, wall-clock time,
// Math.random or browser storage inside src/engine. Test files are exempt.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const FORBIDDEN: [RegExp, string][] = [
  [/Math\.random\s*\(/, 'Math.random (use a named rng stream)'],
  [/Date\.now\s*\(/, 'Date.now (engine time is the game clock)'],
  [/new Date\s*\(/, 'new Date (engine time is the game clock)'],
  [/\bwindow\.[a-zA-Z]/, 'window'],
  [/\bdocument\.[a-zA-Z]/, 'document'],
  [/\blocalStorage\b|\bindexedDB\b|\bsessionStorage\b/, 'browser storage'],
  [/from ['"]react/, 'React import'],
  [/from ['"]\.\.\/\.\.\/ui|from ['"].*\/persistence/, 'UI or persistence import'],
];

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : p.endsWith('.ts') && !p.endsWith('.test.ts') ? [p] : [];
  });
}

let problems = 0;
for (const f of [...files('src/engine'), ...files('src/data')]) {
  readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
    if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;
    for (const [re, what] of FORBIDDEN) {
      if (re.test(line)) {
        console.error(`${f}:${i + 1}: forbidden in engine/data: ${what}`);
        problems++;
      }
    }
  });
}
if (problems) {
  console.error(`${problems} problem(s).`);
  process.exit(1);
}
console.log('Engine rules: OK');
