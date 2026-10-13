import { useMemo, useState } from 'react';
import { brandName, brandsAvailable, getBrand } from '../../data/brands';
import { AFFILIATION, LENDER, lenderKind, type RegionalCategory } from '../../data/finance';
import {
  affiliationFor, brandLabel, CATEGORIES, covenantHeadroom, covenantSet, lenderEquityHeld, lineRate, maxCommitment, programOf, regionalEquityHeld,
  STATUS_LABEL, yearOf,
} from '../../engine/index';
import { Panel, Stat } from '../components/Panel';
import { Term } from '../components/Term';
import { money, pct } from '../format';
import { useStore } from '../store';

const CAT_LABEL: Record<RegionalCategory, string> = { grain: 'Grain marketing', agronomy: 'Agronomy', feed: 'Feed', energy: 'Energy', retail: 'Retail' };

export function LenderScreen() {
  const game = useStore((s) => s.game)!;
  const fin = game.coop.finance;
  const fict = game.setup.fictionalizeBrands;
  const name = (id: string) => (id === 'local-bank' ? 'Local commercial bank' : getBrand(id) ? brandName(id, fict) : id);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-5 gap-3">
        <Stat label="Lender" value={<span className="text-base">{name(game.coop.lenderId)}</span>} sub={lenderKind(game.coop.lenderId) === 'coopBank' ? 'Cooperative bank (borrower-owned)' : 'Commercial bank'} />
        <Stat label={<Term id="covenant">Standing</Term>} value={<span className="text-base">{STATUS_LABEL[fin.status]}</span>} tone={fin.status === 'standard' ? 'good' : 'bad'} sub={fin.riskSpread ? `+${fin.riskSpread.toFixed(2)} pts risk spread` : undefined} />
        <Stat label="Line rate" value={`${lineRate(game).toFixed(2)}%`} />
        <Stat label={<Term id="lender-equity">Lender stock held</Term>} value={money(lenderEquityHeld(game), { compact: true })} />
        <Stat label="Regional equity held" value={money(regionalEquityHeld(game), { compact: true })} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <CovenantPanel />
        <LenderPanel />
      </div>
      <RegionalPanel name={name} />
    </div>
  );
}

