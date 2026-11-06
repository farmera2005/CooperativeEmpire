// Sugar beets (D-133): the factory and its piling stations, beet contracts and grower shares,
// the campaign, and buying or building plants.

import { useState } from 'react';
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { SUGAR, SUGAR_FINANCE, SUGAR_SALES } from '../../data/sugar';
import {
  beetSugarTrend, beetYield, fiscalYearOf, fiscalYearStart, formatMonth, formatMonthShort, growerReturns, incomeStatement, productValuePerTon,
  recovery, shareDemand, shareDriveTowns, sugarCapacity, suggestedAcres, yearOf,
  cccCapacity, cccLoanRate, lineDrawn, marketPrice, sharePrice, shareValue, shareholderStats,
  channelLimits, channelQuotes, marketingYear, nominalCents, pathFor, sugarSalesPolicy, SUGAR_CHANNELS,
} from '../../engine/index';
import type { SugarChannel, SugarSalesPolicy } from '../../engine/types';
import { CommitNumber } from '../components/CommitNumber';
import { FacilitiesPanel, OffersPanel } from '../components/FacilityPanels';
import { ConsultantsPanel, ProjectPlanner } from '../components/Projects';
import { Panel, Stat } from '../components/Panel';
import { money, num, pct } from '../format';
import { useStore } from '../store';

type Sub = 'overview' | 'contracts' | 'sales' | 'facilities' | 'buy';
const KINDS = ['sugarfactory', 'beetstation'] as const;

export function SugarScreen() {
  const [sub, setSub] = useState<Sub>('overview');
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="headline mr-3 text-2xl font-bold">Sugar beets</h1>
        {([['overview', 'Overview'], ['contracts', 'Contracts & shares'], ['sales', 'Sales'], ['facilities', 'Facilities'], ['buy', 'Buy or build']] as [Sub, string][]).map(([id, l]) => (
          <button key={id} className={`btn ${sub === id ? 'btn-primary' : ''}`} onClick={() => setSub(id)}>{l}</button>
        ))}
      </div>
      {sub === 'overview' && <Overview />}
      {sub === 'contracts' && <Contracts />}
      {sub === 'sales' && <Sales />}
      {sub === 'facilities' && <FacilitiesPanel division="SUGAR" />}
      {sub === 'buy' && <Buy />}
    </div>
  );
}

const CHANNEL_LABEL: Record<SugarChannel, string> = {
  contract: 'Industrial, contracted',
  spot: 'Industrial, at the market',
  wholesale: 'Wholesale grocers & foodservice',
  retail: 'Retail packs for grocers',
};

