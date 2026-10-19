import { useState } from 'react';
import {
  competitorName, dealTitle, forecastDealVote, formatMonth, forSale, integrationPenalty, investmentTypeOf, nominalCents, pathFor, sellerAcceptance, stakeSalePrice,
  type Competitor, type Deal, type DealStage, type DealTerms, type OpDivision,
} from '../../engine/index';
import { DEALS } from '../../data/competition';
import { INVESTMENTS } from '../../data/investments';
import { LENDING } from '../../data/tuning';
import { Term } from '../components/Term';
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
        <Stat label={<Term id="integration">Integration</Term>} value={integrating ? 'Under way' : 'None'} sub={integrating && game.integrationUntil !== null ? `systems combined by ${formatMonth(game.integrationUntil)}` : undefined} tone={integrating ? 'bad' : 'neutral'} />
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
        <p className="mt-2 text-xs text-stone-500">A merger or joint-venture study costs {money(nominalCents(pathFor(game), game.clock.monthIndex, DEALS.studyCost.value))} and takes {DEALS.studyMonths} months; due diligence costs {money(nominalCents(pathFor(game), game.clock.monthIndex, DEALS.diligenceCost.value))}. Only cooperatives can merge with us. A locally owned private company can be bought outright: a valuation brings the owner's asking price. National companies are not for sale.</p>
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
        <Panel title={<><Term id="joint-venture">Joint ventures</Term> and investments</>}>
          {game.jvs.length ? (
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-stone-500"><tr><th>Venture</th><th>Our share</th><th className="text-right">Investment</th><th className="text-right">Earnings this year</th><th /></tr></thead>
              <tbody>
                {game.jvs.map((j) => {
                  const type = investmentTypeOf(j);
                  return (
                    <tr key={j.id} className="border-t border-stone-100">
                      <td className="py-1">{j.name}<div className="text-xs text-stone-500">{type ? INVESTMENTS.value[type].label : `with ${j.partnerName}`}, since {formatMonth(j.formedMonth)}</div></td>
                      <td>{pct(j.sharePct, j.sharePct < 0.1 ? 1 : 0)}</td>
                      <td className="num text-right">{money(j.investment)}</td>
                      <td className={`num text-right ${j.earningsYtd < 0 ? 'text-rust' : ''}`}>{money(j.earningsYtd)}</td>
                      <td className="text-right">{type && <button className="btn py-0 text-xs" onClick={() => command({ type: 'sellStake', jvId: j.id })} title="A buyer pays book value, more after a good year and less after a bad one">Sell for {money(stakeSalePrice(game, j), { compact: true })}</button>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : <p className="text-sm text-stone-500">None yet. Combine a division with a neighboring co-op's to share plants and cut costs, or take a stake in one of the investment offers.</p>}
        </Panel>
      </div>

      <Panel title="Investment opportunities">
        {(game.investOffers ?? []).length ? (
          <div className="space-y-3">{(game.investOffers ?? []).map((o) => <InvestOfferRow key={o.id} id={o.id} />)}</div>
        ) : <p className="text-sm text-stone-500">No offers open. Local investors bring offers each January when a kind of plant is being built in the era: ethanol, biodiesel, soybean crushing, shuttle-train terminals, packing plants, wind, sugar.</p>}
        <p className="mt-2 text-xs text-stone-500">A stake is carried at cost plus our share of earnings; half of each year's earnings is paid out in cash. Returns swing with the industry, and young plants can fail. Stakes above the board's capital limit go to the board.</p>
      </Panel>

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
        {forSale(game, c) && !busy && <button className="btn text-xs" onClick={() => command({ type: 'proposeAcquisition', partnerId: c.id })}>Study a purchase</button>}
        {busy && <span className="text-xs text-stone-500">in talks</span>}
      </td>
    </tr>
  );
}

function DealCard({ d }: { d: Deal }) {
  const game = useStore((s) => s.game)!;
  const command = useStore((s) => s.command);
  const [terms, setTerms] = useState<DealTerms>(d.terms ?? { name: d.kind === 'merger' ? `${game.coop.name.replace(/ Cooperative$| Co-op$/, '')} United Cooperative` : game.coop.name, partnerSeats: 2 });
  // Acquisition offer in dollars and financed share; default to the asking price once it is known.
  const [offer, setOffer] = useState<number | null>(null);
  const [financePct, setFinancePct] = useState<number | null>(null);
  const offerCents = Math.round((offer ?? (d.terms?.price ?? 0) / 100) * 100);
  const financed = financePct ?? d.terms?.financePct ?? 0.6;
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
          {d.kind !== 'divisionSale' && d.kind !== 'buyout' && d.kind !== 'acquisition' && <div><span className="text-xs text-stone-500">Their debt</span><div className="num">{shown(e.debt)}</div></div>}
          <div><span className="text-xs text-stone-500">Working capital</span><div className="num">{shown(e.workingCapital)}</div></div>
          {d.kind === 'merger' && <div><span className="text-xs text-stone-500">Their members</span><div className="num">{e.members}</div></div>}
          {d.kind === 'acquisition' && d.asking !== undefined && <div><span className="text-xs text-stone-500">Owner's asking price</span><div className="num">{money(d.asking)}</div></div>}
          {d.terms?.price !== undefined && (d.kind !== 'acquisition' || d.stage !== 'terms') && <div><span className="text-xs text-stone-500">{d.kind === 'acquisition' ? 'Our offer' : 'Price offered'}</span><div className="num font-semibold">{money(d.terms.price)}</div></div>}
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
            {!d.diligence && d.kind !== 'divisionSale' && d.kind !== 'buyout' && <button className="btn" onClick={() => command({ type: 'dealDiligence', dealId: d.id })}><Term id="due-diligence">Commission due diligence</Term></button>}
            {d.kind === 'merger' && (
              <>
                <label className="text-sm">Combined name <input className="input ml-1 w-64" value={terms.name} onChange={(ev) => setTerms({ ...terms, name: ev.target.value })} /></label>
                <label className="text-sm">Their board seats <input className="input ml-1 w-14" type="number" min={0} max={5} value={terms.partnerSeats} onChange={(ev) => setTerms({ ...terms, partnerSeats: Number(ev.target.value) })} /></label>
              </>
            )}
            {d.kind === 'acquisition' && (
              <>
                <label className="text-sm">Our offer $ <input className="input ml-1 w-32" type="number" min={0} step={1000} value={Math.round(offerCents / 100)} onChange={(ev) => setOffer(Number(ev.target.value))} /></label>
                <label className="text-sm">Financed % <input className="input ml-1 w-16" type="number" min={0} max={Math.round(LENDING.maxFinancePct.value * 100)} value={Math.round(financed * 100)} onChange={(ev) => setFinancePct(Number(ev.target.value) / 100)} /></label>
                <span className="text-xs text-stone-500">Chance the owner accepts: {pct(sellerAcceptance(d, offerCents), 0)}</span>
              </>
            )}
            <button className="btn btn-primary" onClick={() => command({ type: 'submitDeal', dealId: d.id, terms: d.kind === 'acquisition' ? { ...terms, price: offerCents, financePct: financed } : terms })}>Send to the board</button>
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
      {(d.kind === 'merger' || d.kind === 'buyout') && (d.stage === 'terms' || d.stage === 'board') && <VoteForecast d={d} terms={d.stage === 'terms' ? terms : d.terms ?? terms} />}
      <details className="mt-2 text-xs text-stone-600">
        <summary className="cursor-pointer">Log</summary>
        <ul className="mt-1 list-disc pl-5">{d.log.map((l, i) => <li key={i}>{l}</li>)}</ul>
      </details>
    </div>
  );
}

/** How the member vote looks today, and why (the same model the vote uses). */
function VoteForecast({ d, terms }: { d: Deal; terms: DealTerms }) {
  const game = useStore((s) => s.game)!;
  const f = forecastDealVote(game, d, terms);
  const ok = f.expectedYes >= f.threshold;
  const theirsOk = f.theirExpectedYes === undefined || f.theirExpectedYes >= 2 / 3;
  return (
    <div className="mt-3 rounded bg-[#f6f1e1] p-3 text-sm">
      <div className="flex flex-wrap gap-x-6 gap-y-1">
        <span>Our members, if the vote were today: <b className={ok ? 'text-field' : 'text-rust'}>{pct(f.expectedYes, 0)} yes</b> <span className="text-stone-500">({pct(f.threshold, 0)} needed, turnout about {pct(f.turnout, 0)})</span></span>
        {f.theirExpectedYes !== undefined && <span>{d.partnerName}'s members: <b className={theirsOk ? 'text-field' : 'text-rust'}>{pct(f.theirExpectedYes, 0)} yes</b> <span className="text-stone-500">(<Term id="supermajority">⅔ needed</Term>)</span></span>}
      </div>
      <ul className="mt-1 grid gap-x-6 text-xs text-stone-600 md:grid-cols-2">
        {f.factors.map((x) => <li key={x.key} className="flex justify-between gap-2"><span>{x.label}</span><span className={`num ${x.value < 0 ? 'text-rust' : 'text-field'}`}>{x.value > 0 ? '+' : ''}{x.value.toFixed(2)}</span></li>)}
      </ul>
      <p className="mt-1 text-xs text-stone-500">
        Satisfied members follow the board; unhappy ones vote no. A vote is uncertain by a few points.
        {f.basedOnEstimates ? ' Based on our estimates of their books; due diligence shows members audited figures.' : ''}
        {!theirsOk ? ' Their members want more: more board seats or a new name for the combined co-op help.' : ''}
      </p>
    </div>
  );
}

/** One investment offer, with a stake to choose (D-112). */
function InvestOfferRow({ id }: { id: number }) {
  const game = useStore((s) => s.game)!;
  const command = useStore((s) => s.command);
  const o = (game.investOffers ?? []).find((x) => x.id === id)!;
  const d = INVESTMENTS.value[o.type];
  const [stake, setStake] = useState(Math.round(o.minStake / 100));
  const cents = Math.round(stake * 100);
  return (
    <div className="rounded border border-stone-200 p-3">
      <div className="font-semibold">{o.name} <span className="text-xs font-normal text-stone-500">· {d.label} · open until {formatMonth(o.expiresMonth)}</span></div>
      <p className="mt-1 text-sm text-stone-600">{d.description}</p>
      <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
        <span>Stake {money(o.minStake, { compact: true })}–{money(o.maxStake, { compact: true })}</span>
        <span>Typical return {Math.round(d.mean * 100)}% ± {Math.round(d.sd * 100)}% a year</span>
        <label>Our stake $ <input className="input ml-1 w-32" type="number" step={10000} value={stake} onChange={(e) => setStake(Number(e.target.value))} /></label>
        <span className="text-xs text-stone-500">{pct(cents / o.plantEquity, 1)} of the plant</span>
        <button className="btn btn-primary" onClick={() => command({ type: 'investInVenture', offerId: o.id, amount: cents })}>Invest</button>
      </div>
    </div>
  );
}
