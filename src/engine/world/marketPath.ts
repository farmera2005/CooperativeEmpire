// Monthly market paths (DESIGN §6.3–6.5, D-016).
//
// The full path is a deterministic function of (seed, history mode, drift plan) and the
// data files, so it is NOT stored in game state: it is rebuilt on demand and cached.
//
// Build per series:
//   1. transform annual anchors (log for prices/indices, identity for rates)
//   2. trend = centered moving average; deviation = anchor - trend (annual), both
//      interpolated to months between mid-year points
//   3. drift: events that own deviation windows move/scale them
//   4. intra-year spikes from events (mean-zero within the calendar year)
//   5. seasonality, AR(1) noise; strict mode renormalizes each year to the anchor
//   6. after the data ends, a procedural continuation with correlated factor shocks,
//      regime switching and mean reversion

import { HISTORY } from '../../data/history';
import {
  DATA_END_YEAR, MARKET_SERIES, PROCEDURAL_FACTORS, PROCEDURAL_INFLATION, PROCEDURAL_PRIME_MEAN, PROCEDURAL_REGIMES,
  SERIES_IDS, type MarketSeriesDef, type SeriesId,
} from '../../data/markets';
import { ECCB } from '../../data/regions/eccb';
import { MARKETS_BUILD } from '../../data/tuning';
import { monthOf, toMonthIndex, yearOf } from '../core/calendar';
import { hashValue } from '../core/hash';
import { stream } from '../core/rng';
import type { DriftPlan, HistoryMode } from '../types';
import { ymToMonth } from './drift';

export const PATH_START_YEAR = 1970;
export const PATH_START = toMonthIndex(PATH_START_YEAR, 1);
const DATA_END = toMonthIndex(DATA_END_YEAR, 12);

export interface MarketPath {
  key: string;
  /** values[series][monthIndex - PATH_START]; NaN where the series does not exist. */
  values: Record<SeriesId, number[]>;
  /** Procedural generator state for extending beyond the data. */
  proc: ProcState;
  seed: number;
}

interface ProcState {
  lastMonth: number;
  regime: number;
  /** Deseasonalized level per series in transform space. */
  level: Record<string, number>;
  /** Long-run real means in transform space, with the CPI at which they were measured. */
  realMean: Record<string, number>;
  cpiRef: number;
  cpi: number;
  inflation: number;
  yieldTrend: Record<string, { slope: number; base: number; baseYear: number }>;
}

const isRate = (d: MarketSeriesDef) => d.kind === 'rate';
const fwd = (d: MarketSeriesDef, v: number) => (isRate(d) ? v : Math.log(Math.max(v, 1e-6)));
const inv = (d: MarketSeriesDef, x: number) => (isRate(d) ? x : Math.exp(x));

function seasonLog(d: MarketSeriesDef): number[] {
  if (!d.seasonality) return new Array(12).fill(0);
  const logs = d.seasonality.map((x) => Math.log(x));
  const m = logs.reduce((a, b) => a + b, 0) / 12;
  return logs.map((x) => x - m);
}

/** Interpolate annual values (placed at mid-year) to months [first, last]. */
function annualToMonthly(years: number[], vals: number[], first: number, last: number): number[] {
  const out: number[] = [];
  for (let mi = first; mi <= last; mi++) {
    const t = yearOf(mi) + (monthOf(mi) - 0.5) / 12; // month center in fractional years
    const x = t - 0.5; // anchor for year y sits at y + 0.5
    if (x <= years[0]) out.push(vals[0]);
    else if (x >= years[years.length - 1]) out.push(vals[vals.length - 1]);
    else {
      const i = Math.floor(x) - years[0];
      const f = x - Math.floor(x);
      out.push(vals[i] + (vals[i + 1] - vals[i]) * f);
    }
  }
  return out;
}

function taper(m: number, w0: number, w1: number, t: number): number {
  if (m >= w0 && m <= w1) return 1;
  if (t <= 0) return 0;
  if (m < w0) return Math.max(0, 1 - (w0 - m) / (t + 1));
  return Math.max(0, 1 - (m - w1) / (t + 1));
}

