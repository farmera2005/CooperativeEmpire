import { useState } from 'react';
import {
  competitorName, dealTitle, formatMonth, integrationPenalty, nominalCents, pathFor,
  type Competitor, type Deal, type DealStage, type DealTerms, type OpDivision,
} from '../../engine/index';
import { DEALS } from '../../data/competition';
import { Panel, Stat } from '../components/Panel';
import { money, pct } from '../format';
import { useStore } from '../store';

const STAGE_LABEL: Record<DealStage, string> = {
  proposed: 'They approached us', study: 'Study under way', terms: 'Ready for terms', board: 'Before our board',
  members: 'Member vote', closing: 'Closing', integration: 'Integrating', closed: 'Closed', dead: 'Ended',
};
const DIVISION_LABEL: Record<OpDivision, string> = { GRAIN: 'Grain', AGRONOMY: 'Agronomy', FEED: 'Feed', ENERGY: 'Energy', RETAIL: 'Retail' };
const JV_DIVISIONS: OpDivision[] = ['AGRONOMY', 'FEED', 'ENERGY'];

/** Strength is not published; the trade hears whether a company is struggling or flush. */
const strengthLabel = (x: number | undefined) => (x === undefined ? '—' : x < 30 ? 'Struggling' : x < 45 ? 'Under pressure' : x < 70 ? 'Steady' : 'Strong');
const strengthTone = (x: number | undefined) => (x !== undefined && x < 45 ? 'text-rust' : x !== undefined && x >= 70 ? 'text-field' : '');

