// The farm economy around the co-op (D-132): this year's crop, what farmers are planting and
// buying, where the livestock cycles stand, farm income, and what it all means for margins.

import { farmEconomyView } from '../../engine/index';
import { useStore } from '../store';
import { Panel } from './Panel';

const sign = (x: number, digits = 0) => (Number.isFinite(x) ? `${x >= 0 ? '+' : '−'}${Math.abs(x * 100).toFixed(digits)}%` : '—');
const tone = (x: number, good = 0.03) => (!Number.isFinite(x) ? 'text-stone-400' : x > good ? 'text-field' : x < -good ? 'text-rust' : '');
const factorText = (f: number) => sign(f - 1);

function Row({ label, value, note, cls = '' }: { label: string; value: string; note?: string; cls?: string }) {
  return (
    <tr>
      <td className="text-stone-600">{label}</td>
      <td className={`r font-semibold ${cls}`}>{value}</td>
      <td className="text-xs text-stone-500">{note}</td>
    </tr>
  );
}

export function FarmEconomyPanel() {
  const game = useStore((s) => s.game)!;
  const v = farmEconomyView(game);
  const d = v.demand;
  const stress = v.stress.national + v.stress.local;
  return (
    <Panel title="Farm economy" right={<span className="text-xs text-stone-500">Crop year {v.cropYear}</span>}>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <table className="data">
          <tbody>
            <Row label="Our territory's corn crop" value={sign(v.localCorn)} cls={tone(v.localCorn)} note={`against trend; the region ${sign(v.regionalCorn)}`} />
            <Row label="Harvest basis swing" value={factorText(v.grain.basisSwing)} cls={tone(v.grain.basisSwing - 1)} note="deeper discount at harvest, stronger recovery to store into" />
            <Row label="Storage carry" value={factorText(v.grain.carry)} cls={tone(v.grain.carry - 1)} note="futures carry paid for storing hedged grain" />
            <Row label="Elevator margin" value={factorText(v.grain.margin)} cls={tone(v.grain.margin - 1)} note="big crops let elevators widen it; short ones squeeze it" />
            <Row label="Soybean : corn price" value={`${v.soyCorn.now.toFixed(2)}`} note={`norm ${v.soyCorn.norm.toFixed(2)}; above it farmers plant more soybeans`} />
            <Row label="Fertilizer : corn price" value={factorText(v.nToCorn)} cls={tone(1 - v.nToCorn, 0.05)} note="against its ten-year norm" />
          </tbody>
        </table>
        <table className="data">
          <tbody>
            <Row label="Farm income" value={factorText(v.incomeIndex)} cls={tone(v.incomeIndex - 1, 0.08)} note="real net farm income here against the last ten years" />
            <Row label="Farm stress" value={stress < 0.08 ? 'Low' : stress < 0.25 ? 'Elevated' : 'High'} cls={stress < 0.08 ? 'text-field' : stress < 0.25 ? 'text-[#8a6d1a]' : 'text-rust'} note="drives bad debts and farms quitting" />
            <Row label="Nitrogen rates" value={factorText(d.nRate)} cls={tone(d.nRate - 1)} note="follow the fertilizer : corn price ratio" />
            <Row label="Phosphorus & potash" value={factorText(d.pk)} cls={tone(d.pk - 1)} note="skipped in lean years, caught up in good ones" />
            <Row label="Hog numbers" value={factorText(d.herds.hogs)} cls={tone(d.herds.hogs - 1)} note="follow the hog : corn ratio a year ago" />
            <Row label="Cattle on feed" value={factorText(d.herds.cattleOnFeed)} cls={tone(d.herds.cattleOnFeed - 1)} note="follow cattle prices against corn a year ago" />
          </tbody>
        </table>
      </div>
      <div className="mt-3 overflow-x-auto">
        <table className="data text-xs">
          <thead><tr><th>Year</th><th className="r">Region corn</th><th className="r">Our territory</th><th>Local weather</th><th className="r">Planting</th><th className="r">Farm income</th></tr></thead>
          <tbody>
            {[...v.years].reverse().map((y) => (
              <tr key={y.year}>
                <td>{y.year}</td>
                <td className={`r ${tone(y.regionalCorn, 0.05)}`}>{sign(y.regionalCorn)}</td>
                <td className={`r ${tone(y.territory, 0.05)}`}>{sign(y.territory)}</td>
                <td>{y.disaster ? <span className="text-rust">{y.disaster.kind} in {y.disaster.county} County (−{Math.round(y.disaster.cut * 100)}%)</span> : ''}</td>
                <td className="r">{Math.abs(y.plantingShift) < 0.02 ? 'usual mix' : y.plantingShift > 0 ? `+${Math.round(y.plantingShift * 100)} pts corn` : `+${Math.round(-y.plantingShift * 100)} pts soy`}</td>
                <td className={`r ${tone(y.incomeIndex - 1, 0.08)}`}>{sign(y.incomeIndex - 1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-1 text-xs text-stone-500">Crops are against the region's trend; a year's crop shows after harvest. Planting shows the shift between corn and soybeans.</p>
      </div>
    </Panel>
  );
}