function CovenantPanel() {
  const game = useStore((s) => s.game)!;
  const command = useStore((s) => s.command);
  const fin = game.coop.finance;
  const fict = game.setup.fictionalizeBrands;
  const now = useMemo(() => covenantHeadroom(game), [game]);
  const year = yearOf(game.clock.monthIndex);
  const lenders = [...brandsAvailable('lender', year).map((b) => b.id), 'local-bank'].filter((id) => id !== game.coop.lenderId);
  const [to, setTo] = useState(lenders[0] ?? '');
  const f = (v: number, isPct?: boolean) => (!Number.isFinite(v) ? 'n/a' : isPct ? pct(v) : v.toFixed(2));
  const c = covenantSet(game);
  return (
    <Panel title={<Term id="covenant">Loan covenants</Term>}>
      <table className="data">
        <thead><tr><th>Covenant</th><th className="r">Limit</th><th className="r">Now</th><th className="r">Last year-end test</th></tr></thead>
        <tbody>
          {now.map((x, i) => {
            const last = fin.lastTest?.results[i];
            const ok = x.kind === 'min' ? x.value >= x.limit : x.value <= x.limit;
            return (
              <tr key={x.label}>
                <td>{x.label}</td><td className="r">{x.kind === 'min' ? '≥' : '≤'} {f(x.limit, x.pct)}</td>
                <td className={`r ${ok ? '' : 'text-rust'}`}>{f(x.value, x.pct)}</td>
                <td className={`r ${last && !last.ok ? 'text-rust' : ''}`}>{last ? f(last.value, x.pct) : '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mt-2 text-xs text-stone-500">The lender tests covenants on the fiscal-year-end balance sheet (seasonal grain inventory makes mid-year ratios swing). A breach puts us on watch; another brings a waiver fee and a higher spread; a third, <Term id="special-credit">special credit</Term>; continued decline there, a forced sale.{lenderKind(game.coop.lenderId) === 'commercial' ? ' A commercial bank\'s covenants are tighter, and it may cut the line in a farm crisis.' : ` ${name0(game.coop.lenderId, fict)} pays patronage each March (part cash, part stock toward a ${pct(LENDER.equityTarget[game.coop.lenderId]?.value ?? 0, 0)} of loans target).`}</p>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
        <button className="btn" onClick={() => command({ type: 'termOutLine' })} title={`Convert line debt to a term loan to bring the current ratio to about ${(c.minCurrentRatio + 0.25).toFixed(2)}`}><Term id="term-out">Term out</Term> part of the line</button>
        {lenders.length > 0 && <>
          <span className="ml-4">Move our loans to</span>
          <select className="input" value={to} onChange={(e) => setTo(e.target.value)}>{lenders.map((id) => <option key={id} value={id}>{name0(id, fict)}</option>)}</select>
          <button className="btn" onClick={() => to && command({ type: 'switchLender', lenderId: to })}>Switch lender</button>
          <span className="text-xs text-stone-500">fees {pct(LENDER.switchFee.value, 1)} of debt; term loans repriced</span>
        </>}
      </div>
    </Panel>
  );
}

const name0 = (id: string, fict: boolean) => (id === 'local-bank' ? 'Local commercial bank' : getBrand(id) ? brandName(id, fict) : id);

function RegionalPanel({ name }: { name: (id: string) => string }) {
  const game = useStore((s) => s.game)!;
  const command = useStore((s) => s.command);
  const year = yearOf(game.clock.monthIndex);
  const avail = brandsAvailable('regional', year, game.setup.regionId);
  const rb = game.coop.regional;
  const ids = [...new Set([...Object.keys(rb.equity), ...game.coop.regionalAffiliations.map((a) => a.regionalId)])].sort();
  return (
    <Panel title={<Term id="regional">Regional cooperatives</Term>}>
      <div className="grid grid-cols-2 gap-6">
        <div>
          <table className="data">
            <thead><tr><th>Business line</th><th>Supplier</th><th className="r">Patronage rate</th></tr></thead>
            <tbody>
              {CATEGORIES.map((cat) => {
                const cur = affiliationFor(game, cat);
                const rate = cur ? programOf(cur).rate[cat] : undefined;
                return (
                  <tr key={cat}>
                    <td>{CAT_LABEL[cat]}</td>
                    <td>
                      <select className="input py-0" value={cur ?? ''} onChange={(e) => command({ type: 'setAffiliation', category: cat, regionalId: e.target.value || null })}>
                        <option value="">Independent suppliers (no patronage)</option>
                        {avail.filter((b) => b.supplies?.includes(cat)).map((b) => <option key={b.id} value={b.id}>{brandName(b.id, game.setup.fictionalizeBrands)}</option>)}
                      </select>
                    </td>
                    <td className="r">{rate === undefined ? '—' : cat === 'grain' ? `$${rate.toFixed(3)}/bu (2024 $)` : `${rate}% of purchases`}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-stone-500">Changing a supplier costs about {money(AFFILIATION.switchCost.value * 100)} (2024 dollars) in signs and contracts. Equity in the old regional stays until it revolves. Patronage on last year's purchases arrives each January, part cash and part regional equity.</p>
        </div>
        <div>
          <table className="data">
            <thead><tr><th>Regional</th><th className="r">Equity held</th><th className="r">Cash share</th><th className="r">Revolves after</th><th className="r">Purchases this year</th></tr></thead>
            <tbody>
              {ids.map((id) => {
                const p = programOf(id);
                const pur = rb.purchases[id] ?? {};
                const dollars = Object.entries(pur).filter(([k]) => k !== 'grain').reduce((s, [, v]) => s + v, 0);
                return (
                  <tr key={id}><td>{name(id)}</td><td className="r">{money(regionalEquityHeld(game, id))}</td><td className="r">{pct(p.cashPortion, 0)}</td><td className="r">{p.revolveYears} yr</td>
                    <td className="r">{money(dollars)}{pur.grain ? ` + ${Math.round(pur.grain).toLocaleString('en-US')} bu` : ''}</td></tr>
                );
              })}
            </tbody>
          </table>
          {rb.last && <p className="mt-2 text-sm">Last patronage (on {rb.last.year} business): {money(Object.values(rb.last.patronage).reduce((a, b) => a + b, 0))}; revolved {money(Object.values(rb.last.revolved).reduce((a, b) => a + b, 0))}.</p>}
        </div>
      </div>
    </Panel>
  );
}

function LenderPanel() {
  const game = useStore((s) => s.game)!;
  const command = useStore((s) => s.command);
  const fin = game.coop.finance;
  const [amt, setAmt] = useState('');
  const drawn = game.history[game.history.length - 1]?.lineDrawn ?? 0;
  return (
    <Panel title="Line of credit and term loans">
      <table className="data">
        <tbody>
          <tr><td>Seasonal line commitment</td><td className="r">{money(fin.lineCommitment)}</td></tr>
          <tr><td>Borrowing base</td><td className="r">{money(fin.borrowingBase)}</td></tr>
          <tr><td>Drawn</td><td className="r">{money(drawn)}</td></tr>
          <tr><td>Available</td><td className="r">{money(fin.lineAvailable)}</td></tr>
          <tr><td>Line rate</td><td className="r">{lineRate(game).toFixed(2)}%{fin.overLimit ? ' + penalty' : ''}</td></tr>
        </tbody>
      </table>
      <div className="mt-2 flex items-center gap-2 text-sm">
        Request commitment of $<input className="input w-32" value={amt} onChange={(e) => setAmt(e.target.value.replace(/[^\d]/g, ''))} placeholder={String(Math.round(fin.lineCommitment / 100))} />
        <button className="btn" onClick={() => amt && command({ type: 'setLineCommitment', amount: Number(amt) * 100 })}>Request</button>
        <span className="text-xs text-stone-500">max {money(maxCommitment(game))}</span>
      </div>
      <div className="mt-3 text-sm font-semibold">Term loans</div>
      {!fin.termLoans.length ? <p className="text-sm text-stone-500">None.</p> : (
        <table className="data">
          <thead><tr><th>Purpose</th><th className="r">Balance</th><th className="r">Rate</th><th className="r">Payment</th><th></th></tr></thead>
          <tbody>
            {fin.termLoans.map((l) => (
              <tr key={l.id}><td>{l.purpose}</td><td className="r">{money(l.balance)}</td><td className="r">{l.ratePct.toFixed(2)}%</td><td className="r">{money(l.payment)}/mo</td>
                <td><button className="btn py-0" onClick={() => command({ type: 'prepayTermLoan', loanId: l.id, amount: l.balance })}>Prepay</button></td></tr>
            ))}
          </tbody>
        </table>
      )}
    </Panel>
  );
}
