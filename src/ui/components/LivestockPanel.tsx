import { LIVESTOCK } from '../../data/supply';
import { formatMonthShort, LIVESTOCK_KINDS, livestockBlocked, monthsOnFeed, projectedMargin, yearOf, type LivestockKind, type LivestockMarketing } from '../../engine/index';
import { CommitNumber } from './CommitNumber';
import { Panel, Stat } from './Panel';
import { money, num } from '../format';
import { useStore } from '../store';

const MARKETING: Record<LivestockMarketing, string> = {
  spot: 'Spot market (the packer bid when sold)',
  formula: 'Formula contract with a packer (quality premium)',
  fixed: 'Fixed-price contract (price locked when placed)',
};

/** Livestock the co-op owns, placed with contract growers or a custom feedlot (D-111). */
export function LivestockPanel() {
  const game = useStore((s) => s.game)!;
  const command = useStore((s) => s.command);
  const book = game.coop.livestock;
  const mi = game.clock.monthIndex;
  const year = yearOf(mi);
  const sales12 = (book?.sales ?? []).filter((x) => mi - x.monthIndex < 12);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {LIVESTOCK_KINDS.map((k) => {
          const onFeed = (book?.cohorts ?? []).filter((c) => c.kind === k);
          return <Stat key={k} label={`${k === 'hogs' ? 'Hogs' : 'Cattle'} on feed`} value={num(onFeed.reduce((a, c) => a + c.head, 0))} sub={`book cost ${money(onFeed.reduce((a, c) => a + c.cost, 0), { compact: true })}`} />;
        })}
        <Stat label="Sold, 12 months" value={money(sales12.reduce((a, x) => a + x.revenue, 0), { compact: true })} sub={`${num(sales12.reduce((a, x) => a + x.head, 0))} head`} />
        <Stat label="Margin, 12 months" value={money(sales12.reduce((a, x) => a + x.revenue - x.cost, 0), { compact: true })} tone={sales12.reduce((a, x) => a + x.revenue - x.cost, 0) >= 0 ? 'good' : 'bad'} sub="after animals, feed and fees" />
      </div>
      {LIVESTOCK_KINDS.map((k) => <ProgramRow key={k} kind={k} />)}
      <Panel title="Groups on feed">
        {!(book?.cohorts.length) ? <p className="text-sm text-stone-500">None yet.</p> : (
          <table className="data">
            <thead><tr><th>Group</th><th className="r">Head</th><th>Placed</th><th>Sells</th><th>Marketing</th><th className="r">Cost so far</th></tr></thead>
            <tbody>
              {book.cohorts.map((c) => (
                <tr key={c.id}><td>{c.kind === 'hogs' ? 'Hogs' : 'Steers'} #{c.id}</td><td className="r">{num(c.head)}</td><td>{formatMonthShort(c.placedMonth)}</td><td>{formatMonthShort(c.sellMonth)}</td><td>{c.marketing}{c.lockedPrice ? ` at $${c.lockedPrice.toFixed(2)}/cwt` : ''}</td><td className="r">{money(c.cost)}</td></tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
      <p className="text-xs text-stone-500">Hogs are owned by the co-op and finished by contract growers, who supply the barns and labor for a fee; our mill feeds them from whatever room customers leave, and anything more is bought in. Steers go to a custom feedlot that charges yardage. Groups sell to packers after about {monthsOnFeed('hogs', year)} months (hogs) or {monthsOnFeed('cattle', year)} months (cattle). Margins swing widely with hog, cattle and corn prices; a fixed-price contract locks the sale price when the group is placed.</p>
    </div>
  );
}

function ProgramRow({ kind }: { kind: LivestockKind }) {
  const game = useStore((s) => s.game)!;
  const command = useStore((s) => s.command);
  const prog = game.coop.livestock?.program[kind] ?? { headPerMonth: 0, marketing: 'spot' as LivestockMarketing };
  const blocked = livestockBlocked(game, kind);
  const p = projectedMargin(game, kind);
  return (
    <Panel title={LIVESTOCK[kind].label}>
      {blocked && prog.headPerMonth === 0 ? <p className="text-sm text-stone-500">{blocked}</p> : (
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <label>Place <CommitNumber value={prog.headPerMonth} min={0} max={LIVESTOCK[kind].maxPerMonth} step={kind === 'hogs' ? 100 : 25} className="input w-24"
            onCommit={(n) => command({ type: 'setLivestockProgram', kind, headPerMonth: n, marketing: prog.marketing })} ariaLabel={`${kind} placed per month`} /> head a month</label>
          <select className="input" value={prog.marketing} aria-label={`${kind} marketing`} onChange={(e) => command({ type: 'setLivestockProgram', kind, headPerMonth: prog.headPerMonth, marketing: e.target.value as LivestockMarketing })}>
            {(Object.keys(MARKETING) as LivestockMarketing[]).map((m) => <option key={m} value={m}>{MARKETING[m]}</option>)}
          </select>
          <span className="text-stone-600">At today's prices: sale ${p.revenue.toFixed(0)}/head, cost ${p.cost.toFixed(0)}/head, <b className={p.margin >= 0 ? 'text-field' : 'text-rust'}>margin ${p.margin.toFixed(0)}/head</b></span>
        </div>
      )}
    </Panel>
  );
}
