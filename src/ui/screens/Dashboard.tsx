import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { MARKET_SERIES, type SeriesId } from '../../data/markets';
import { balanceSheet, fiscalYearOf, fiscalYearStart, formatMonthShort, incomeStatement } from '../../engine/index';
import { Panel, Stat } from '../components/Panel';
import { Term } from '../components/Term';
import { money, num, pct } from '../format';
import { useStore } from '../store';

const KEY_SERIES: SeriesId[] = ['corn', 'soybeans', 'wheat', 'diesel', 'propane', 'anhydrous', 'prime'];

export function Dashboard() {
  const game = useStore((s) => s.game)!;
  const summaries = useStore((s) => s.summaries);
  const setTab = useStore((s) => s.setTab);
  const mi = game.clock.monthIndex;
  const fye = game.setup.fiscalYearEndMonth;
  const fyStart = Math.max(fiscalYearStart(fiscalYearOf(mi, fye), fye), game.ledger.firstMonth);
  const ytd = incomeStatement(game.ledger, fyStart, mi);
  const bs = balanceSheet(game.ledger, mi);
  const last = game.history[game.history.length - 1];
  const first = game.history[0];
  const equityPct = bs.totalAssets ? bs.totalEquity / bs.totalAssets : 0;
  const chart = game.history.filter((_, i, a) => a.length < 240 || i % 3 === 0).map((h) => ({
    m: formatMonthShort(h.monthIndex), cash: h.cash / 100, equity: h.equity / 100, members: h.activeMembers,
  }));
  const news = [...game.inbox].reverse().slice(0, 6);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Stat label="Total assets" value={money(bs.totalAssets, { compact: true })} />
        <Stat label="Member equity" value={money(bs.totalEquity, { compact: true })} sub={<><Term id="owner-equity">Owner equity</Term> {pct(equityPct, 0)}</>} />
        <Stat label={<><Term id="net-savings">Net savings</Term>, FYTD</>} value={money(ytd.netSavings, { compact: true })} tone={ytd.netSavings >= 0 ? 'good' : 'bad'} />
        <Stat label="Active members" value={num(last.activeMembers)} sub={`${num(first.activeMembers)} at founding`} />
        <Stat label="Farms in territory" value={num(last.activeFarms)} sub={`avg ${num(last.totalAcres / Math.max(1, last.activeFarms))} acres`} />
        <Stat label="Member satisfaction" value={num(last.avgSatisfaction)} sub="0–100" />
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Panel title="Markets this month" className="xl:col-span-1" right={<button className="text-xs text-sky underline" onClick={() => setTab('markets')}>All markets</button>}>
          <table className="data">
            <thead><tr><th>Market</th><th className="r">Price</th><th className="r">Chg</th></tr></thead>
            <tbody>
              {KEY_SERIES.map((id) => {
                const d = MARKET_SERIES[id];
                const v = game.markets.current[id];
                const p = game.markets.previous[id];
                if (v === undefined) return null;
                const ch = p ? v / p - 1 : 0;
                return (
                  <tr key={id}>
                    <td>{d.label} <span className="text-xs text-stone-500">{d.unit}</span></td>
                    <td className="r">{d.kind === 'rate' ? `${v.toFixed(2)}%` : v.toFixed(d.decimals > 2 ? 2 : d.decimals)}</td>
                    <td className={`r ${ch > 0.001 ? 'text-field' : ch < -0.001 ? 'text-rust' : ''}`}>{d.kind === 'rate' ? (v - (p ?? v)).toFixed(2) : pct(ch)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Panel>
        <Panel title="Cash and member equity" className="xl:col-span-2">
          <div style={{ height: 230 }}>
            <ResponsiveContainer>
              <LineChart data={chart} margin={{ left: 10, right: 10, top: 5, bottom: 5 }}>
                <CartesianGrid stroke="#e7e2d3" />
                <XAxis dataKey="m" fontSize={11} minTickGap={40} />
                <YAxis fontSize={11} tickFormatter={(v: number) => `$${Math.round(v / 1000)}K`} />
                <Tooltip formatter={(v) => `$${Math.round(Number(v)).toLocaleString()}`} />
                <Line type="monotone" dataKey="cash" stroke="#3b6e8f" dot={false} name="Cash" />
                <Line type="monotone" dataKey="equity" stroke="#3f5f2a" dot={false} name="Equity" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Panel title="Latest news and memos" right={<button className="text-xs text-sky underline" onClick={() => setTab('inbox')}>Inbox</button>}>
          <ul className="space-y-1 text-sm">
            {news.map((n) => (
              <li key={n.id} className={n.read ? 'text-stone-600' : 'font-semibold'}>
                <span className="mr-2 text-xs text-stone-500">{formatMonthShort(n.monthIndex)}</span>
                <span className={n.kind === 'history' ? 'headline' : ''}>{n.title}</span>
              </li>
            ))}
          </ul>
        </Panel>
        <Panel title="Recent months">
          {summaries.length === 0 ? <p className="text-sm text-stone-500">End the month to see results here.</p> : (
            <ul className="space-y-1 text-sm">
              {summaries.slice(0, 8).map((s) => (
                <li key={s.monthIndex}>{s.lines[0]} <span className={s.netSavings >= 0 ? 'text-field' : 'text-rust'}>Net savings {money(s.netSavings)}.</span></li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
      <p className="text-xs text-stone-500">
        Milestone 1: the cooperative has members, capital, a board and a lender, but no facilities yet. Facilities and the grain
        business arrive in Milestone 2; until then corporate overhead slowly draws down cash and the line of credit covers any shortfall.
      </p>
    </div>
  );
}