/** Selling the sugar (D-141): industrial buyers under contract or at the market, distributors, grocery shelves. */
function Sales() {
  const game = useStore((s) => s.game)!;
  const command = useStore((s) => s.command);
  const mi = game.clock.monthIndex;
  const book = game.coop.sugar;
  const pol = sugarSalesPolicy(game);
  const set = (patch: Partial<SugarSalesPolicy>) => command({ type: 'setSugarPolicy', policy: { sales: { ...pol, ...patch } } });
  const quotes = channelQuotes(game, mi);
  const lim = channelLimits(game);
  const reps = book.reports.filter((r) => r.monthIndex > mi - 12 && r.channels);
  const year = SUGAR_CHANNELS.map((c) => ({ c, cwt: reps.reduce((a, r) => a + r.channels![c].cwt, 0), revenue: reps.reduce((a, r) => a + r.channels![c].revenue, 0) }));
  const sold = year.reduce((a, y) => a + y.cwt, 0);
  const channelCost = reps.reduce((a, r) => a + (r.channelCost ?? 0), 0);
  const contract = book.contractPrice?.year === marketingYear(mi) ? book.contractPrice.price : null;
  const owns = game.coop.facilities.some((f) => f.kind === 'sugarfactory' && f.status !== 'closed');
  const maxW = Math.round(SUGAR_SALES.maxShare.wholesale * 100);
  const maxR = Math.round(SUGAR_SALES.maxShare.retail * 100);
  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      <Panel title="How we sell the sugar">
        <div className="space-y-3 text-sm">
          <p>Most beet sugar goes in bulk, by rail and truck, to <b>industrial users</b>: bakers, confectioners, cereal, dairy and beverage makers. Much of it is sold <b>forward</b> under contracts for the marketing year (October to September), priced each October. The rest is bagged for <b>wholesale grocers and foodservice distributors</b> or packed in consumer bags for <b>grocery shelves</b>, under our brand or grocers' store brands.</p>
          <label className="block">Sell <CommitNumber min={0} max={100} value={Math.round(pol.forwardShare * 100)} onCommit={(v) => set({ forwardShare: v / 100 })} ariaLabel="Forward-contracted share" />% of bulk sugar forward under annual contracts{contract !== null ? ` (this year's contracts at $${contract.toFixed(2)}/cwt)` : ' (priced next October)'}</label>
          <label className="block">Bag <CommitNumber min={0} max={maxW} value={Math.round(pol.wholesaleShare * 100)} onCommit={(v) => set({ wholesaleShare: v / 100 })} ariaLabel="Wholesale share" />% for distributors (up to {maxW}%)</label>
          <label className="block">Pack <CommitNumber min={0} max={maxR} value={Math.round(pol.retailShare * 100)} onCommit={(v) => set({ retailShare: v / 100 })} ariaLabel="Retail share" />% for grocers (up to {maxR}%, as far as the packaging line and shelf space allow)</label>
          <label className="block">Brand support{' '}
            <select className="input" aria-label="Brand support" value={pol.brand} onChange={(e) => set({ brand: e.target.value as SugarSalesPolicy['brand'] })}>
              {(['none', 'modest', 'strong'] as const).map((b) => <option key={b} value={b}>{b === 'none' ? 'none (store brands only)' : `${b}: ${money(nominalCents(pathFor(game), mi, SUGAR_SALES.brand.value[b].cost2024), { compact: true })} a year`}</option>)}
            </select>
          </label>
          <label className="block">Selling{' '}
            <select className="input" aria-label="Selling" value={pol.selling} onChange={(e) => set({ selling: e.target.value as SugarSalesPolicy['selling'] })}>
              <option value="agency">through a marketing agency ({pct(SUGAR.marketingCostPct.value, 0)} of sales)</option>
              <option value="direct">ourselves ({pct(SUGAR_SALES.directFeePct.value, 1)} of sales plus a {money(nominalCents(pathFor(game), mi, SUGAR_SALES.directOffice2024.value), { compact: true })} sales office)</option>
            </select>
          </label>
          <p className="text-xs text-stone-500">Grower co-ops in the same region often market together through one agency; a co-op selling alone needs its own account managers and brokers. Forward contracts steady the year's price but give up a rising market.</p>
        </div>
      </Panel>
      <Panel title="What a cwt brings now">
        <table className="data text-sm">
          <thead><tr><th>Channel</th><th className="r">Buyer pays</th><th className="r">Our costs</th><th className="r">Net</th></tr></thead>
          <tbody>{quotes.map((q) => (
            <tr key={q.channel} title={q.why}><td>{CHANNEL_LABEL[q.channel]}<div className="text-xs text-stone-500">{q.why}</div></td><td className="r">${q.price.toFixed(2)}</td><td className="r">${q.cost.toFixed(2)}</td><td className="r font-semibold">${q.net.toFixed(2)}</td></tr>
          ))}</tbody>
        </table>
        <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Brand strength" value={pct(book.brand ?? 0, 0)} sub={`builds toward ${pct(SUGAR_SALES.brand.value[pol.brand].target, 0)} with ${pol.brand} support`} />
          <Stat label="Shelf space" value={`${num(lim.shelf)} cwt/yr`} sub="grocers who would carry our packs" />
          <Stat label="Packaging lines" value={`${num(lim.packing)} cwt/yr`} sub={lim.packing > 0 ? 'consumer packing capacity' : 'add a packaging line at the factory'} tone={lim.packing > 0 || pol.retailShare === 0 ? 'neutral' : 'bad'} />
          <Stat label="Distributors" value={`${num(lim.wholesale)} cwt/yr`} sub="bagged-sugar demand in our trade area" />
        </div>
        <p className="mt-2 text-xs text-stone-500">Shelf prices follow wholesale by about a year: retail packs pay best when the market falls and least when it spikes. The selling fee comes off every channel's price.</p>
      </Panel>
      {owns && (
        <Panel title="Sugar sold, last 12 months">
          {sold <= 0 ? <p className="text-sm text-stone-500">No sugar sold yet.</p> : (
            <table className="data text-sm">
              <thead><tr><th>Channel</th><th className="r">cwt</th><th className="r">Share</th><th className="r">Sales</th><th className="r">$/cwt</th></tr></thead>
              <tbody>
                {year.map((y) => <tr key={y.c}><td>{CHANNEL_LABEL[y.c]}</td><td className="r">{num(y.cwt)}</td><td className="r">{pct(y.cwt / sold, 0)}</td><td className="r">{money(y.revenue, { compact: true })}</td><td className="r">{y.cwt > 0 ? `$${(y.revenue / 100 / y.cwt).toFixed(2)}` : '—'}</td></tr>)}
                <tr><td>Bagging, packaging, freight and trade promotion</td><td /><td /><td className="r">{money(-channelCost, { compact: true })}</td><td /></tr>
              </tbody>
            </table>
          )}
        </Panel>
      )}
    </div>
  );
}

