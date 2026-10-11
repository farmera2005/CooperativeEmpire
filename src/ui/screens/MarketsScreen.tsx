import { useMemo, useState } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { MARKET_SERIES, SERIES_IDS, type SeriesGroup, type SeriesId } from '../../data/markets';
import { formatMonthShort, marketRange, marketValue, pathFor, priceLevel, yearOf } from '../../engine/index';
import { Panel } from '../components/Panel';
import { pct } from '../format';
import { useStore } from '../store';

const GROUPS: { id: SeriesGroup; label: string }[] = [
  { id: 'grain', label: 'Grain & meal' }, { id: 'livestock', label: 'Livestock & milk' }, { id: 'energy', label: 'Energy' },
  { id: 'fertilizer', label: 'Fertilizer' }, { id: 'rates', label: 'Interest rates' }, { id: 'macro', label: 'Economy & land' }, { id: 'yields', label: 'Yields' },
];

const fmt = (id: SeriesId, v: number) => {
  const d = MARKET_SERIES[id];
  return d.kind === 'rate' ? `${v.toFixed(2)}%` : v.toLocaleString('en-US', { minimumFractionDigits: Math.min(d.decimals, 2), maximumFractionDigits: Math.min(d.decimals, 2) });
};

export function MarketsScreen() {
  const game = useStore((s) => s.game)!;
  const [series, setSeries] = useState<SeriesId[]>(['corn', 'soybeans']);
  const [years, setYears] = useState(10);
  const [real, setReal] = useState(false);
  const path = pathFor(game);
  const mi = game.clock.monthIndex;
  const from = Math.max(mi - years * 12, 1970 * 12);
  const data = useMemo(() => {
    const rows: Record<string, number | string>[] = [];
    const ranges = series.map((id) => marketRange(path, id, from, mi));
    for (let i = 0; i <= mi - from; i++) {
      const m = from + i;
      const row: Record<string, number | string> = { m: formatMonthShort(m) };
      series.forEach((id, k) => {
        const v = ranges[k][i]?.value;
        if (Number.isFinite(v)) row[id] = real && MARKET_SERIES[id].kind === 'price' ? v / priceLevel(path, m) : v;
      });
      rows.push(row);
    }
    return rows;
  }, [path, series, from, mi, real]);
  const toggle = (id: SeriesId) => setSeries((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id].slice(-4)));
  const colors = ['#3f5f2a', '#c9a227', '#3b6e8f', '#a3472b'];
  const w = game.world.weather;
  return (
    <div className="space-y-4">
      <Panel title="Price history" right={
        <div className="flex items-center gap-2 text-xs">
          {[5, 10, 20, 60].map((y) => <button key={y} className={`btn px-2 py-0.5 ${years === y ? 'btn-primary' : ''}`} onClick={() => setYears(y)}>{y === 60 ? 'All' : `${y}y`}</button>)}
          <label className="flex items-center gap-1"><input type="checkbox" checked={real} onChange={(e) => setReal(e.target.checked)} /> 2024 dollars</label>
        </div>
      }>
        <div style={{ height: 320 }}>
          <ResponsiveContainer>
            <LineChart data={data} margin={{ left: 10, right: 20, top: 5, bottom: 5 }}>
              <CartesianGrid stroke="#e7e2d3" />
              <XAxis dataKey="m" fontSize={11} minTickGap={40} />
              {series.map((id, k) => <YAxis key={id} yAxisId={id} orientation={k % 2 ? 'right' : 'left'} hide={k > 1} fontSize={11} stroke={colors[k]} domain={['auto', 'auto']} />)}
              <Tooltip formatter={(v, name) => [fmt(name as SeriesId, Number(v)), MARKET_SERIES[name as SeriesId].label]} />
              {series.map((id, k) => <Line key={id} yAxisId={id} dataKey={id} stroke={colors[k]} dot={false} isAnimationActive={false} />)}
            </LineChart>
          </ResponsiveContainer>
        </div>
        <p className="mt-1 text-xs text-stone-500">Select up to four series below. Histories show only what has happened so far in your game.</p>
      </Panel>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        {GROUPS.map((g) => (
          <Panel key={g.id} title={g.label}>
            <table className="data">
              <thead><tr><th></th><th>Series</th><th className="r">Now</th><th className="r">1 yr ago</th><th className="r">Chg</th></tr></thead>
              <tbody>
                {SERIES_IDS.filter((id) => MARKET_SERIES[id].group === g.id).map((id) => {
                  const d = MARKET_SERIES[id];
                  const v = marketValue(path, id, mi);
                  if (!Number.isFinite(v)) return null;
                  const y = marketValue(path, id, mi - 12);
                  const anchor = d.annual.find((p) => p.year === yearOf(mi));
                  return (
                    <tr key={id}>
                      <td><input type="checkbox" checked={series.includes(id)} onChange={() => toggle(id)} aria-label={`Chart ${d.label}`} /></td>
                      <td>{d.label} <span className="text-xs text-stone-500">{d.unit}</span>
                        {anchor && anchor.confidence !== 'high' && <span title={`Data confidence: ${anchor.confidence}`} className="ml-1 text-xs text-grain">◆</span>}
                      </td>
                      <td className="r">{fmt(id, v)}</td>
                      <td className="r">{Number.isFinite(y) ? fmt(id, y) : '—'}</td>
                      <td className="r">{Number.isFinite(y) ? (d.kind === 'rate' ? (v - y).toFixed(2) : pct(v / y - 1)) : ''}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Panel>
        ))}
        <Panel title="Weather this month">
          <dl className="grid grid-cols-2 gap-1 text-sm">
            <dt className="text-stone-500">Workable field days (by week)</dt><dd className="num">{w.fieldDays.join(' / ')}</dd>
            <dt className="text-stone-500">Heating degree days</dt><dd className="num">{w.hdd} (normal {w.hddNormal})</dd>
            <dt className="text-stone-500">Spring</dt><dd>{w.wetSpring ? 'Wet' : 'Normal'}</dd>
            <dt className="text-stone-500">Fall</dt><dd>{w.wetFall ? 'Wet' : 'Normal'} (harvest moisture ~{w.harvestMoisture}%)</dd>
          </dl>
          <p className="mt-2 text-xs text-stone-500">◆ marks values with medium or low data confidence. See docs/DATA_REVIEW.md.</p>
        </Panel>
      </div>
    </div>
  );
}
