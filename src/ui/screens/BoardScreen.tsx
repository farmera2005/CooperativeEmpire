import { useMemo, useState } from 'react';
import {
  averageSatisfaction, bylawTitle, factionOf, forecastItem, formatMonth, formatMonthShort, PROPOSAL_LABEL, yearOf,
  type AgendaItem, type BylawChange, type Director, type GameState, type PetIssue,
} from '../../engine/index';
import { BYLAWS_DEFAULT, POLITICAL_CAPITAL } from '../../data/governance';
import { Panel, Stat } from '../components/Panel';
import { pct } from '../format';
import { useStore } from '../store';

const stanceLabel = (s: number) => (s > 0.35 ? 'Growth-minded' : s < -0.35 ? 'Conservative' : 'Moderate');
const literacyLabel = (l: number) => (l >= 15 ? 'Strong with numbers' : l >= 9 ? 'Reads the financials' : 'Goes by the headline');
const FACTION_LABEL = { growth: 'Growth bloc', conservative: 'Conservative bloc', swing: 'Swing' } as const;

function petText(g: GameState, p: PetIssue): string {
  const towns = g.world.towns;
  switch (p.kind) {
    case 'hometown': return `keep ${towns[p.townId ?? 0]?.name} served`;
    case 'division': return `${p.favor ? 'champions' : 'skeptical of'} ${p.division?.toLowerCase()}`;
    case 'merger': return p.favor ? 'open to mergers' : 'against mergers';
    case 'redemption': return 'pay out old equity';
    case 'patronageCash': return 'more cash patronage';
    case 'conservative': return 'fiscal caution';
  }
}

export function BoardScreen() {
  const game = useStore((s) => s.game)!;
  const gov = game.governance;
  const yearAgo = game.clock.monthIndex - 12;
  const recent = gov.votes.filter((v) => v.monthIndex > yearAgo);
  const last = gov.reviews[gov.reviews.length - 1];
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-6 gap-3">
        <Stat label="Board confidence" value={Math.round(gov.boardConfidence)} tone={gov.boardConfidence < 35 ? 'bad' : gov.boardConfidence > 60 ? 'good' : 'neutral'} sub={gov.pip ? 'On a performance improvement plan' : 'in you as general manager'} />
        <Stat label="Political capital" value={`${gov.politicalCapital}/${POLITICAL_CAPITAL.max}`} sub={`+${POLITICAL_CAPITAL.monthly} a month; ${POLITICAL_CAPITAL.lobbyCost} per lobbying call`} />
        <Stat label="Votes, last 12 months" value={`${recent.filter((v) => v.passed).length}–${recent.filter((v) => !v.passed).length}`} sub="won–lost" />
        <Stat label="Last review" value={last ? last.score : '—'} sub={last ? `fiscal ${last.fy}` : 'after the first full year'} />
        <Stat label="Patron satisfaction" value={Math.round(averageSatisfaction(game))} sub="weighted by business with us" />
        <Stat label="Next board meeting" value={<span className="text-base">{formatMonth(game.clock.monthIndex + 1)}</span>} sub={`${gov.agenda.filter((i) => i.submittedMonth <= game.clock.monthIndex).length} item(s) on the agenda`} />
      </div>
      <AgendaPanel />
      <DirectorsPanel />
      <div className="grid grid-cols-2 gap-4">
        <DemandsPanel />
        <ReviewPanel />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <VotesPanel />
        <ElectionsPanel />
      </div>
      <BylawsPanel />
    </div>
  );
}

function AgendaPanel() {
  const game = useStore((s) => s.game)!;
  const command = useStore((s) => s.command);
  const gov = game.governance;
  const name = (id: number) => game.members.list.find((m) => m.id === id)?.name ?? '?';
  if (!gov.agenda.length) {
    return <Panel title="Agenda for the next board meeting"><p className="text-sm text-stone-500">Nothing on the agenda. Capital projects over the approval threshold, facility closures, policy changes and the budget and patronage plans come here for a vote.</p></Panel>;
  }
  return (
    <Panel title="Agenda for the next board meeting">
      <div className="space-y-4">
        {gov.agenda.map((item) => <AgendaRow key={item.id} item={item} name={name} onCommand={command} />)}
      </div>
    </Panel>
  );
}

