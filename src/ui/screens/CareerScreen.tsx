// Career mode (D-142): your character, contract and reputation; asking the board for better
// terms; offers from other co-ops and negotiating them; the job search after a job ends.

import { useState } from 'react';
import { CAREER, CEO_STAT_INFO, CEO_STATS } from '../../data/career';
import {
  ageOf, askBoard, backgroundLabel, boardSlack, boardWillingness, counterOffer, declineOffer, formatMonth, marketPay, raiseWindow,
  regionLabel, resign, retire, searchMonth, type Ask,
} from '../../engine/index';
import type { CareerState, GameState, JobOffer } from '../../engine/types';
import { CommitNumber } from '../components/CommitNumber';
import { Panel, Stat } from '../components/Panel';
import { money, num, pct } from '../format';
import { useStore } from '../store';

const END_LABEL: Record<string, string> = { fired: 'let go', resigned: 'resigned', notRenewed: 'contract not renewed', liquidated: 'co-op liquidated', absorbed: 'co-op merged away', moved: 'moved on', retired: 'retired' };

/** Your read of how far a board might go, rounded the way a GM would think about it. */
const roughly = (cents: number) => money(Math.round(cents / 500_000) * 500_000, { compact: true });

function TermsForm({ start, onSubmit, label }: { start: Ask; onSubmit: (a: Ask) => void; label: string }) {
  const [base, setBase] = useState(Math.round(start.base / 100));
  const [bonus, setBonus] = useState(Math.round(start.bonusTarget * 100));
  const [sev, setSev] = useState(start.severanceMonths);
  const [b0, b1] = CAREER.bonusTargetRange;
  const [s0, s1] = CAREER.severanceRange;
  return (
    <div className="flex flex-wrap items-end gap-2 text-sm">
      <label>Base $<CommitNumber className="input w-28" min={1000} max={50_000_000} value={base} onCommit={setBase} ariaLabel="Base salary" /></label>
      <label>Bonus target <CommitNumber min={Math.round(b0 * 100)} max={Math.round(b1 * 100)} value={bonus} onCommit={setBonus} ariaLabel="Bonus target percent" />%</label>
      <label>Severance <CommitNumber min={s0} max={s1} value={sev} onCommit={setSev} ariaLabel="Severance months" /> months</label>
      <button className="btn btn-primary" onClick={() => onSubmit({ base: base * 100, bonusTarget: bonus / 100, severanceMonths: sev })}>{label}</button>
    </div>
  );
}

