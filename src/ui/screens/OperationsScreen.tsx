import { RANDOM_EVENTS, REGULATIONS, TECH_ADDITIVE, TECHNOLOGIES, type TechDef, type TechEffectKey } from '../../data/events';
import {
  affectedSites, complianceCost, deadlineOf, formatMonth, isCompliant, nominalCents, pathFor, techCost, uncoveredSites, yearOf,
  type GameState,
} from '../../engine/index';
import { Panel, Stat } from '../components/Panel';
import { money } from '../format';
import { useStore } from '../store';

const EFFECT_LABEL: Record<TechEffectKey, string> = {
  delivery: 'delivery capacity', application: 'application acres per rig', shrink: 'handling shrink', officeCost: 'office costs',
  basis: 'basis captured ($/bu)', satisfaction: 'member satisfaction (points/month)', grainLabor: 'elevator labor', dustRisk: 'dust-explosion risk',
  conditionLoss: 'out-of-condition losses', cyberRisk: 'ransomware risk', incidents: 'injuries', supplyShare: 'agronomy preference',
};

function effectText(t: TechDef): string {
  return (Object.entries(t.effects) as [TechEffectKey, number][]).map(([k, v]) => {
    if (TECH_ADDITIVE.includes(k)) return `+${k === 'basis' ? `$${v.toFixed(3)}` : v} ${EFFECT_LABEL[k]}`;
    const d = Math.round((v - 1) * 100);
    return `${d > 0 ? '+' : ''}${d}% ${EFFECT_LABEL[k]}`;
  }).join(', ');
}

function techStatus(g: GameState, t: TechDef): { label: string; canAdopt: boolean } {
  const year = yearOf(g.clock.monthIndex);
  if (year < t.firstYear) return { label: `Available ${t.firstYear}`, canAdopt: false };
  const pending = g.tech.pending.filter((p) => p.id === t.id);
  if (t.kinds) {
    const qualifying = g.coop.facilities.filter((f) => f.status === 'operating' && t.kinds!.includes(f.kind as never));
    if (!qualifying.length) return { label: `Needs ${t.kinds.join(' or ')} site`, canAdopt: false };
    const covered = qualifying.length - uncoveredSites(g, t).length;
    const label = pending.length ? `Installing (${formatMonth(Math.max(...pending.map((p) => p.completeMonth)))})` : covered ? `${covered} of ${qualifying.length} sites` : 'Not adopted';
    return { label, canAdopt: uncoveredSites(g, t).length > 0 };
  }
  if (pending.length) return { label: `Installing (${formatMonth(pending[0].completeMonth)})`, canAdopt: false };
  if (g.tech.adopted[t.id]) return { label: `In service since ${formatMonth(g.tech.adopted[t.id].month)}`, canAdopt: false };
  return { label: 'Not adopted', canAdopt: true };
}

