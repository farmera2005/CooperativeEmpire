import { useState } from 'react';
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { KIND_LABEL, type FacilityKind } from '../../data/facilities';
import { DIVISION_LABEL, LINES, LINES_BY_DIVISION, type LineId, type SupplyDivision } from '../../data/supply';
import { fiscalYearOf, fiscalYearStart, formatMonthShort, incomeStatement, supplierTerms, type SupplyPolicy } from '../../engine/index';
import { BreakdownView } from '../components/BreakdownView';
import { BuildSupplySite, FacilitiesPanel, OffersPanel } from '../components/FacilityPanels';
import { LivestockPanel } from '../components/LivestockPanel';
import { CommitNumber } from '../components/CommitNumber';
import { Panel, Stat } from '../components/Panel';
import { Term } from '../components/Term';
import { money, num, pct } from '../format';
import { useStore } from '../store';

const DIVS: SupplyDivision[] = ['AGRONOMY', 'FEED', 'ENERGY', 'RETAIL'];
const KINDS: Record<SupplyDivision, Exclude<FacilityKind, 'elevator'>[]> = { AGRONOMY: ['agronomy'], FEED: ['feedmill'], ENERGY: ['energy'], RETAIL: ['station', 'farmstore'] };
type Sub = 'overview' | 'facilities' | 'policies' | 'buy' | 'livestock';

export function SupplyScreen() {
  const [div, setDiv] = useState<SupplyDivision>('AGRONOMY');
  const [sub, setSub] = useState<Sub>('overview');
  const game = useStore((s) => s.game)!;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {DIVS.map((d) => {
          const open = game.coop.facilities.some((f) => f.division === d && f.status === 'operating');
          return <button key={d} className={`btn ${div === d ? 'btn-primary' : ''}`} onClick={() => setDiv(d)}>{DIVISION_LABEL[d]}{open ? '' : ' (not yet)'}</button>;
        })}
        <span className="mx-2 h-6 w-px bg-stone-300" />
        {([['overview', 'Overview'], ['facilities', 'Facilities'], ['policies', 'Policies'], ['buy', 'Buy or build'], ...(div === 'FEED' ? [['livestock', 'Livestock']] : [])] as [Sub, string][]).map(([id, l]) => (
          <button key={id} className={`btn ${sub === id ? 'btn-primary' : ''}`} onClick={() => setSub(id)}>{l}</button>
        ))}
      </div>
      {sub === 'overview' && <Overview d={div} />}
      {sub === 'facilities' && <FacilitiesPanel division={div} />}
      {sub === 'policies' && <Policies d={div} />}
      {sub === 'buy' && <Buy d={div} />}
      {sub === 'livestock' && div === 'FEED' && <LivestockPanel />}
    </div>
  );
}

const unitLabel = (id: LineId) => (LINES[id].unit === '$' ? '$' : LINES[id].unit);
const qtyFmt = (id: LineId, q: number) => (LINES[id].unit === '$' ? money(Math.round(q * 100)) : `${num(q)} ${unitLabel(id)}`);

