import { EFFECTS, ROLE_DEFS, ROLES, SALES_FORCE, SKILL_LABEL, SKILLS, TEAM, TRAITS, type Role, type Skill } from '../../data/people';
import {
  effect, effectiveSkill, flightRisk, formatMonthShort, holder, marketSalary, moraleDrivers, pathFor, payGapPct, salesBoost, salesCost, salesCoverage, salesStaff, siteFte, tightness, yearOf,
  type Candidate, type Leader, type OpDivision, type TrainingLevel,
} from '../../engine/index';
import { CommitNumber } from '../components/CommitNumber';
import { Panel, Stat } from '../components/Panel';
import { money, pct } from '../format';
import { useStore } from '../store';

const tightLabel = (t: number) => (t >= 1.2 ? 'Very tight' : t >= 1.05 ? 'Tight' : t > 0.92 ? 'Normal' : 'Slack');

function SkillBar({ range, primary }: { range: [number, number]; primary: boolean }) {
  return (
    <span className="inline-flex items-center gap-1" title={`${range[0]}–${range[1]} of 20`}>
      <span className="relative inline-block h-2 w-16 rounded bg-stone-200">
        <span className={`absolute h-2 rounded ${primary ? 'bg-field' : 'bg-stone-400'}`} style={{ left: `${((range[0] - 1) / 19) * 100}%`, width: `${Math.max(4, ((range[1] - range[0]) / 19) * 100)}%` }} />
      </span>
      <span className="w-10 text-right text-xs tabular-nums text-stone-600">{range[0] === range[1] ? range[0] : `${range[0]}–${range[1]}`}</span>
    </span>
  );
}

function Skills({ l, role }: { l: Leader; role: Role }) {
  const primary = ROLE_DEFS[role].primary;
  const order: Skill[] = [...primary, ...SKILLS.filter((k) => !primary.includes(k))];
  return (
    <div className="grid min-w-[26rem] grid-cols-2 gap-x-4 gap-y-0.5">
      {order.map((k) => (
        <div key={k} className="flex items-center justify-between gap-2 whitespace-nowrap text-xs">
          <span className={primary.includes(k) ? 'font-semibold' : 'text-stone-500'}>{SKILL_LABEL[k]}</span>
          <SkillBar range={l.revealed[k]} primary={primary.includes(k)} />
        </div>
      ))}
    </div>
  );
}

const Traits = ({ l }: { l: Leader }) => (
  <span className="text-xs">{l.traits.length ? l.traits.map((t) => <span key={t} className="mr-1 inline-block whitespace-nowrap rounded bg-[#efe6c9] px-1" title={TRAITS[t].description}>{TRAITS[t].label}</span>) : <span className="text-stone-500">no notable traits</span>}</span>
);

export function PeopleScreen() {
  const game = useStore((s) => s.game)!;
  const command = useStore((s) => s.command);
  const p = game.people;
  const t = tightness(game);
  const fte = Object.values(p.workforce).reduce((a, w) => a + (w?.fte ?? 0), 0);
  const morale = fte > 0 ? Object.values(p.workforce).reduce((a, w) => a + (w?.morale ?? 0) * (w?.fte ?? 0), 0) / fte : 60;
  const turnover = fte > 0 ? Object.values(p.workforce).reduce((a, w) => a + (w?.turnover ?? 0) * (w?.fte ?? 0), 0) / fte : 0;
  const incidents = p.incidents.filter((i) => game.clock.monthIndex - i.monthIndex < 12);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-6 gap-3">
        <Stat label="Labor market" value={tightLabel(t)} sub={`index ${t.toFixed(2)} (1 = normal)`} tone={t >= 1.1 ? 'bad' : 'neutral'} />
        <Stat label="Employees" value={Math.round(fte)} sub="full-time equivalents at our sites" />
        <Stat label="Staff morale" value={Math.round(morale)} tone={morale < 50 ? 'bad' : morale > 65 ? 'good' : 'neutral'} />
        <Stat label="Turnover" value={pct(turnover, 0)} sub="annualized" tone={turnover > 0.25 ? 'bad' : 'neutral'} />
        <Stat label="Incidents, 12 months" value={incidents.length} sub={`${incidents.filter((i) => i.serious).length} serious`} tone={incidents.some((i) => i.serious) ? 'bad' : 'neutral'} />
        <div className="panel px-3 py-2">
          <div className="text-xs uppercase tracking-wide text-stone-500">Training &amp; safety budget</div>
          <select className="input mt-1 w-full" aria-label="Training and safety budget" value={p.training} onChange={(e) => command({ type: 'setTraining', level: e.target.value as TrainingLevel })}>
            <option value="minimal">Minimal</option><option value="standard">Standard</option><option value="strong">Strong</option>
          </select>
        </div>
      </div>
      <LeadershipPanel />
      <CandidatesPanel />
      <SalesForcePanel />
      <div className="grid grid-cols-2 gap-4">
        <NotesPanel />
        <WorkforcePanel />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <EffectsPanel />
        <Panel title="Incidents">
          {!p.incidents.length ? <p className="text-sm text-stone-500">None recorded.</p> : (
            <ul className="space-y-1 text-sm">{[...p.incidents].reverse().slice(0, 12).map((i, k) => <li key={k} className={i.serious ? 'text-rust' : ''}>{formatMonthShort(i.monthIndex)} — {i.text}</li>)}</ul>
          )}
        </Panel>
      </div>
    </div>
  );
}