function buildHistorical(d: MarketSeriesDef, seed: number, mode: HistoryMode, drift: DriftPlan): number[] {
  const n = DATA_END - PATH_START + 1;
  const out = new Array<number>(n).fill(NaN);
  const first = toMonthIndex(Math.max(PATH_START_YEAR, d.availableFrom ?? PATH_START_YEAR), 1);
  const firstIdx = first - PATH_START;
  const pts = d.annual.filter((p) => p.year >= PATH_START_YEAR);
  const years = pts.map((p) => p.year);
  const X = pts.map((p) => fwd(d, p.value));
  const isYield = d.kind === 'yield';

  // Trend and deviation (annual).
  const half = Math.floor(MARKETS_BUILD.trendWindowYears / 2);
  const T = X.map((_, i) => {
    let s = 0;
    let c = 0;
    for (let j = Math.max(0, i - half); j <= Math.min(X.length - 1, i + half); j++) {
      s += X[j];
      c++;
    }
    return s / c;
  });
  const D = X.map((x, i) => x - T[i]);

  // Monthly trend & deviation.
  let t: number[];
  let dev: number[];
  if (isYield) {
    t = [];
    dev = [];
    for (let mi = first; mi <= DATA_END; mi++) {
      const i = yearOf(mi) - years[0];
      t.push(T[i]);
      dev.push(D[i]);
    }
  } else {
    t = annualToMonthly(years, T, first, DATA_END);
    dev = annualToMonthly(years, D, first, DATA_END);
  }
  const len = t.length;

  // Drift: move deviation windows owned by driftable events.
  const owners: { w0: number; w1: number; shift: number; mag: number }[] = [];
  for (const ev of HISTORY) {
    for (const eff of ev.effects) {
      if (eff.kind !== 'marketWindow' || !eff.series.includes(d.id)) continue;
      const de = ev.driftable ? drift[ev.id] : undefined;
      let shift = de?.shiftMonths ?? 0;
      if (isYield) shift = 12 * (yearOf(ymToMonth(ev.date) + shift) - yearOf(ymToMonth(ev.date)));
      owners.push({ w0: ymToMonth(eff.from) - first, w1: ymToMonth(eff.to) - first, shift, mag: de?.magnitude ?? 1 });
    }
  }
  if (owners.some((o) => o.shift !== 0 || o.mag !== 1)) {
    const tp = isYield ? 0 : MARKETS_BUILD.windowTaperMonths;
    const weight = (m: number) => {
      const ws = owners.map((o) => taper(m, o.w0, o.w1, tp));
      const tot = ws.reduce((a, b) => a + b, 0);
      return { ws, scale: tot > 1 ? 1 / tot : 1 };
    };
    const W = Array.from({ length: len }, (_, m) => weight(m));
    const nd = dev.map((v, m) => v * (1 - W[m].ws.reduce((a, b) => a + b, 0) * W[m].scale));
    owners.forEach((o, k) => {
      for (let m = 0; m < len; m++) {
        const src = m - o.shift;
        if (src < 0 || src >= len) continue;
        const w = W[src].ws[k] * W[src].scale;
        if (w > 0) nd[m] += o.mag * w * dev[src];
      }
    });
    dev = nd;
  }

  // Spikes.
  const spikeAdd = new Array<number>(len).fill(0);
  if (!isYield) {
    for (const ev of HISTORY) {
      const de = ev.driftable ? drift[ev.id] : undefined;
      for (const eff of ev.effects) {
        if (eff.kind !== 'marketSpike' || eff.series !== d.id) continue;
        const peak = ymToMonth(eff.at) + (de?.shiftMonths ?? 0) - first;
        const mag = de?.magnitude ?? 1;
        const anchorYearIdx = Math.min(years.length - 1, Math.max(0, yearOf(peak + first) - years[0]));
        const amp = isRate(d) ? eff.pct * mag * pts[anchorYearIdx].value : Math.log(1 + eff.pct * mag);
        const shape = new Array<number>(len).fill(0);
        for (let m = peak - eff.rampMonths; m <= peak + eff.decayMonths; m++) {
          if (m < 0 || m >= len) continue;
          const w = m <= peak ? 1 - (peak - m) / (eff.rampMonths + 1) : 1 - (m - peak) / (eff.decayMonths + 1);
          shape[m] = amp * w;
        }
        // Mean-zero within the peak's calendar year.
        const y0 = toMonthIndex(yearOf(peak + first), 1) - first;
        let s = 0;
        for (let m = y0; m < y0 + 12; m++) if (m >= 0 && m < len) s += shape[m];
        const mean = s / 12;
        for (let m = y0; m < y0 + 12; m++) if (m >= 0 && m < len) shape[m] -= mean;
        for (let m = 0; m < len; m++) spikeAdd[m] += shape[m];
      }
    }
  }

  // Seasonality and noise.
  const season = seasonLog(d);
  const rng = stream(seed, -1, `markets.noise.${d.id}`);
  const rho = MARKETS_BUILD.noisePersistence.value;
  const sd = d.noiseSd * (mode === 'strict' ? MARKETS_BUILD.strictNoiseScale.value : 1);
  let e = 0;
  const x = new Array<number>(len);
  for (let m = 0; m < len; m++) {
    e = rho * e + Math.sqrt(1 - rho * rho) * sd * rng.normal();
    const seas = isYield || isRate(d) ? 0 : season[monthOf(m + first) - 1];
    x[m] = t[m] + dev[m] + spikeAdd[m] + seas + (isYield || isRate(d) ? 0 : e);
  }

  // Strict mode: renormalize each calendar year so the annual mean equals the anchor.
  if (mode === 'strict' && !isYield) {
    for (let i = 0; i < pts.length; i++) {
      const y0 = toMonthIndex(pts[i].year, 1) - first;
      if (y0 < 0 || y0 + 12 > len) continue;
      if (isRate(d)) {
        let s = 0;
        for (let m = y0; m < y0 + 12; m++) s += x[m];
        const adj = pts[i].value - s / 12;
        for (let m = y0; m < y0 + 12; m++) x[m] += adj;
      } else {
        let s = 0;
        for (let m = y0; m < y0 + 12; m++) s += Math.exp(x[m]);
        const adj = Math.log(pts[i].value / (s / 12));
        for (let m = y0; m < y0 + 12; m++) x[m] += adj;
      }
    }
  }

  for (let m = 0; m < len; m++) {
    let v = inv(d, x[m]);
    if (isRate(d)) v = Math.max(0, v);
    out[firstIdx + m] = v;
  }
  return out;
}