function AgendaRow({ item, name, onCommand }: { item: AgendaItem; name: (id: number) => string; onCommand: ReturnType<typeof useStore.getState>['command'] }) {
  const game = useStore((s) => s.game)!;
  const gov = game.governance;
  const f = useMemo(() => forecastItem(game, item), [game, item]);
  const later = item.submittedMonth >= game.clock.monthIndex && item.tabled > 0;
  return (
    <div className="rounded border border-stone-200 p-2">
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="rounded bg-stone-200 px-1.5 text-xs uppercase">{PROPOSAL_LABEL[item.type]}</span>
        <b className="text-sm">{item.title}</b>
        {item.tabled > 0 && <span className="text-xs text-stone-500">tabled {item.tabled}×{later ? ' — vote the month after next' : ''}</span>}
        <span className={`ml-auto text-sm font-semibold ${f.passProb >= 0.6 ? 'text-field' : f.passProb < 0.4 ? 'text-rust' : ''}`}>Forecast: {pct(f.passProb, 0)} to pass (about {f.expectedYes.toFixed(1)} of {gov.directors.length} for)</span>
      </div>
      {f.merit.notes.length > 0 && <div className="mt-1 text-xs text-stone-600">{f.merit.notes.join(' · ')}</div>}
      <div className="mt-2 flex flex-wrap gap-1">
        {gov.directors.map((d) => {
          const p = f.directors.find((x) => x.memberId === d.memberId)?.pYes ?? 0;
          const lobbied = item.lobbied.includes(d.memberId);
          return (
            <button key={d.memberId} disabled={lobbied || gov.politicalCapital < POLITICAL_CAPITAL.lobbyCost}
              title={lobbied ? 'Already lobbied' : `Lobby ${name(d.memberId)} (${POLITICAL_CAPITAL.lobbyCost} political capital)`}
              onClick={() => onCommand({ type: 'lobbyDirector', itemId: item.id, directorId: d.memberId })}
              className={`rounded border px-2 py-0.5 text-xs ${p >= 0.6 ? 'border-field bg-[#e3eedf]' : p < 0.4 ? 'border-rust bg-[#f6e3dc]' : 'border-stone-300 bg-white'} ${lobbied ? 'font-semibold' : ''}`}>
              {name(d.memberId).split(' ').slice(-1)[0]}{d.office === 'chair' ? ' (chair)' : ''} {pct(p, 0)}{lobbied ? ' ✓' : ''}
            </button>
          );
        })}
      </div>
      <div className="mt-2 flex gap-2 text-sm">
        <button className="btn py-0" disabled={item.tabled >= 2} onClick={() => onCommand({ type: 'tableItem', itemId: item.id })}>Table a month</button>
        {item.source === 'gm' && <button className="btn py-0" onClick={() => onCommand({ type: 'withdrawItem', itemId: item.id })}>Withdraw</button>}
        <span className="text-xs text-stone-500 self-center">Green: likely yes. Red: likely no. Click a director to make your case before the vote. The chair votes only to break a tie.</span>
      </div>
    </div>
  );
}

