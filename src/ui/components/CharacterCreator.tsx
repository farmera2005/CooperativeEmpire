// Career mode (D-142): make the general manager you play.

import { BACKGROUNDS, CAREER, CEO_STAT_INFO, CEO_STATS, type BackgroundId, type CeoStat } from '../../data/career';
import { makeCharacter, pointsFor, type CharacterInput } from '../../engine/index';

export const defaultCharacterInput = (): CharacterInput => ({
  name: '', female: false, age: 38, background: 'merchandiser',
  points: { finance: 4, operations: 4, commercial: 4, leadership: 4, boardRelations: 4, memberRelations: 4, negotiation: 4 },
});

export function CharacterCreator({ value, onChange, startYear }: { value: CharacterInput; onChange: (v: CharacterInput) => void; startYear: number }) {
  const total = pointsFor(value.age);
  const spent = CEO_STATS.reduce((a, k) => a + value.points[k], 0);
  const bg = BACKGROUNDS[value.background];
  const built = makeCharacter(value, startYear);
  const bump = (k: CeoStat, d: number) => {
    const next = value.points[k] + d;
    if (next < 0 || CAREER.statBase + next > CAREER.statMaxAtStart || (d > 0 && spent >= total)) return;
    onChange({ ...value, points: { ...value.points, [k]: next } });
  };
  const [a0, a1] = CAREER.ageRange;
  return (
    <div className="space-y-2 text-sm">
      <div className="grid grid-cols-2 gap-2">
        <label className="block">Name<input className="input mt-1 w-full" value={value.name} maxLength={40} onChange={(e) => onChange({ ...value, name: e.target.value })} placeholder="Your name" /></label>
        <label className="block">Age in {startYear}
          <input className="input mt-1 w-full" type="number" min={a0} max={a1} value={value.age} onChange={(e) => {
            const age = Math.max(a0, Math.min(a1, Math.round(Number(e.target.value) || a0)));
            // Fewer points at a younger age: take them back from the top stats.
            const points = { ...value.points };
            let over = CEO_STATS.reduce((a, k) => a + points[k], 0) - pointsFor(age);
            for (const k of [...CEO_STATS].sort((x, y) => points[y] - points[x])) while (over > 0 && points[k] > 0) { points[k]--; over--; }
            onChange({ ...value, age, points });
          }} />
        </label>
      </div>
      <label className="block">Background
        <select className="input mt-1 w-full" value={value.background} onChange={(e) => onChange({ ...value, background: e.target.value as BackgroundId })}>
          {(Object.keys(BACKGROUNDS) as BackgroundId[]).map((id) => <option key={id} value={id}>{BACKGROUNDS[id].label}</option>)}
        </select>
      </label>
      <p className="text-xs text-stone-500">{bg.description} Starting reputation about {bg.reputation}.</p>
      <div className="flex items-center justify-between"><b>Stats</b><span className={spent > total ? 'text-rust' : 'text-stone-600'}>{total - spent} of {total} points left</span></div>
      <table className="data text-sm">
        <tbody>
          {CEO_STATS.map((k) => {
            const b = bg.bonus[k] ?? 0;
            const v = CAREER.statBase + value.points[k] + b;
            return (
              <tr key={k} title={CEO_STAT_INFO[k].description}>
                <td>{CEO_STAT_INFO[k].label}<div className="text-xs text-stone-500">{CEO_STAT_INFO[k].description}</div></td>
                <td className="r whitespace-nowrap">
                  <button className="btn px-2 py-0" aria-label={`Lower ${CEO_STAT_INFO[k].label}`} onClick={() => bump(k, -1)}>−</button>
                  <b className="mx-2 inline-block w-6 text-center">{v}</b>
                  <button className="btn px-2 py-0" aria-label={`Raise ${CEO_STAT_INFO[k].label}`} onClick={() => bump(k, 1)}>+</button>
                  {b !== 0 && <span className="ml-1 text-xs text-stone-500">({b > 0 ? '+' : ''}{b} background)</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="text-xs text-stone-500">Stats run 1–20; 10 is an ordinary manager. Older characters have more points but fewer years before retirement at {CAREER.retireAge}. Stats grow with the years on the job and slip after {CAREER.declineFromAge}.</p>
      {typeof built === 'string' && <p className="text-xs text-rust">{built}</p>}
    </div>
  );
}