function initProc(values: Record<SeriesId, number[]>): ProcState {
  const lastIdx = DATA_END - PATH_START;
  const cpiNow = values.cpi[lastIdx];
  const level: Record<string, number> = {};
  const realMean: Record<string, number> = {};
  const yieldTrend: ProcState['yieldTrend'] = {};
  for (const id of SERIES_IDS) {
    const d = MARKET_SERIES[id];
    const season = seasonLog(d);
    const v = values[id][lastIdx];
    level[id] = fwd(d, v) - (isRate(d) || d.kind === 'yield' ? 0 : season[11]);
    // Real mean over the last 10 years.
    let s = 0;
    let c = 0;
    for (let k = lastIdx - 119; k <= lastIdx; k++) {
      const val = values[id][k];
      if (!Number.isFinite(val)) continue;
      const real = d.kind === 'price' ? val * (cpiNow / values.cpi[k]) : val;
      s += fwd(d, real);
      c++;
    }
    realMean[id] = c ? s / c : level[id];
    if (d.kind === 'yield') {
      const pts = d.annual.slice(-20);
      const n = pts.length;
      const mx = pts.reduce((a, p) => a + p.year, 0) / n;
      const my = pts.reduce((a, p) => a + p.value, 0) / n;
      const slope = pts.reduce((a, p) => a + (p.year - mx) * (p.value - my), 0) / pts.reduce((a, p) => a + (p.year - mx) ** 2, 0);
      yieldTrend[id] = { slope, base: my + slope * (DATA_END_YEAR - mx), baseYear: DATA_END_YEAR };
    }
  }
  return { lastMonth: DATA_END, regime: 1, level, realMean, cpiRef: cpiNow, cpi: cpiNow, inflation: PROCEDURAL_INFLATION.mean, yieldTrend };
}