function LeadershipPanel() {
  const game = useStore((s) => s.game)!;
  const command = useStore((s) => s.command);
  const year = yearOf(game.clock.monthIndex);
  const p = game.people;
  return (
    <Panel title="Leadership team">
      <TeamToolbar />
      <table className="data">
        <thead><tr><th>Role</th><th>Who</th><th>Skills (what we know)</th><th>Traits</th><th className="r">Salary</th><th className="r">Morale</th><th></th></tr></thead>
        <tbody>
          {ROLES.map((role) => {
            const l = holder(game, role);
            const needed = p.needed.includes(role);
            const searching = p.searches.find((x) => x.role === role);
            if (!l) {
              return (
                <tr key={role} className={needed ? 'bg-[#f6e3dc]' : ''}>
                  <td>{ROLE_DEFS[role].label}</td>
                  <td colSpan={5} className="text-sm">
                    {needed ? <span className="text-rust">Vacant — you are covering it (effective skill {effectiveSkill(game, role, ROLE_DEFS[role].primary[0])}), and it eats your time.</span>
                      : <span className="text-stone-500">Not needed yet: location staff handle it.</span>}
                    {searching && <span className="ml-2 text-xs">Search under way; candidates {formatMonthShort(searching.readyMonth)}.</span>}
                  </td>
                  <td className="whitespace-nowrap">
                    {!searching && <>
                      <button className="btn py-0 text-xs" onClick={() => command({ type: 'startSearch', role, band: 'at' })} title={`Search firm fee ~${money(marketSalary(game, role) * 0.2, { compact: true })}`}>Search</button>
                      <button className="btn ml-1 py-0 text-xs" onClick={() => command({ type: 'startSearch', role, band: 'above' })}>Search, top pay</button>
                    </>}
                    <button className="btn ml-1 py-0 text-xs" onClick={() => command({ type: 'listInternal', role })}>Promote from within</button>
                    <button className="btn ml-1 py-0 text-xs" onClick={() => command({ type: 'poach', role })}>Poach</button>
                  </td>
                </tr>
              );
            }
            const market = marketSalary(game, role);
            return (
              <tr key={role}>
                <td>{ROLE_DEFS[role].label}</td>
                <td className="text-sm"><b>{l.name}</b><div className="text-xs text-stone-500">age {year - l.birthYear}, {Math.max(0, Math.round((game.clock.monthIndex - l.hiredMonth) / 12))} yr{l.retiring !== undefined ? `, retiring ${formatMonthShort(l.retiring)}` : ''}</div>{(l.flags.proposed ?? 0) > 0 && <div className="text-xs text-stone-500" title="Proposals brought to you, how many you approved, and how many have been reviewed as the right call">Proposals: {l.flags.proposed} made, {l.flags.approved ?? 0} approved, {l.flags.right ?? 0} proved right</div>}</td>
                <td><Skills l={l} role={role} /></td>
                <td><Traits l={l} /></td>
                <td className={`r text-sm ${l.salary < market * 0.95 ? 'text-rust' : ''}`}>{money(l.salary, { compact: true })}<div className="text-xs text-stone-500">market {money(market, { compact: true })}</div></td>
                <MoraleCell l={l} />
                <td className="whitespace-nowrap">
                  <button className="btn py-0 text-xs" onClick={() => command({ type: 'coach', leaderId: l.id })}>Coach</button>
                  {l.burnout >= 20 && <button className="btn ml-1 py-0 text-xs" onClick={() => command({ type: 'giveTimeOff', leaderId: l.id })} title="Clears burnout">Time off</button>}
                  <button className="btn ml-1 py-0 text-xs" onClick={() => command({ type: 'giveRaise', leaderId: l.id })}>Raise 5%</button>
                  <label className="ml-1 text-xs"><input type="checkbox" checked={l.bonusPlan} onChange={(e) => command({ type: 'setBonusPlan', leaderId: l.id, on: e.target.checked })} /> bonus plan</label>
                  <button className="btn ml-1 py-0 text-xs" onClick={() => command({ type: 'fireLeader', leaderId: l.id })}>Let go</button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mt-1 text-xs text-stone-500">Skill ranges narrow as you interview, check references and work with people. Coaching and interviews spend your time (political capital). Division managers bring proposals for their business to your inbox; how often they are right depends on their skill, and each one is reviewed months later.</p>
    </Panel>
  );
}

function CandidateRow({ c }: { c: Candidate }) {
  const game = useStore((s) => s.game)!;
  const command = useStore((s) => s.command);
  const year = yearOf(game.clock.monthIndex);
  const l = c.leader;
  return (
    <tr>
      <td>{ROLE_DEFS[l.role].label}</td>
      <td className="text-sm"><b>{l.name}</b><div className="text-xs text-stone-500">age {year - l.birthYear}; {c.source === 'internal' ? 'our own staff' : c.source === 'poach' ? 'at a competitor' : 'search firm'}; until {formatMonthShort(c.expiresMonth)}</div></td>
      <td><Skills l={l} role={l.role} /></td>
      <td>{c.interviewed ? <Traits l={l} /> : <span className="text-xs text-stone-500">interview to learn more</span>}{c.referenceNote && <div className="text-xs italic">{c.referenceNote}</div>}</td>
      <td className="r text-sm">{money(l.salary, { compact: true })}{c.signing > 0 && <div className="text-xs">+{money(c.signing, { compact: true })} signing</div>}</td>
      <td className="whitespace-nowrap">
        {!c.interviewed && <button className="btn py-0 text-xs" onClick={() => command({ type: 'interview', candidateId: c.id })}>Interview</button>}
        {!c.referenced && <button className="btn ml-1 py-0 text-xs" onClick={() => command({ type: 'checkReferences', candidateId: c.id })}>Check references</button>}
        <button className="btn btn-primary ml-1 py-0 text-xs" onClick={() => command({ type: 'hire', candidateId: c.id })}>Hire</button>
      </td>
    </tr>
  );
}

function CandidatesPanel() {
  const game = useStore((s) => s.game)!;
  const cs = game.people.candidates;
  if (!cs.length) return null;
  return (
    <Panel title="Candidates">
      <table className="data">
        <thead><tr><th>Role</th><th>Candidate</th><th>Skills (what we know)</th><th>Traits</th><th className="r">Asking</th><th></th></tr></thead>
        <tbody>{cs.map((c) => <CandidateRow key={c.id} c={c} />)}</tbody>
      </table>
    </Panel>
  );
}

function NotesPanel() {
  const game = useStore((s) => s.game)!;
  const notes = game.people.notes;
  return (
    <Panel title="This month's notes from your team">
      {!notes.length ? <p className="text-sm text-stone-500">No leaders to report yet. Their forecasts are only as good as their skill.</p> : (
        <ul className="space-y-2 text-sm">{notes.map((n) => <li key={n.leaderId}>{n.text}</li>)}</ul>
      )}
    </Panel>
  );
}

function WorkforcePanel() {
  const game = useStore((s) => s.game)!;
  const command = useStore((s) => s.command);
  const ops = game.coop.facilities.filter((f) => f.status === 'operating');
  return (
    <Panel title="Workforce and staffing">
      <table className="data">
        <thead><tr><th>Division</th><th className="r">FTE</th><th className="r">Morale</th><th className="r">Turnover</th><th className="r">Positions open</th></tr></thead>
        <tbody>
          {Object.entries(game.people.workforce).map(([d, w]) => w && (
            <tr key={d}><td>{d}</td><td className="r">{w.fte.toFixed(1)}</td><td className="r">{Math.round(w.morale)}</td><td className="r">{pct(w.turnover, 0)}</td><td className="r">{pct(w.vacancy, 0)}</td></tr>
          ))}
        </tbody>
      </table>
      {ops.length > 0 && (
        <table className="data mt-2">
          <thead><tr><th>Site</th><th className="r">FTE</th><th>Staffing</th><th>Pay</th></tr></thead>
          <tbody>
            {ops.map((f) => (
              <tr key={f.id}>
                <td>{f.name}</td><td className="r">{siteFte(game, f).toFixed(1)}</td>
                <td><select className="input py-0 text-xs" aria-label={`Staffing level at ${f.name}`} value={f.staffing.level} onChange={(e) => command({ type: 'setStaffing', facilityId: f.id, level: e.target.value as typeof f.staffing.level, pay: f.staffing.pay })}><option value="lean">Lean</option><option value="standard">Standard</option><option value="full">Full</option></select></td>
                <td><select className="input py-0 text-xs" aria-label={`Pay at ${f.name}`} value={f.staffing.pay} onChange={(e) => command({ type: 'setStaffing', facilityId: f.id, level: f.staffing.level, pay: e.target.value as typeof f.staffing.pay })}><option value="below">Below market</option><option value="at">At market</option><option value="above">Above market</option></select></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="mt-1 text-xs text-stone-500">Lean crews cost less but serve worse, burn out, quit more and get hurt more. In a tight labor market, below-market pay leaves positions (drivers, applicators) unfilled.</p>
    </Panel>
  );
}

function EffectsPanel() {
  const game = useStore((s) => s.game)!;
  const fmt = (v: number, unit: string) => (unit.startsWith('×') ? `${v >= 0 ? '+' : ''}${Math.round(v * 100)}%` : `${v >= 0 ? '+' : ''}${Math.abs(v) < 1 ? v.toFixed(3) : v.toFixed(1)}`);
  return (
    <Panel title="What your team's skills are doing">
      <table className="data">
        <thead><tr><th>Role</th><th>Skill</th><th>Effect</th><th className="r">Now</th></tr></thead>
        <tbody>
          {EFFECTS.map((e) => {
            const divisions = e.role === 'division' ? (['GRAIN', 'AGRONOMY', 'FEED', 'ENERGY', 'RETAIL'] as const).filter((d) => game.coop.facilities.some((f) => f.division === d)) : [undefined];
            return divisions.map((d) => (
              <tr key={`${e.key}-${d ?? ''}`}>
                <td>{e.role === 'division' ? `${d?.toLowerCase()} manager` : ROLE_DEFS[e.role].label}</td>
                <td>{SKILL_LABEL[e.skill]}</td>
                <td className="text-xs">{e.description} <span className="text-stone-500">({e.unit})</span></td>
                <td className="r">{fmt(effect(game, e.key, d), e.unit)}</td>
              </tr>
            ));
          })}
        </tbody>
      </table>
    </Panel>
  );
}

const SALES_LABEL: Record<OpDivision, string> = { GRAIN: 'Grain originators', AGRONOMY: 'Sales agronomists', FEED: 'Feed sales reps', ENERGY: 'Energy sales reps', RETAIL: 'Store sales staff' };

/** Salespeople by business unit (D-109). */
function SalesForcePanel() {
  const game = useStore((s) => s.game)!;
  const command = useStore((s) => s.command);
  const divisions = (Object.keys(SALES_LABEL) as OpDivision[]).filter((d) => game.coop.facilities.some((f) => f.division === d && f.status !== 'closed'));
  if (!divisions.length) return null;
  const mi = game.clock.monthIndex;
  return (
    <Panel title="Sales force">
      <table className="data">
        <thead><tr><th>Business unit</th><th>Salespeople</th><th className="r">Coverage</th><th className="r">Preference gain</th><th className="r">Cost a year</th></tr></thead>
        <tbody>
          {divisions.map((d) => (
            <tr key={d}>
              <td>{SALES_LABEL[d]}</td>
              <td><CommitNumber value={salesStaff(game, d)} min={0} max={SALES_FORCE.maxReps} step={1} onCommit={(n) => command({ type: 'setSalesStaff', division: d, count: n })} ariaLabel={`${SALES_LABEL[d]} headcount`} /></td>
              <td className="r">{pct(Math.min(1, salesCoverage(game, d)), 0)}</td>
              <td className="r">+{salesBoost(game, d).toFixed(2)}</td>
              <td className="r">{money(salesCost(game, d, pathFor(game), mi), { compact: true })}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-1 text-xs text-stone-500">A salesperson calls on about {SALES_FORCE.customersPerRep.value} farm customers. More coverage wins business and recruits members, with diminishing returns; a division manager strong in sales makes the team more effective. Preference gain is in the same units as service quality (a top division manager's sales skill is worth about +0.6).</p>
    </Panel>
  );
}

const RISK_STYLE = { low: 'text-stone-500', watch: 'text-amber-700', high: 'font-semibold text-rust' } as const;

/** Morale with its drivers on hover, and the leader's chance of leaving (D-110). */
function MoraleCell({ l }: { l: Leader }) {
  const game = useStore((s) => s.game)!;
  const { target, drivers } = moraleDrivers(game, l);
  const risk = flightRisk(game, l);
  const why = drivers.filter((d) => d.points !== 0).map((d) => `${d.label}: ${d.points > 0 ? '+' : ''}${Math.round(d.points)}`).join('\n');
  return (
    <td className={`r ${l.morale < 45 ? 'text-rust' : ''}`} title={`Heading toward ${Math.round(target)}\n${why}`}>
      {Math.round(l.morale)} <span className="text-xs text-stone-500">→ {Math.round(target)}</span>
      <div className={`text-xs ${RISK_STYLE[risk.level]}`}>{risk.level === 'low' ? 'settled' : risk.level === 'watch' ? 'watch' : 'flight risk'} · {pct(risk.annual, 0)}/yr</div>
      {l.burnout > 40 && <div className="text-xs text-rust">burnout {Math.round(l.burnout)}</div>}
    </td>
  );
}

/** Team-wide actions and the standing January policy (D-110). */
function TeamToolbar() {
  const game = useStore((s) => s.game)!;
  const command = useStore((s) => s.command);
  const team = game.people.leaders;
  if (!team.length) return null;
  const mi = game.clock.monthIndex;
  const underpaid = team.filter((l) => payGapPct(game, l) < 0);
  const raise = underpaid.reduce((a, l) => a + (l.salary * -payGapPct(game, l)) / 100, 0);
  const retreatReady = game.people.retreatMonth === undefined || mi - game.people.retreatMonth >= TEAM.retreatMonths;
  const atRisk = team.filter((l) => flightRisk(game, l).level !== 'low').length;
  const pol = game.people.teamPolicy ?? { autoPayMarket: false, autoBonus: false };
  const avgMorale = team.reduce((a, l) => a + l.morale, 0) / team.length;
  return (
    <div className="mb-3 rounded border border-stone-200 bg-stone-50 p-2 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span>Team morale <b>{Math.round(avgMorale)}</b>{atRisk ? <span className="ml-1 text-rust">· {atRisk} to watch</span> : ''}</span>
        <button className="btn py-0 text-xs" disabled={!underpaid.length} onClick={() => command({ type: 'payTeamToMarket' })}>Pay everyone at market{underpaid.length ? ` (+${money(raise, { compact: true })}/yr)` : ''}</button>
        <button className="btn py-0 text-xs" disabled={team.every((l) => l.bonusPlan)} onClick={() => command({ type: 'setTeamBonusPlans', on: true })}>Bonus plans for all</button>
        <button className="btn py-0 text-xs" disabled={!retreatReady} onClick={() => command({ type: 'holdRetreat' })} title="Lifts morale for a year">Leadership retreat{retreatReady ? '' : ' (held this year)'}</button>
        <label className="ml-2 flex items-center gap-1 text-xs"><input type="checkbox" checked={pol.autoPayMarket} onChange={(e) => command({ type: 'setTeamPolicy', policy: { ...pol, autoPayMarket: e.target.checked } })} /> keep pay at market each January</label>
        <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={pol.autoBonus} onChange={(e) => command({ type: 'setTeamPolicy', policy: { ...pol, autoBonus: e.target.checked } })} /> keep everyone on bonus plans</label>
      </div>
      <div className="mt-1 text-xs text-stone-500">Hover a morale number to see what drives it. You get an alert when someone becomes a flight risk.</div>
    </div>
  );
}