function Overview({ d }: { d: SupplyDivision }) {
  const game = useStore((s) => s.game)!;
  const book = game.coop.supply[d];
  const r = book.report;
  const mi = game.clock.monthIndex;
  const fye = game.setup.fiscalYearEndMonth;
  const fyStart = Math.max(fiscalYearStart(fiscalYearOf(mi, fye), fye), game.ledger.firstMonth);
  const ytd = incomeStatement(game.ledger, fyStart, mi, d);
  const open = game.coop.facilities.some((f) => f.division === d && f.status === 'operating');
  const ar = book.ar.current + book.ar.past30 + book.ar.past60 + book.ar.past90 + book.ar.harvest;
  const terms = supplierTerms(game, d);
  const chart = book.reports.slice(-24).map((x) => ({
    m: formatMonthShort(x.monthIndex),
    sales: Object.values(x.lines).reduce((a, l) => a + (l?.revenue ?? 0), 0) / 100,
    margin: x.margin.value / 100,
  }));
  if (!open && !r) return <Panel title={DIVISION_LABEL[d]}>The co-op is not in this business yet. See <b>Buy or build</b>.</Panel>;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
        <Stat label="Sales + services, FYTD" value={money(ytd.sales + ytd.serviceIncome, { compact: true })} />
        <Stat label="Gross margin + services, FYTD" value={money(ytd.grossRevenue, { compact: true })} sub={ytd.sales ? pct(ytd.grossRevenue / (ytd.sales + ytd.serviceIncome)) : ''} />
        <Stat label="Local savings, FYTD" value={money(ytd.localSavings, { compact: true })} tone={ytd.localSavings >= 0 ? 'good' : 'bad'} sub="before corporate overhead" />
        <Stat label="Share of wallet" value={pct(r?.share ?? 0, 0)} sub="farms that can reach us" />
        <Stat label={<Term id="supplier-volume">Supplier volume pricing</Term>} value={`${(terms.pct * 100).toFixed(1)}% off`}
          sub={`best this year ${(terms.maxPct * 100).toFixed(1)}%${d === 'AGRONOMY' ? ' (not crop protection)' : ''}; bought ${money(terms.volume2024 * 100, { compact: true })} (12 mo, 2024 $)${terms.nextPointAt2024 ? `; +1 pt at ${money(terms.nextPointAt2024 * 100, { compact: true })}` : ''}`} />
        <Stat label="Receivables" value={money(ar, { compact: true })} sub={`allowance ${money(book.allowance, { compact: true })}`} />
        <Stat label={d === 'ENERGY' ? 'Prebuy & prepay held' : 'Customer prepay'} value={money(book.prepay, { compact: true })} sub={d === 'ENERGY' && book.prebuyGal > 0 ? `${num(book.prebuyGal)} gal to deliver at $${book.prebuyPrice.toFixed(2)}` : ''} />
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Panel title="This month by product line" className="xl:col-span-2">
          {!r ? <p className="text-sm text-stone-500">No activity yet.</p> : (
            <table className="data">
              <thead><tr><th>Line</th><th className="r">Demand in territory</th><th className="r">Our sales</th><th className="r">Unmet (capacity)</th><th className="r">Our price</th><th className="r">Cost</th><th className="r">Margin / unit</th><th className="r">Revenue</th></tr></thead>
              <tbody>
                {LINES_BY_DIVISION(d).map((id) => {
                  const l = r.lines[id];
                  if (!l) return null;
                  const isDollar = LINES[id].unit === '$';
                  return (
                    <tr key={id}>
                      <td>{LINES[id].label}</td>
                      <td className="r">{qtyFmt(id, l.demand)}</td>
                      <td className="r">{qtyFmt(id, l.sold)}</td>
                      <td className={`r ${l.unmet > 0 ? 'text-rust' : ''}`}>{l.unmet > 0 ? qtyFmt(id, l.unmet) : '—'}</td>
                      <td className="r">{isDollar ? '—' : `$${l.price.toFixed(2)}`}</td>
                      <td className="r">{isDollar ? `${pct(l.cost / l.price)} of price` : `$${l.cost.toFixed(2)}`}</td>
                      <td className="r">{isDollar ? pct(1 - l.cost / l.price) : `$${(l.price - l.cost).toFixed(2)}`}</td>
                      <td className="r">{money(l.revenue)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Panel>
        <Panel title="Why this month's margin?">{r ? <BreakdownView b={r.margin} /> : null}</Panel>
        <Panel title="Capacity, inventory and credit">
          <div className="space-y-3 text-sm">
            {r?.capacity.map((c) => (
              <div key={c.label}>
                <div className="flex justify-between"><span>{c.label}</span><span className="num">{num(c.used)} of {num(c.available)} {c.unit}</span></div>
                <div className="h-2 rounded bg-stone-200"><div className={`h-2 rounded ${c.used > c.available ? 'bg-rust' : 'bg-field'}`} style={{ width: `${Math.min(100, c.available ? (100 * c.used) / c.available : 100)}%` }} /></div>
              </div>
            ))}
            {d === 'AGRONOMY' && <div>Customers remember {pct(book.lateMemory)} of application acres as late.</div>}
            {d === 'FEED' && <div>Toll milling: {book.toll ? `${num(book.toll.tonsPerMonth)} tons/month for an integrator` : 'none'}</div>}
            {Object.entries(book.inventory).filter(([, ls]) => ls && ls.length).map(([id, ls]) => {
              const qty = ls!.reduce((a, l) => a + l.qty, 0);
              const cost = ls!.reduce((a, l) => a + l.cost, 0);
              return <div key={id}><Term id="lcm">Inventory</Term> {LINES[id as LineId].label}: {num(qty)} {unitLabel(id as LineId)} at {money(qty ? Math.round(cost / qty) : 0, { decimals: 0 })}/{unitLabel(id as LineId)} ({money(cost)})</div>;
            })}
            <table className="data">
              <thead><tr><th>Receivables aging</th><th className="r">Balance</th></tr></thead>
              <tbody>
                {([['Current', book.ar.current], ['30 days', book.ar.past30], ['60 days', book.ar.past60], ['90+ days', book.ar.past90], ['Due at harvest', book.ar.harvest]] as [string, number][]).map(([l, v]) => <tr key={l}><td>{l}</td><td className="r">{money(v)}</td></tr>)}
                <tr><td>Allowance for bad debt</td><td className="r">({money(book.allowance)})</td></tr>
              </tbody>
            </table>
          </div>
        </Panel>
        <Panel title="Sales and margin by month" className="xl:col-span-2">
          <div style={{ height: 220 }}>
            <ResponsiveContainer>
              <ComposedChart data={chart}>
                <CartesianGrid stroke="#e7e2d3" />
                <XAxis dataKey="m" fontSize={11} />
                <YAxis fontSize={11} tickFormatter={(v: number) => `$${Math.round(v / 1000)}K`} />
                <Tooltip formatter={(v) => `$${Math.round(Number(v)).toLocaleString()}`} />
                <Legend />
                <Bar dataKey="sales" fill="#c9a227" name="Sales" />
                <Line dataKey="margin" stroke="#3f5f2a" name="Gross margin" dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>
    </div>
  );
}

function Policies({ d }: { d: SupplyDivision }) {
  const game = useStore((s) => s.game)!;
  const command = useStore((s) => s.command);
  const p = game.coop.supplyPolicy[d];
  const set = (policy: Partial<SupplyPolicy>) => command({ type: 'setSupplyPolicy', division: d, policy });
  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      <Panel title="Pricing and credit">
        <div className="space-y-3 text-sm">
          <label className="block">Pricing posture
            <select className="input ml-2" value={p.posture} onChange={(e) => set({ posture: e.target.value as SupplyPolicy['posture'] })}>
              <option value="aggressive">Aggressive (price under the market)</option><option value="market">Market</option><option value="premium">Premium (price over, sell service)</option>
            </select>
          </label>
          <label className="block">Credit terms
            <select className="input ml-2" value={p.credit} onChange={(e) => set({ credit: e.target.value as SupplyPolicy['credit'] })}>
              <option value="strict">Strict (cash or 30 days)</option><option value="normal">Normal</option><option value="loose">Loose (carry customers to harvest)</option>
            </select>
          </label>
          <p className="text-xs text-stone-500">Loose credit wins farmers who need it, especially in hard years, but receivables and bad debt rise when farm income falls.</p>
        </div>
      </Panel>
      <Panel title="Programs">
        <div className="space-y-3 text-sm">
          {d === 'AGRONOMY' && (
            <>
              <label className="block"><input type="checkbox" checked={p.prepayProgram} onChange={(e) => set({ prepayProgram: e.target.checked })} /> Spring prepay program (Dec–Feb, discounted)</label>
              <label className="block">Summer fill: buy <CommitNumber min={0} max={100} value={Math.round(p.summerFillPct * 100)} onCommit={(v) => set({ summerFillPct: v / 100 })} />% of next spring's fertilizer at summer prices</label>
              <label className="block">Winter fill: buy <CommitNumber min={0} max={100} value={Math.round(p.winterFillPct * 100)} onCommit={(v) => set({ winterFillPct: v / 100 })} />% in Dec–Feb</label>
              <p className="text-xs text-stone-500">Fertilizer is a position business. Filling early is usually cheaper, but product bought before a price collapse must be written down to market (2008–09).</p>
            </>
          )}
          {d === 'FEED' && (
            <>
              <label className="block"><input type="checkbox" checked={p.tollMilling} onChange={(e) => set({ tollMilling: e.target.checked })} /> Accept toll-milling contracts from integrators</label>
              <p className="text-xs text-stone-500">Toll milling fills an under-used mill at a thin fee per ton. One integrator can leave at any time.</p>
            </>
          )}
          {d === 'ENERGY' && (
            <>
              <label className="block"><input type="checkbox" checked={p.prebuyProgram} onChange={(e) => set({ prebuyProgram: e.target.checked })} /> Propane prebuy program (Jul–Sep, fixed price for winter)</label>
              <label className="block">Supply for prebuys
                <select className="input ml-2" value={p.supplyCover} onChange={(e) => set({ supplyCover: e.target.value as SupplyPolicy['supplyCover'] })}>
                  <option value="covered">Covered (buy gallons when we sell the contracts)</option><option value="hand">Hand-to-mouth (buy when delivered)</option>
                </select>
              </label>
              <p className="text-xs text-stone-500">An uncovered prebuy is a bet that propane won't rise. In the 2013–14 shortage it rose threefold.</p>
            </>
          )}
          {d === 'RETAIL' && <p className="text-xs text-stone-500">Most retail customers are not members. Non-member business must not exceed member business (<Term id="capper-volstead">Capper-Volstead</Term>).</p>}
        </div>
      </Panel>
    </div>
  );
}

function Buy({ d }: { d: SupplyDivision }) {
  const [fin, setFin] = useState(0.5);
  return (
    <div className="space-y-4">
      <OffersPanel kinds={KINDS[d]} fin={fin} setFin={setFin} />
      {KINDS[d].map((k) => <BuildSupplySite key={k} kind={k} fin={fin} setFin={setFin} />)}
      <p className="text-xs text-stone-500">{KINDS[d].map((k) => KIND_LABEL[k]).join(' and ')} — the default size is a typical site for the era; adjust before approving.</p>
    </div>
  );
}