/** Extend the path procedurally through month `to`. Mutates the cached path. */
function extend(path: MarketPath, to: number): void {
  const p = path.proc;
  const pr = PROCEDURAL_REGIMES;
  while (p.lastMonth < to) {
    const mi = p.lastMonth + 1;
    const rng = stream(path.seed, mi, 'markets.proc');
    // Regime transition.
    const row = pr.transition[p.regime];
    const u = rng.next();
    p.regime = u < row[0] ? 0 : u < row[0] + row[1] ? 1 : 2;
    // Inflation drifts slowly; re-sampled each January.
    if (monthOf(mi) === 1) p.inflation = Math.max(-0.01, PROCEDURAL_INFLATION.mean + PROCEDURAL_INFLATION.sd * rng.normal());
    p.cpi *= 1 + p.inflation / 12;
    const factors = {
      grain: PROCEDURAL_FACTORS.grain.sd * rng.normal() + pr.grainDrift[p.regime],
      energy: PROCEDURAL_FACTORS.energy.sd * rng.normal(),
      livestock: PROCEDURAL_FACTORS.livestock.sd * rng.normal(),
      fertilizer: 0,
    };
    factors.fertilizer = PROCEDURAL_FACTORS.fertilizer.sd * rng.normal()
      + PROCEDURAL_FACTORS.fertilizer.energyLoading * factors.energy
      + PROCEDURAL_FACTORS.fertilizer.grainLoading * factors.grain;
    const infl = Math.log(p.cpi / p.cpiRef);
    const idx = mi - PATH_START;
    // Weather for the year's yields, drawn each January.
    const yearRng = stream(path.seed, toMonthIndex(yearOf(mi), 1), 'markets.proc.yield');
    const drought = yearRng.chance(ECCB.weatherRisk.droughtProb.value);
    const yieldShock = drought ? -yearRng.range(0.15, 0.35) : 0.05 * yearRng.normal();

    for (const id of SERIES_IDS) {
      const d = MARKET_SERIES[id];
      const arr = path.values[id];
      const season = seasonLog(d);
      let v: number;
      if (d.kind === 'yield') {
        const tr = p.yieldTrend[id];
        v = Math.max(0, (tr.base + tr.slope * (yearOf(mi) - tr.baseYear)) * (1 + yieldShock));
      } else if (id === 'cpi') {
        v = p.cpi;
      } else if (id === 'constructionIndex' || id === 'landValue') {
        p.level[id] += p.inflation / 12 + d.procedural.sd * rng.normal() + (id === 'landValue' ? 0.002 * factors.grain * 10 : 0);
        v = Math.exp(p.level[id]);
      } else if (isRate(d)) {
        const target = id === 'prime' ? PROCEDURAL_PRIME_MEAN.value : PROCEDURAL_PRIME_MEAN.value - 3;
        p.level[id] += d.procedural.reversion * (target - p.level[id]) + d.procedural.sd * rng.normal();
        v = Math.max(0, p.level[id]);
      } else {
        const mean = p.realMean[id] + (d.kind === 'price' ? infl : 0);
        const f = d.procedural.factor ? factors[d.procedural.factor] * (d.procedural.loading ?? 0) : 0;
        const idio = d.procedural.sd * Math.sqrt(Math.max(0, 1 - (d.procedural.loading ?? 0) ** 2)) * rng.normal();
        p.level[id] += d.procedural.reversion * (mean - p.level[id]) + f + idio;
        v = Math.exp(p.level[id] + season[monthOf(mi) - 1]);
      }
      arr[idx] = v;
    }
    p.lastMonth = mi;
  }
}

const CACHE = new Map<string, MarketPath>();
const CACHE_LIMIT = 8;

export function getMarketPath(seed: number, mode: HistoryMode, drift: DriftPlan): MarketPath {
  const key = `${seed}|${mode}|${hashValue(drift)}`;
  const hit = CACHE.get(key);
  if (hit) return hit;
  const values = {} as Record<SeriesId, number[]>;
  for (const id of SERIES_IDS) values[id] = buildHistorical(MARKET_SERIES[id], seed, mode, drift);
  const path: MarketPath = { key, values, proc: initProc(values), seed };
  if (CACHE.size >= CACHE_LIMIT) CACHE.delete(CACHE.keys().next().value as string);
  CACHE.set(key, path);
  return path;
}

/** Value of a series in a month (NaN if the series doesn't exist yet). Extends procedurally. */
export function marketValue(path: MarketPath, series: SeriesId, monthIndex: number): number {
  if (monthIndex > path.proc.lastMonth) extend(path, monthIndex + 11);
  const i = Math.max(0, monthIndex - PATH_START);
  return path.values[series][i];
}

/** Monthly values for a series between two months inclusive. */
export function marketRange(path: MarketPath, series: SeriesId, from: number, to: number): { monthIndex: number; value: number }[] {
  marketValue(path, series, to);
  const out: { monthIndex: number; value: number }[] = [];
  for (let mi = Math.max(from, PATH_START); mi <= to; mi++) out.push({ monthIndex: mi, value: path.values[series][mi - PATH_START] });
  return out;
}

/** Annual average of a series in a calendar year. */
export function annualAverage(path: MarketPath, series: SeriesId, year: number): number {
  let s = 0;
  for (let m = 1; m <= 12; m++) s += marketValue(path, series, toMonthIndex(year, m));
  return s / 12;
}