function CompanyPanel() {
  const game = useStore((s) => s.game)!;
  const co = game.coop.sugar.company;
  if (!co) return null;
  const town = (id: number) => game.world.towns[id]?.name ?? '?';
  const where = `factory at ${town(co.factoryTownId)}${co.stationTownIds.length ? `, stations at ${co.stationTownIds.map(town).join(' and ')}` : ''}`;
  const text = co.status === 'operating'
    ? `${co.name} runs the beet factory in the territory (${where}), built ${co.builtYear}. Investor-owned sugar companies were selling out to growers or closing through these decades.`
    : co.status === 'forSale'
      ? `${co.name} is selling its ${where} to growers. If no one buys the factory by ${formatMonth(co.deadline ?? co.saleMonth)} it closes. A share drive can raise the equity: growers put up money per acre they want to grow.`
      : co.status === 'sold' ? `We bought ${co.name}'s ${where}.` : `${co.name} closed its factory at ${town(co.factoryTownId)}.`;
  return <Panel title="The territory's sugar company"><p className="text-sm">{text}</p></Panel>;
}

/** How the crop is financed (D-135): growers paid in installments, CCC sugar loans, the line. */
function FinancePanel() {
  const game = useStore((s) => s.game)!;
  const book = game.coop.sugar;
  const fin = game.coop.finance;
  const rate = cccLoanRate(game);
  const r = book.report;
  const limit = Math.min(fin.lineCommitment, fin.borrowingBase);
  return (
    <Panel title="Financing the crop">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Owed to growers" value={money(book.growerPayable ?? 0, { compact: true })} sub={`${Math.round(SUGAR_FINANCE.initialPaymentShare.value * 100)}% paid at delivery, the rest monthly to August${r?.installments ? `; ${money(r.installments, { compact: true })} this month` : ''}`} />
        <Stat label="CCC sugar loans" value={money(book.cccLoan ?? 0, { compact: true })} sub={rate > 0 ? `loan rate $${rate.toFixed(2)}/cwt; up to ${money(cccCapacity(game), { compact: true })} on sugar in store` : 'no CCC loan program this year'} />
        <Stat label="Seasonal line" value={`${money(lineDrawn(game), { compact: true })} of ${money(limit, { compact: true })}`} sub={`commitment ${money(fin.lineCommitment, { compact: true })}, borrowing base ${money(fin.borrowingBase, { compact: true })}`} tone={fin.overLimit ? 'bad' : 'neutral'} />
        <Stat label="Sugar forfeited to CCC" value={r?.forfeitedCwt ? `${num(r.forfeitedCwt)} cwt` : '—'} sub="when the market is below the loan rate" />
      </div>
      <p className="mt-2 text-xs text-stone-500">Beet co-ops pay growers an initial payment at delivery and the rest as the sugar sells. Sugar in store can be pledged to the USDA Commodity Credit Corporation for nonrecourse loans at the loan rate, cheaper than the line; we draw them first and repay as sugar sells. If the market falls below the loan rate, pledged sugar is forfeited and the loan rate is our price. The lender advances {Math.round(SUGAR_FINANCE.sugarAdvance.value * 100)}% on unpledged sugar and {Math.round(SUGAR_FINANCE.beetAdvance.value * 100)}% on piled beets.</p>
    </Panel>
  );
}