export function DealsScreen() {
  const game = useStore((s) => s.game)!;
  const command = useStore((s) => s.command);
  const active = game.competitors.filter((c) => c.status === 'active').sort((a, b) => a.id - b.id);
  const open = game.deals.filter((d) => d.stage !== 'closed' && d.stage !== 'dead');
  const past = game.deals.filter((d) => d.stage === 'closed' || d.stage === 'dead').slice(-8).reverse();
  const ourDivisions = (Object.keys(DIVISION_LABEL) as OpDivision[]).filter((d) => d !== 'GRAIN' && game.coop.facilities.some((f) => f.status !== 'closed' && f.division === d));
  const integrating = integrationPenalty(game) > 0;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Deals in progress" value={open.length} sub={open.some((d) => d.incoming && d.stage === 'proposed') ? 'an approach awaits our answer' : undefined} tone={open.some((d) => d.incoming && d.stage === 'proposed') ? 'bad' : 'neutral'} />
        <Stat label="Joint ventures" value={game.jvs.length} sub={game.jvs.length ? money(game.jvs.reduce((a, j) => a + j.investment, 0)) + ' invested' : undefined} />
        <Stat label="Integration" value={integrating ? 'Under way' : 'None'} sub={integrating && game.integrationUntil !== null ? `systems combined by ${formatMonth(game.integrationUntil)}` : undefined} tone={integrating ? 'bad' : 'neutral'} />
        <Stat label="Active competitors" value={active.length} sub={`${active.filter((c) => c.kind === 'coop').length} cooperatives`} />
      </div>

      {open.length > 0 && (
        <Panel title="Pipeline">
          <div className="space-y-3">{open.map((d) => <DealCard key={d.id} d={d} />)}</div>
        </Panel>
      )}

      <Panel title="Competitors and potential partners">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-stone-500">
            <tr><th className="py-1">Company</th><th>Kind</th><th>Businesses</th><th>Health</th><th>Latest</th><th className="text-right">Talks</th></tr>
          </thead>
          <tbody>
            {active.map((c) => <CompetitorRow key={c.id} c={c} ourDivisions={ourDivisions} busy={open.some((d) => d.partnerId === c.id)} />)}
          </tbody>
        </table>
        <p className="mt-2 text-xs text-stone-500">A merger or joint-venture study costs {money(nominalCents(pathFor(game), game.clock.monthIndex, DEALS.studyCost.value))} and takes {DEALS.studyMonths} months; due diligence costs {money(nominalCents(pathFor(game), game.clock.monthIndex, DEALS.diligenceCost.value))}. Only cooperatives can merge with us.</p>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Sell a division">
          {ourDivisions.length ? (
            <div className="flex flex-wrap gap-2">
              {ourDivisions.map((d) => (
                <button key={d} className="btn" disabled={open.some((x) => x.kind === 'divisionSale' && x.division === d)} onClick={() => command({ type: 'proposeDivisionSale', division: d })}>Shop the {DIVISION_LABEL[d].toLowerCase()} division</button>
              ))}
            </div>
          ) : <p className="text-sm text-stone-500">We have no farm-supply divisions to sell.</p>}
          <p className="mt-2 text-xs text-stone-500">Advisers find a buyer and bring a price. The board and then the members must approve; the gain or loss is booked at closing.</p>
        </Panel>
        <Panel title="Joint ventures">
          {game.jvs.length ? (
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-stone-500"><tr><th>Venture</th><th>Our share</th><th className="text-right">Investment</th><th className="text-right">Earnings this year</th></tr></thead>
              <tbody>
                {game.jvs.map((j) => (
                  <tr key={j.id} className="border-t border-stone-100">
                    <td className="py-1">{j.name}<div className="text-xs text-stone-500">with {j.partnerName}, since {formatMonth(j.formedMonth)}</div></td>
                    <td>{pct(j.sharePct, 0)}</td>
                    <td className="num text-right">{money(j.investment)}</td>
                    <td className={`num text-right ${j.earningsYtd < 0 ? 'text-rust' : ''}`}>{money(j.earningsYtd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <p className="text-sm text-stone-500">None yet. Combine a division with a neighboring co-op's to share plants and cut costs.</p>}
        </Panel>
      </div>

      {past.length > 0 && (
        <Panel title="Recent deals">
          <ul className="space-y-1 text-sm">
            {past.map((d) => <li key={d.id}><b>{dealTitle(d)}</b> — {STAGE_LABEL[d.stage]}<span className="text-stone-500">: {d.log[d.log.length - 1]}</span></li>)}
          </ul>
        </Panel>
      )}
    </div>
  );
}

function CompetitorRow({ c, ourDivisions, busy }: { c: Competitor; ourDivisions: OpDivision[]; busy: boolean }) {
  const game = useStore((s) => s.game)!;
  const command = useStore((s) => s.command);
  const divisions = [...new Set(c.sites.map((x) => x.division ?? 'GRAIN'))];
  const jvOptions = JV_DIVISIONS.filter((d) => divisions.includes(d) && ourDivisions.includes(d));
  const [jv, setJv] = useState<OpDivision | ''>('');
  return (
    <tr className="border-t border-stone-100 align-top">
      <td className="py-1.5 font-medium">{competitorName(game, c)}{c.war && <span className="ml-1 rounded bg-rust px-1 text-xs text-white">price war</span>}</td>
      <td className="capitalize">{c.kind === 'coop' ? 'Co-op' : c.kind}</td>
      <td className="text-xs">{divisions.map((d) => DIVISION_LABEL[d as OpDivision]).join(', ')} · {c.sites.length} site{c.sites.length > 1 ? 's' : ''}</td>
      <td className={strengthTone(c.strength)}>{strengthLabel(c.strength)}</td>
      <td className="max-w-xs text-xs text-stone-600">{c.lastMove ?? ''}</td>
      <td className="whitespace-nowrap text-right">
        {c.kind === 'coop' && !busy && (
          <div className="flex justify-end gap-1">
            <button className="btn text-xs" onClick={() => command({ type: 'proposeMerger', partnerId: c.id })}>Study a merger</button>
            {jvOptions.length > 0 && (
              <>
                <select className="input text-xs" value={jv} onChange={(e) => setJv(e.target.value as OpDivision)} aria-label="Joint venture division">
                  <option value="">JV…</option>
                  {jvOptions.map((d) => <option key={d} value={d}>{DIVISION_LABEL[d]}</option>)}
                </select>
                <button className="btn text-xs" disabled={!jv} onClick={() => jv && command({ type: 'proposeJv', partnerId: c.id, division: jv })}>Study</button>
              </>
            )}
          </div>
        )}
        {busy && <span className="text-xs text-stone-500">in talks</span>}
      </td>
    </tr>
  );
}

function DealCard({ d }: { d: Deal }) {
  const game = useStore((s) => s.game)!;
  const command = useStore((s) => s.command);
  const [terms, setTerms] = useState<DealTerms>(d.terms ?? { name: d.kind === 'merger' ? `${game.coop.name.replace(/ Cooperative$| Co-op$/, '')} United Cooperative` : game.coop.name, partnerSeats: 2 });
  const e = d.estimate;
  const shown = (x: number) => (d.diligence ? money(x) : `≈ ${money(x)}`);
  return (
    <div className="rounded border border-stone-200 p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-semibold">{dealTitle(d)}</div>
          <div className="text-xs text-stone-500">{d.incoming ? 'They approached us' : 'Our initiative'} · started {formatMonth(d.startedMonth)} · <b>{STAGE_LABEL[d.stage]}</b>{d.stage === 'study' ? `, results ${formatMonth(d.stageUntil)}` : ''}</div>
        </div>
        {d.stage !== 'closing' && d.stage !== 'integration' && <button className="btn text-xs" onClick={() => command({ type: 'abandonDeal', dealId: d.id })}>Walk away</button>}
      </div>
      {d.stage !== 'proposed' && d.stage !== 'study' && (
        <div className="mt-2 grid grid-cols-2 gap-x-4 text-sm md:grid-cols-4">
          <div><span className="text-xs text-stone-500">{d.kind === 'divisionSale' ? 'Our plants, fair value' : 'Their plants, fair value'}</span><div className="num">{shown(e.fairValue)}</div></div>
          {d.kind !== 'divisionSale' && d.kind !== 'buyout' && <div><span className="text-xs text-stone-500">Their debt</span><div className="num">{shown(e.debt)}</div></div>}
          <div><span className="text-xs text-stone-500">Working capital</span><div className="num">{shown(e.workingCapital)}</div></div>
          {d.kind === 'merger' && <div><span className="text-xs text-stone-500">Their members</span><div className="num">{e.members}</div></div>}
          {d.terms?.price !== undefined && <div><span className="text-xs text-stone-500">Price offered</span><div className="num font-semibold">{money(d.terms.price)}</div></div>}
        </div>
      )}
      {!d.diligence && d.stage === 'terms' && d.kind !== 'divisionSale' && <p className="mt-1 text-xs text-rust">Figures are estimates until due diligence; they can be off by a third.</p>}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {d.stage === 'proposed' && d.incoming && (
          <>
            <button className="btn btn-primary" onClick={() => command({ type: 'respondDeal', dealId: d.id, accept: true })}>{d.kind === 'buyout' ? 'Hear their offer' : 'Study it'}</button>
            <button className="btn" onClick={() => command({ type: 'respondDeal', dealId: d.id, accept: false })}>Decline</button>
          </>
        )}
        {d.stage === 'terms' && (
          <>
            {!d.diligence && d.kind !== 'divisionSale' && d.kind !== 'buyout' && <button className="btn" onClick={() => command({ type: 'dealDiligence', dealId: d.id })}>Commission due diligence</button>}
            {d.kind === 'merger' && (
              <>
                <label className="text-sm">Combined name <input className="input ml-1 w-64" value={terms.name} onChange={(ev) => setTerms({ ...terms, name: ev.target.value })} /></label>
                <label className="text-sm">Their board seats <input className="input ml-1 w-14" type="number" min={0} max={5} value={terms.partnerSeats} onChange={(ev) => setTerms({ ...terms, partnerSeats: Number(ev.target.value) })} /></label>
              </>
            )}
            <button className="btn btn-primary" onClick={() => command({ type: 'submitDeal', dealId: d.id, terms })}>Send to the board</button>
          </>
        )}
        {d.stage === 'members' && <span className="text-sm text-stone-600">Ballots are out to the members.</span>}
        {(d.ourMembers || d.theirMembers) && (
          <span className="text-xs text-stone-500">
            {d.ourMembers && `Our members: ${pct(d.ourMembers.yesShare, 0)} yes (${d.ourMembers.passed ? 'passed' : 'failed'}). `}
            {d.theirMembers && `Theirs: ${pct(d.theirMembers.yesShare, 0)} yes.`}
          </span>
        )}
      </div>
      <details className="mt-2 text-xs text-stone-600">
        <summary className="cursor-pointer">Log</summary>
        <ul className="mt-1 list-disc pl-5">{d.log.map((l, i) => <li key={i}>{l}</li>)}</ul>
      </details>
    </div>
  );
}