export function OperationsScreen() {
  const game = useStore((s) => s.game)!;
  const command = useStore((s) => s.command);
  const mi = game.clock.monthIndex;
  const year = yearOf(mi);
  const techs = TECHNOLOGIES.filter((t) => t.firstYear <= year + 3);
  const rules = REGULATIONS.filter((r) => game.regulation.active[r.id] !== undefined);
  const rows = rules.flatMap((r) => affectedSites(game, r).filter((f) => r.compliancePerSite > 0).map((f) => ({ r, f, ok: isCompliant(game, r, f), dl: deadlineOf(game, r)! })));
  const overdue = rows.filter((x) => !x.ok && mi > x.dl);
  const recent = [...game.eventLog].reverse().slice(0, 12);
  const site = (id: number) => game.coop.facilities.find((f) => f.id === id)?.name ?? 'Co-op wide';
  const adopted = Object.keys(game.tech.adopted).length;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Technologies in use" value={adopted} sub={game.tech.pending.length ? `${game.tech.pending.length} being installed` : undefined} />
        <Stat label="Rules in force" value={rules.length} />
        <Stat label="Sites out of compliance" value={rows.filter((x) => !x.ok).length} sub={overdue.length ? `${overdue.length} past deadline — fines running` : undefined} tone={overdue.length ? 'bad' : rows.some((x) => !x.ok) ? 'neutral' : 'good'} />
        <Stat label="Losses from events, 12 months" value={money(game.eventLog.filter((e) => mi - e.monthIndex < 12).reduce((a, e) => a + e.cost, 0))} sub="after insurance" />
      </div>

      <Panel title="Regulatory compliance">
        {rows.length ? (
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-stone-500"><tr><th className="py-1">Rule</th><th>Site</th><th>Deadline</th><th>Status</th><th className="text-right">Cost to comply</th><th /></tr></thead>
            <tbody>
              {rows.map(({ r, f, ok, dl }) => (
                <tr key={`${r.id}:${f.id}`} className="border-t border-stone-100">
                  <td className="py-1" title={r.description}>{r.label}</td>
                  <td>{f.name}</td>
                  <td>{formatMonth(dl)}</td>
                  <td className={ok ? 'text-field' : mi > dl ? 'font-semibold text-rust' : ''}>{ok ? 'Compliant' : game.regulation.shut[`${r.id}:${f.id}`] ? 'Shut by regulators' : mi > dl ? `Fined ${money(nominalCents(pathFor(game), mi, r.finePerMonth))}/mo` : 'Not yet'}</td>
                  <td className="num text-right">{ok ? '' : money(complianceCost(game, r))}</td>
                  <td className="text-right">{!ok && <button className="btn text-xs" onClick={() => command({ type: 'comply', ruleId: r.id, facilityId: f.id })}>Comply</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <p className="text-sm text-stone-500">No rules need work at our sites.</p>}
        {rules.some((r) => r.opexPerMonth > 0) && <p className="mt-2 text-xs text-stone-500">Ongoing costs of rules in force: {rules.filter((r) => r.opexPerMonth > 0).map((r) => r.label).join('; ')}. They post monthly to Regulatory compliance &amp; fines.</p>}
      </Panel>

      <Panel title="Technology">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-stone-500"><tr><th className="py-1">Technology</th><th>Effect</th><th>Status</th><th className="text-right">Cost</th><th /></tr></thead>
          <tbody>
            {techs.map((t) => {
              const st = techStatus(game, t);
              const n = t.kinds ? uncoveredSites(game, t).length : 1;
              return (
                <tr key={t.id} className="border-t border-stone-100 align-top">
                  <td className="py-1.5"><div className="font-medium">{t.name}</div><div className="text-xs text-stone-500">{t.description}</div></td>
                  <td className="text-xs">{effectText(t)}{t.kinds ? ' (per site covered)' : ''}</td>
                  <td className="text-xs">{st.label}</td>
                  <td className="num text-right">{st.canAdopt ? <>{money(techCost(game, t))}{t.kinds && n > 1 ? <div className="text-xs text-stone-500">{n} sites</div> : null}</> : ''}</td>
                  <td className="text-right">{st.canAdopt && <button className="btn text-xs" onClick={() => command({ type: 'adoptTech', techId: t.id })}>Adopt</button>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="mt-2 text-xs text-stone-500">Adoption is capitalized as equipment and depreciated over seven years. Spending above the board's capital limit goes to the board. A strong IT lead installs faster.</p>
      </Panel>

      <Panel title="Accidents and losses">
        {recent.length ? (
          <ul className="space-y-1 text-sm">
            {recent.map((e, i) => (
              <li key={i} className="flex justify-between gap-4"><span>{formatMonth(e.monthIndex)} — {RANDOM_EVENTS[e.id as keyof typeof RANDOM_EVENTS]?.label ?? e.id}, {site(e.facilityId)}</span><span className="num">{money(e.cost)}</span></li>
            ))}
          </ul>
        ) : <p className="text-sm text-stone-500">Nothing so far. Safety staffing, training, dust control and bin monitoring all lower the odds.</p>}
      </Panel>
    </div>
  );
}