function Overview() {
  const game = useStore((s) => s.game)!;
  const book = game.coop.sugar;
  const mi = game.clock.monthIndex;
  const fye = game.setup.fiscalYearEndMonth;
  const fyStart = Math.max(fiscalYearStart(fiscalYearOf(mi, fye), fye), game.ledger.firstMonth);
  const ytd = incomeStatement(game.ledger, fyStart, mi, 'SUGAR');
  const cap = sugarCapacity(game);
  const owns = game.coop.facilities.some((f) => f.division === 'SUGAR' && f.status !== 'closed');
  const piled = book.piles.reduce((a, p) => a + p.tons, 0);
  const c = book.campaign;
  const chart = book.reports.slice(-24).map((r) => ({ m: formatMonthShort(r.monthIndex), delivered: Math.round(r.delivered), sliced: Math.round(r.sliced), piled: Math.round(r.pileTons) }));
  return (
    <div className="space-y-4">
      <CompanyPanel />
      {!owns ? (
        <Panel title="Not in the sugar business yet">
          <p className="text-sm">A beet sugar co-op needs a factory (a processing line, lime kiln, boilers, pulp dryer and sugar silos) and receiving stations where growers pile their beets at harvest. Buy the territory's factory when it comes up for sale, or build one: see <b>Buy or build</b>. Growers usually finance a factory by buying beet shares (<b>Contracts &amp; shares</b>).</p>
        </Panel>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
            <Stat label="Sales, FYTD" value={money(ytd.sales, { compact: true })} />
            <Stat label="Local savings, FYTD" value={money(ytd.localSavings, { compact: true })} tone={ytd.localSavings >= 0 ? 'good' : 'bad'} sub="returned to growers as patronage" />
            <Stat label="Slicing capacity" value={`${num(cap.tpd)} t/day`} sub={cap.bottleneck ? `held by the ${cap.bottleneck}` : `pulp dryer ${num(cap.pulpTpd)} t/day`} tone={cap.bottleneck ? 'bad' : 'neutral'} />
            <Stat label="Beets piled" value={`${num(piled)} t`} sub={piled > 0 ? `${book.pileSugarPct.toFixed(1)}% sugar` : ''} />
            <Stat label="Sugar in silos" value={`${num(book.sugarCwt)} cwt`} sub={`capacity ${num(cap.siloCwt)} cwt`} />
            <Stat label="Recovery" value={pct(recovery(game, yearOf(mi)), 0)} sub={cap.desugarization ? 'with molasses desugarization' : 'of the sugar in the beets'} />
          </div>
          <FinancePanel />
          {c && (
            <Panel title={`Crop ${c.year}`}>
              <p className="text-sm">{num(c.growers)} growers contracted {num(c.contractedAcres)} acres. {c.deliveredTons > 0 ? `Delivered ${num(c.deliveredTons)} tons at ${c.avgSugarPct.toFixed(1)}% sugar; growers earned ${money(c.growerPayments, { compact: true })} at delivery prices, ${Math.round(SUGAR_FINANCE.initialPaymentShare.value * 100)}% paid then and the rest by August.` : `Harvest starts with pre-pile in September; trend yield ${beetYield(c.year).toFixed(1)} t/acre at ${beetSugarTrend(c.year).toFixed(1)}% sugar.`}{c.leftInFieldTons > 0 ? ` ${num(c.leftInFieldTons)} tons stayed in the field for want of pilers or pile ground.` : ''}</p>
            </Panel>
          )}
          <Panel title="Beets received, sliced and piled (tons)">
            {chart.length ? (
              <div className="h-64"><ResponsiveContainer>
                <ComposedChart data={chart}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="m" fontSize={11} /><YAxis fontSize={11} tickFormatter={(v: number) => num(v)} />
                  <Tooltip formatter={(v) => num(Number(v))} /><Legend />
                  <Bar dataKey="delivered" name="Delivered" fill="#7b4b84" />
                  <Bar dataKey="sliced" name="Sliced" fill="#b8901c" />
                  <Line dataKey="piled" name="In piles" stroke="#3f5f2a" dot={false} />
                </ComposedChart>
              </ResponsiveContainer></div>
            ) : <p className="text-sm text-stone-500">No campaign yet.</p>}
          </Panel>
        </>
      )}
      {book.campaigns.length > 0 && (
        <Panel title="Past campaigns">
          <table className="data">
            <thead><tr><th>Crop</th><th className="r">Acres</th><th className="r">Delivered (t)</th><th className="r">t/acre</th><th className="r">Sugar %</th><th className="r">Sliced (t)</th><th className="r">Sugar (cwt)</th><th className="r">Storage loss</th><th className="r">Left in field</th><th className="r">Grower payments</th></tr></thead>
            <tbody>
              {[...book.campaigns].reverse().map((x) => (
                <tr key={x.year}>
                  <td>{x.year}{x.closed ? '' : ' (slicing)'}</td><td className="r">{num(x.contractedAcres)}</td><td className="r">{num(x.deliveredTons)}</td>
                  <td className="r">{x.contractedAcres ? (x.deliveredTons / x.contractedAcres).toFixed(1) : '—'}</td><td className="r">{x.avgSugarPct.toFixed(1)}</td>
                  <td className="r">{num(x.slicedTons)}</td><td className="r">{num(x.sugarCwt)}</td><td className="r">{num(x.storageLossTons)}</td><td className="r">{num(x.leftInFieldTons)}</td><td className="r">{x.growerPayments || x.growers ? money(x.growerPayments, { compact: true }) : <span className="text-xs text-stone-500">bought with the factory</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}
    </div>
  );
}

function Contracts() {
  const game = useStore((s) => s.game)!;
  const command = useStore((s) => s.command);
  const mi = game.clock.monthIndex;
  const year = yearOf(mi);
  const p = game.coop.sugarPolicy;
  const [lo, hi] = SUGAR.growerShareBounds;
  const r = growerReturns(game, mi);
  const value = productValuePerTon(game, mi, beetSugarTrend(year));
  const suggested = suggestedAcres(game, year);
  const drives = game.coop.sugar.shareDrives ?? [];
  const holders = shareholderStats(game);
  const price0 = sharePrice(game);
  const [price, setPrice] = useState(() => Math.max(25, Math.round((r.beets - r.corn) * 2.5 / 25) * 25));
  const [max, setMax] = useState(() => Math.max(1000, suggested || 20_000));
  const demand = shareDemand(game, price);
  const canDrive = shareDriveTowns(game).length > 0;
  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      <Panel title="Beet contracts">
        <div className="space-y-3 text-sm">
          <p>Contracts for the coming crop are signed each February with members within {SUGAR.reachMiles.value} miles of a station or the factory. Shareholders plant their shares first; other growers sign up when beets beat corn.</p>
          <label className="block"><input type="checkbox" checked={p.targetAcres === null} onChange={(e) => command({ type: 'setSugarPolicy', policy: { targetAcres: e.target.checked ? null : suggested } })} /> Contract what our plants can handle ({num(suggested)} acres this year)</label>
          {p.targetAcres !== null && <label className="block">Target <CommitNumber min={0} max={500_000} value={p.targetAcres} onCommit={(v) => command({ type: 'setSugarPolicy', policy: { targetAcres: v } })} /> acres</label>}
          <label className="block">Pay growers <CommitNumber min={Math.round(lo * 100)} max={Math.round(hi * 100)} value={Math.round(p.growerShare * 100)} onCommit={(v) => command({ type: 'setSugarPolicy', policy: { growerShare: v / 100 } })} />% of a ton's value at delivery</label>
          <label className="block"><input type="checkbox" checked={p.paymentBasis === 'proceeds'} onChange={(e) => command({ type: 'setSugarPolicy', policy: { paymentBasis: e.target.checked ? 'proceeds' : 'fixed' } })} /> Pay from proceeds: each February reset the share to what last year's sugar sales could pay after the factory's costs (growers carry the sugar price)</label>
          <table className="data">
            <tbody>
              <tr><td>Value of a ton of beets now</td><td className="r">${value.toFixed(2)}</td><td className="text-xs text-stone-500">sugar at {beetSugarTrend(year).toFixed(1)}% and {pct(recovery(game, year), 0)} recovery, plus pulp and molasses</td></tr>
              <tr><td>Paid at delivery</td><td className="r">${(value * p.growerShare).toFixed(2)}/t</td><td className="text-xs text-stone-500">the rest pays the factory; what is left comes back as patronage on tons</td></tr>
              <tr><td>Growers expect from beets</td><td className="r">${num(r.beets)}/acre</td><td className="text-xs text-stone-500">at {beetYield(year).toFixed(1)} t/acre, after ${num(SUGAR.growerCostPerAcre2024.value)} (2024 $) of growing costs</td></tr>
              <tr><td>… against corn</td><td className="r">${num(r.corn)}/acre</td><td className="text-xs text-stone-500">corn's return over direct costs</td></tr>
            </tbody>
          </table>
          <p className="text-xs text-stone-500">A lower payment share leaves more in the co-op to pay for the plants, but fewer growers sign up. Beets take at most a quarter of a farm's row-crop acres (rotation).</p>
        </div>
      </Panel>
      <Panel title="Beet shares">
        <div className="space-y-3 text-sm">
          <p>Grower co-ops financed their factories by selling growers <b>beet shares</b>: preferred stock, one share per acre, that carries the right and the duty to grow beets. <b>{num(holders.farms)}</b> farms hold <b>{num(holders.shares)}</b> shares{price0 > 0 ? `; a share is worth about $${num(price0)} now` : ''}.</p>
          <p className="text-xs text-stone-500">Every acre grown needs a share: a grower who contracts more acres than their shares cover buys the rest at the share price, and a farm that is not a member joins to grow beets. Growers trade shares among themselves each January (see the share market below).</p>
          {!canDrive ? <p className="text-stone-500">A share drive needs a factory or station we own, are building, or could buy.</p> : (
            <>
              <label className="block">Price <CommitNumber min={5} max={20_000} value={price} onCommit={setPrice} /> $ a share</label>
              <label className="block">Offer up to <CommitNumber min={100} max={500_000} value={max} onCommit={setMax} /> shares</label>
              <p>At ${num(price)} growers would take about <b>{num(demand.shares)}</b> shares ({num(demand.growers)} growers), raising up to <b>{money(Math.min(demand.shares, max) * price * 100, { compact: true })}</b>. Beets earn about ${num(demand.advantage)} an acre a year more than corn; growers buy when a share pays back within {SUGAR.sharePaybackYears.value[0]}–{SUGAR.sharePaybackYears.value[1]} years.</p>
              <button className="btn btn-primary" disabled={demand.shares <= 0} onClick={() => command({ type: 'offerBeetShares', pricePerShare: price, maxShares: max })}>Hold a share drive</button>
            </>
          )}
          {drives.length > 0 && (
            <table className="data text-xs">
              <thead><tr><th>Month</th><th>How</th><th className="r">Price</th><th className="r">Sold</th><th className="r">Growers</th><th className="r">Raised</th></tr></thead>
              <tbody>{[...drives].reverse().map((d) => <tr key={`${d.monthIndex}-${d.contracts ? 'c' : 'd'}`}><td>{formatMonthShort(d.monthIndex)}</td><td>{d.contracts ? 'with contracts' : 'share drive'}</td><td className="r">{money(d.pricePerShare)}</td><td className="r">{num(d.sold)}</td><td className="r">{num(d.growers)}</td><td className="r">{money(d.raised, { compact: true })}</td></tr>)}</tbody>
            </table>
          )}
        </div>
      </Panel>
      <ShareMarketPanel />
    </div>
  );
}

/** The growers' share market (D-137). */
function ShareMarketPanel() {
  const game = useStore((s) => s.game)!;
  const command = useStore((s) => s.command);
  const log = game.coop.sugar.shareMarket ?? [];
  const open = game.coop.sugarPolicy.shareTrading !== false;
  const now = marketPrice(game);
  const value = shareValue(game);
  return (
    <Panel title="Share market" className="xl:col-span-2">
      <div className="space-y-2 text-sm">
        <p>Growers buy and sell beet shares among themselves each January, before contracts are signed. Growers who quit farming sell, as do growers whose rotation shrank and a few for ordinary reasons; growers short of shares, farms buying in and growers with room buy. A farm that buys joins the co-op. The price follows what a share earns — a few years of beets' advantage over corn — and the balance of buyers and sellers. New shares the co-op issues sell at the market price.</p>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Market price" value={now > 0 ? `$${num(now)}` : '—'} sub="last January's, in today's dollars" />
          <Stat label="What a share earns" value={`$${num(value)}`} sub="years of beets' advantage over corn" />
          <Stat label="Traded last January" value={log.length ? num(log[log.length - 1].traded) : '—'} sub={log.length ? `${num(log[log.length - 1].sellers)} sellers, ${num(log[log.length - 1].buyers)} buyers` : ''} />
          <Stat label="Shareholders" value={num(shareholderStats(game).farms)} sub={`${num(shareholderStats(game).shares)} shares`} />
        </div>
        <label className="block"><input type="checkbox" checked={open} onChange={(e) => command({ type: 'setSugarPolicy', policy: { shareTrading: e.target.checked } })} /> Growers may trade shares among themselves (if closed, the co-op redeems a departing grower's shares at book value, in cash)</label>
        {log.length > 0 && (
          <table className="data text-xs">
            <thead><tr><th>January</th><th className="r">Price</th><th className="r">Offered</th><th className="r">Traded</th><th className="r">Sellers</th><th className="r">Buyers</th><th className="r">Redeemed by co-op</th></tr></thead>
            <tbody>{[...log].reverse().map((r) => (
              <tr key={r.monthIndex}><td>{formatMonthShort(r.monthIndex)}</td><td className="r">{r.price ? money(r.price) : '—'}</td><td className="r">{num(r.offered)}</td><td className="r">{num(r.traded)}</td><td className="r">{num(r.sellers)}</td><td className="r">{num(r.buyers)}</td><td className="r">{r.redeemed ? `${num(r.redeemed)} (${money(r.redeemedCost ?? 0, { compact: true })})` : '—'}</td></tr>
            ))}</tbody>
          </table>
        )}
      </div>
    </Panel>
  );
}

function Buy() {
  const [fin, setFin] = useState(0.5);
  return (
    <div className="space-y-4">
      <CompanyPanel />
      <OffersPanel kinds={[...KINDS]} fin={fin} setFin={setFin} />
      <Panel title="What a beet sugar operation needs">
        <ul className="list-disc space-y-1 pl-5 text-sm">
          <li><b>Processing line</b> (tons of beets a day): washing, slicing into cossettes, diffusion, lime-and-CO₂ juice purification, evaporation and crystallization. It sets the slicing rate.</li>
          <li><b>Lime kiln</b> (one per ~{num(SUGAR.kilnTpd.value)} t/day) and <b>boilers</b> (one per ~{num(SUGAR.boilerTpd.value)} t/day): without enough of either the line cannot run at its rate.</li>
          <li><b>Pulp dryer</b>: dried pellets sell near corn's feed value; pulp it cannot dry sells wet for much less.</li>
          <li><b>Sugar silos</b>: hold the campaign's sugar to sell through the year; overflow is dumped at a discount.</li>
          <li><b>Pilers and pile ground</b> at the factory and at receiving stations within {SUGAR.reachMiles.value} miles of growers: the crop is dug in a few weeks of October and must be piled until the factory slices it. Ventilated piles keep sugar longer; piles left in late spring spoil.</li>
          <li><b>Molasses desugarization</b> (from 1989): recovers several more points of the sugar.</li>
        </ul>
      </Panel>
      <ProjectPlanner kinds={[...KINDS]} />
      <ConsultantsPanel kinds={[...KINDS]} />
    </div>
  );
}