function CharacterPanel({ c }: { c: CareerState }) {
  return (
    <Panel title={`${c.character.name}, ${ageOf(c)}`}>
      <p className="mb-2 text-sm text-stone-600">{backgroundLabel(c)}. Retires at {CAREER.retireAge}.</p>
      <table className="data text-sm">
        <tbody>
          {CEO_STATS.map((k) => (
            <tr key={k} title={CEO_STAT_INFO[k].description}>
              <td>{CEO_STAT_INFO[k].label}</td>
              <td className="w-40"><div className="h-2 rounded bg-stone-200"><div className="h-2 rounded bg-field" style={{ width: `${c.character.stats[k] * 5}%` }} /></div></td>
              <td className="r font-semibold">{c.character.stats[k]}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-xs text-stone-500">10 is an ordinary manager. Your stats add to what your managers deliver, cover roles you have not filled, and shape how the board and members see you. A good year on the job may raise one.</p>
    </Panel>
  );
}

function ContractPanel({ game, c }: { game: GameState; c: CareerState }) {
  const careerAct = useStore((s) => s.careerAct);
  const k = c.contract;
  const w = raiseWindow(game);
  if (!k) return null;
  const going = marketPay(game);
  const willing = boardWillingness(game);
  // A better negotiator reads the board more closely.
  const fuzz = Math.max(0.01, 0.08 - 0.005 * (c.character.stats.negotiation - 10));
  const value = k.base * (1 + willing);
  return (
    <Panel title={`Your contract with ${k.coopName}`}>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Base pay" value={money(k.base, { compact: true })} sub={`going rate for the job about ${money(going, { compact: true })}`} />
        <Stat label="Bonus target" value={pct(k.bonusTarget, 0)} sub="of base at a review of 75; nothing at 50, twice at 100" />
        <Stat label="Severance" value={`${k.severanceMonths} months`} sub="if the board lets you go" />
        <Stat label="Term ends" value={formatMonth(k.endMonth)} sub={`renewed if board confidence is ${CAREER.renewConfidence}+`} />
      </div>
      <div className="mt-3 space-y-2 text-sm">
        <b>Ask the board for better terms</b>
        {w.open ? (
          <>
            <p className="text-stone-600">Your read: after this review the board might go to about {roughly(value * (1 - fuzz))}–{roughly(value * (1 + fuzz))} in base pay, or the same value in bonus and severance.{c.offers.length > 0 ? ' Another board\'s offer in hand helps.' : ''} A refused ask costs some board confidence; a greedy one costs more.</p>
            <TermsForm start={k} label="Make the ask" onSubmit={(a) => careerAct((g) => askBoard(g, a))} />
          </>
        ) : <p className="text-stone-500">{w.reason}</p>}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button className="btn" onClick={() => { if (window.confirm(`Resign from ${k.coopName}? The job ends now and you look for work without severance.`)) careerAct(resign); }}>Resign</button>
        {ageOf(c) >= 55 && <button className="btn" onClick={() => { if (window.confirm('Retire for good? The career ends.')) careerAct(retire); }}>Retire</button>}
      </div>
    </Panel>
  );
}

function OfferCard({ o, c }: { o: JobOffer; c: CareerState }) {
  const careerAct = useStore((s) => s.careerAct);
  const takeJob = useStore((s) => s.takeJob);
  const busy = useStore((s) => s.busy);
  const [open, setOpen] = useState(false);
  const slack = boardSlack(c, c.status === 'employed' || c.offers.length > 1);
  const final = o.rounds >= CAREER.maxRounds;
  return (
    <div className="rounded border border-stone-300 p-3 text-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <b>{o.coopName}</b>
        <span className="text-xs text-stone-500">{o.coopType === 'sugar' ? 'sugar beet co-op' : 'grain & farm supply'} · {regionLabel(o.regionId)}{o.neighbor ? ' · our neighbor' : ''} · open until {formatMonth(o.expiresMonth)}</span>
      </div>
      <p className="mt-1 text-stone-600">{o.note}</p>
      <p className="mt-1">Base <b>{money(o.base, { compact: true })}</b> a year · bonus target <b>{pct(o.bonusTarget, 0)}</b> · severance <b>{o.severanceMonths} months</b> · {o.termYears}-year agreement{o.rounds > 0 ? ` · ${final ? 'final offer' : `after ${o.rounds} counter`}` : ''}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <button className="btn btn-primary" disabled={!!busy} onClick={() => { if (window.confirm(c.status === 'employed' ? `Leave ${c.contract?.coopName} and take the job at ${o.coopName}?` : `Take the job at ${o.coopName}?`)) takeJob(o.id); }}>Accept</button>
        {!final && <button className="btn" onClick={() => setOpen(!open)}>Negotiate</button>}
        <button className="btn" onClick={() => careerAct((g) => declineOffer(g, o.id))}>Decline</button>
      </div>
      {open && !final && (
        <div className="mt-2 space-y-1">
          <p className="text-xs text-stone-500">Boards go some way past their opening offer: more for a GM with a name and negotiating skill, more again when you could walk away (a job you hold or another offer). Your read: this board has room of roughly {Math.round(slack * 100)}% in the package's value. Ask far past it and it may withdraw the offer. {CAREER.maxRounds} counters at most.</p>
          <TermsForm start={o} label="Send counteroffer" onSubmit={(a) => { careerAct((g) => counterOffer(g, o.id, a)); setOpen(false); }} />
        </div>
      )}
    </div>
  );
}

export function CareerScreen() {
  const game = useStore((s) => s.game)!;
  const careerAct = useStore((s) => s.careerAct);
  const c = game.career;
  if (!c) return null;
  const searching = c.status === 'searching';
  const waitForOffer = () => careerAct((g) => {
    let s = g;
    const messages: { level: 'info' | 'error'; text: string }[] = [];
    for (let i = 0; i < 12; i++) {
      const r = searchMonth(s);
      if (!r.ok) return { state: g, ok: false, messages: r.messages };
      s = r.state;
      if ((s.career?.offers.length ?? 0) > (g.career?.offers.length ?? 0) || s.career?.status !== 'searching') { messages.push(...r.messages); break; }
    }
    if (!messages.length) messages.push({ level: 'info', text: 'A year passed without a call.' });
    return { state: s, ok: true, messages };
  });
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline gap-3">
        <h1 className="headline text-2xl font-bold">Career</h1>
        <span className="text-sm text-stone-600">{formatMonth(c.monthIndex)} · {c.status === 'employed' ? `general manager of ${c.contract?.coopName}` : searching ? 'looking for work' : 'retired'}</span>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Reputation" value={`${c.reputation}/100`} sub="standing in the industry: who calls, and what they pay" />
        <Stat label="Career earnings" value={money(c.earnings, { compact: true })} sub="salary, bonuses and severance" />
        <Stat label="Co-ops led" value={num(c.stints.length)} sub={`${num(c.stints.reduce((a, s) => a + s.reviews.length, 0))} annual reviews`} />
        <Stat label="Offers open" value={num(c.offers.length)} sub={`at most ${CAREER.maxOpenOffers}`} />
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <CharacterPanel c={c} />
        {c.status === 'employed' ? <ContractPanel game={game} c={c} /> : (
          <Panel title={searching ? 'Looking for work' : 'Retired'}>
            {searching ? (
              <div className="space-y-2 text-sm">
                <p>Boards looking for a general manager call through search consultants and the co-op grapevine. A stronger reputation brings more calls from bigger co-ops.{(c.severanceLeft ?? 0) > 0 ? ` Severance: ${c.severanceLeft} more months of pay.` : ''}</p>
                <div className="flex flex-wrap gap-2">
                  <button className="btn btn-primary" onClick={() => careerAct(searchMonth)}>Wait a month</button>
                  <button className="btn" onClick={waitForOffer}>Wait for a call (up to a year)</button>
                  <button className="btn" onClick={() => { if (window.confirm('Retire for good? The career ends.')) careerAct(retire); }}>Retire</button>
                </div>
              </div>
            ) : <p className="text-sm">Your career is over: {c.stints.length} co-op{c.stints.length === 1 ? '' : 's'}, {money(c.earnings, { compact: true })} earned.</p>}
          </Panel>
        )}
      </div>
      {c.offers.length > 0 && (
        <Panel title="Offers">
          <div className="space-y-2">{c.offers.map((o) => <OfferCard key={o.id} o={o} c={c} />)}</div>
        </Panel>
      )}
      <Panel title="Career record">
        <table className="data text-sm">
          <thead><tr><th>Co-op</th><th>Region</th><th>From</th><th>To</th><th className="r">Reviews</th><th className="r">Earned</th><th>How it ended</th></tr></thead>
          <tbody>{[...c.stints].reverse().map((s) => (
            <tr key={`${s.coopName}-${s.fromMonth}`}><td>{s.coopName}</td><td>{regionLabel(s.regionId)}</td><td>{formatMonth(s.fromMonth)}</td><td>{s.toMonth === null ? 'now' : formatMonth(s.toMonth)}</td><td className="r">{s.reviews.join(', ') || '—'}</td><td className="r">{money(s.earnings, { compact: true })}</td><td>{s.end ? END_LABEL[s.end] : '—'}</td></tr>
          ))}</tbody>
        </table>
        <ul className="mt-3 max-h-64 space-y-0.5 overflow-auto text-xs text-stone-600">
          {[...c.log].reverse().map((l, i) => <li key={i}><span className="text-stone-400">{formatMonth(l.monthIndex)}</span> {l.text}</li>)}
        </ul>
      </Panel>
    </div>
  );
}