function DirectorsPanel() {
  const game = useStore((s) => s.game)!;
  const gov = game.governance;
  const year = yearOf(game.clock.monthIndex);
  const members = new Map(game.members.list.map((m) => [m.id, m]));
  const towns = game.world.towns;
  const order: Director[] = [...gov.directors].sort((a, b) => factionOf(a).localeCompare(factionOf(b)) || b.stance - a.stance);
  return (
    <Panel title="Board of directors">
      <table className="data">
        <thead><tr><th>Director</th><th>Office</th><th>Seat</th><th>Town</th><th className="r">Age</th><th className="r">Term ends</th><th>Bloc</th><th>Outlook</th><th>Financial literacy</th><th className="r">Loyalty to you</th><th>Pet issues</th></tr></thead>
        <tbody>
          {order.map((d) => {
            const m = members.get(d.memberId);
            if (!m) return null;
            return (
              <tr key={d.memberId}>
                <td>{m.name}</td>
                <td className="capitalize">{d.office ?? ''}</td>
                <td>{d.districtId === null ? 'At large' : game.world.districts[d.districtId]?.name}</td>
                <td>{towns[m.townId].name}</td>
                <td className="r">{year - m.birthYear}</td>
                <td className="r">{d.termEndYear}</td>
                <td>{FACTION_LABEL[factionOf(d)]}</td>
                <td>{stanceLabel(d.stance)}</td>
                <td>{literacyLabel(d.literacy)}</td>
                <td className={`r ${d.loyaltyToGM < 35 ? 'text-rust' : ''}`}>{Math.round(d.loyaltyToGM)}</td>
                <td className="text-xs">{d.petIssues.map((p) => petText(game, p)).join('; ')}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Panel>
  );
}

function DemandsPanel() {
  const game = useStore((s) => s.game)!;
  const ds = [...game.governance.demands].reverse();
  return (
    <Panel title="Directors' goals for you">
      {!ds.length ? <p className="text-sm text-stone-500">No outstanding demands. Directors raise items from their pet issues; meeting them builds confidence.</p> : (
        <ul className="space-y-1 text-sm">
          {ds.map((d) => (
            <li key={d.id} className={d.status === 'missed' ? 'text-rust' : d.status === 'met' ? 'text-field' : ''}>
              <span className="text-xs uppercase">{d.status === 'open' ? `due ${formatMonthShort(d.deadlineMonth)}` : d.status}</span> — {d.text}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

const COMPONENT_LABEL: Record<string, string> = { budget: 'Results vs budget', savings: 'Savings on equity', lender: 'Lender standing', members: 'Member satisfaction', demands: 'Directors\' goals', votes: 'Votes won', loyalty: 'Directors\' trust' };

function ReviewPanel() {
  const game = useStore((s) => s.game)!;
  const r = game.governance.reviews[game.governance.reviews.length - 1];
  return (
    <Panel title="Annual review">
      {!r ? <p className="text-sm text-stone-500">The board reviews the general manager three months after each fiscal year end.</p> : (
        <>
          <div className="text-sm">Fiscal {r.fy}: score <b>{r.score}</b>{r.bonus > 0 ? `, bonus $${Math.round(r.bonus / 100).toLocaleString('en-US')}` : ''}{r.pip ? ' — performance improvement plan' : ''}.</div>
          <table className="data mt-1">
            <tbody>{Object.entries(r.components).map(([k, v]) => <tr key={k}><td>{COMPONENT_LABEL[k] ?? k}</td><td className="r">{Math.round(v)}</td></tr>)}</tbody>
          </table>
          <p className="mt-1 text-xs text-stone-500">Confidence below 35 at a review brings a performance plan; a second weak review below 25 ends your tenure, as does confidence falling below 10 while on a plan.</p>
        </>
      )}
    </Panel>
  );
}

function VotesPanel() {
  const game = useStore((s) => s.game)!;
  const vs = [...game.governance.votes].reverse().slice(0, 20);
  return (
    <Panel title="Vote history">
      {!vs.length ? <p className="text-sm text-stone-500">No votes yet.</p> : (
        <table className="data">
          <thead><tr><th>Month</th><th>Item</th><th className="r">Vote</th></tr></thead>
          <tbody>{vs.map((v) => <tr key={`${v.id}-${v.monthIndex}`}><td>{formatMonthShort(v.monthIndex)}</td><td>{v.title}</td><td className={`r ${v.passed ? 'text-field' : 'text-rust'}`}>{v.passed ? 'Passed' : 'Failed'} {v.yes}–{v.no}</td></tr>)}</tbody>
        </table>
      )}
    </Panel>
  );
}

function ElectionsPanel() {
  const game = useStore((s) => s.game)!;
  const command = useStore((s) => s.command);
  const gov = game.governance;
  const e = gov.elections[gov.elections.length - 1];
  const year = yearOf(game.clock.monthIndex);
  const up = gov.directors.filter((d) => d.termEndYear <= year + (game.clock.monthIndex % 12 >= 11 ? 1 : 0));
  const name = (id: number) => game.members.list.find((m) => m.id === id)?.name ?? '?';
  return (
    <Panel title="Elections">
      <div className="text-sm">Seats up at the next annual meeting: {up.length ? up.map((d) => name(d.memberId)).join(', ') : 'none'}.</div>
      <label className="mt-1 block text-sm"><input type="checkbox" checked={gov.endorse} onChange={(e2) => command({ type: 'endorseIncumbents', on: e2.target.checked })} /> Speak for the incumbents at the annual meeting (helps them; costs you if an insurgent wins anyway)</label>
      {e && (
        <>
          <div className="mt-2 text-sm font-semibold">{e.year}: turnout {pct(e.turnout, 0)}</div>
          <table className="data">
            <tbody>
              {e.seats.map((st, i) => (
                <tr key={i}><td>{st.districtId === null ? 'At large' : game.world.districts[st.districtId]?.name}</td>
                  <td>{st.candidates.map((c) => `${c.name}${c.kind === 'insurgent' ? ` (insurgent: ${c.platform})` : c.kind === 'incumbent' ? ' (incumbent)' : ''}${st.candidates.length > 1 ? ` ${c.votes}` : ''}${c.memberId === st.winnerId ? ' ✓' : ''}`).join(' · ')}</td></tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </Panel>
  );
}

function BylawsPanel() {
  const game = useStore((s) => s.game)!;
  const command = useStore((s) => s.command);
  const b = game.governance.bylaws;
  const [field, setField] = useState<BylawChange['field']>('termLimit');
  const [value, setValue] = useState('3');
  const change = (): BylawChange => {
    const n = Number(value);
    switch (field) {
      case 'boardSize': return { field, value: Math.round(n) };
      case 'termLimit': return { field, value: value.trim() === '' || n <= 0 ? null : Math.round(n) };
      case 'capitalApproval': return { field, value: Math.round(n) };
      case 'memberPetitionPct': return { field, value: n / 100 };
    }
  };
  const votes = [...game.governance.memberVotes].reverse();
  return (
    <Panel title="Bylaws and member votes">
      <ul className="text-sm">
        <li>Board of {b.boardSize} directors ({b.districts} districts plus {b.atLargeSeats} at large), staggered {b.termYears}-year terms{b.termLimit ? `, at most ${b.termLimit} consecutive terms` : ', no term limits'}.</li>
        <li>Capital projects of ${Math.round(b.capitalApproval / 1000)}K (2024 dollars) or more need a board vote (default ${Math.round(BYLAWS_DEFAULT.capitalApproval.value / 1000)}K).</li>
        <li>Bylaw amendments need {Math.round(b.supermajority * 100)}% of member votes cast; quorum {Math.round(b.quorumPct * 100)}% of active members. Petitions signed by {Math.round(b.memberPetitionPct * 100)}% of active members force a special meeting.</li>
        <li>One member, one vote. Only active producer members vote.</li>
      </ul>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
        Recommend an amendment:
        <select className="input" value={field} onChange={(e) => setField(e.target.value as BylawChange['field'])}>
          <option value="termLimit">Director term limit (terms; blank = none)</option>
          <option value="boardSize">Board size (directors)</option>
          <option value="capitalApproval">Capital approval threshold (2024 $)</option>
          <option value="memberPetitionPct">Petition threshold (% of members)</option>
        </select>
        <input className="input w-28" value={value} onChange={(e) => setValue(e.target.value)} />
        <button className="btn" onClick={() => command({ type: 'proposeBylaw', change: change() })}>Send to the board: {bylawTitle(change())}</button>
      </div>
      {votes.length > 0 && (
        <table className="data mt-2">
          <thead><tr><th>Meeting</th><th>Question</th><th className="r">Result</th></tr></thead>
          <tbody>{votes.map((v) => <tr key={v.id}><td>{formatMonthShort(v.meetingMonth)}</td><td>{v.title}</td><td className="r">{v.result ? `${v.result.passed ? 'Adopted' : 'Failed'}: ${pct(v.result.yesShare, 0)} yes, turnout ${pct(v.result.turnout, 0)}` : 'Pending'}</td></tr>)}</tbody>
        </table>
      )}
    </Panel>
  );
}
