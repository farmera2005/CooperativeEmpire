// Monthly weather: workable field days per week, heating degree days, harvest moisture.

import { REGIONS } from '../../data/regions/eccb';
import { WEATHER } from '../../data/tuning';
import { monthOf, toMonthIndex, yearOf } from '../core/calendar';
import { clamp } from '../core/math';
import { stream } from '../core/rng';
import type { WeatherState } from '../types';

const SPRING = [3, 4, 5];
const FALL = [9, 10, 11];

export function yearFlags(seed: number, regionId: string, year: number): { wetSpring: boolean; wetFall: boolean } {
  const region = REGIONS[regionId];
  const rng = stream(seed, toMonthIndex(year, 1), 'weather.year');
  return { wetSpring: rng.chance(region.weatherRisk.wetSpringProb.value), wetFall: rng.chance(region.weatherRisk.wetFallProb.value) };
}

export function weatherFor(seed: number, regionId: string, mi: number): WeatherState {
  const region = REGIONS[regionId];
  const m = monthOf(mi);
  const { wetSpring, wetFall } = yearFlags(seed, regionId, yearOf(mi));
  const rng = stream(seed, mi, 'weather.month');
  const wet = (wetSpring && SPRING.includes(m)) || (wetFall && FALL.includes(m));
  const normal = region.fieldDaysPerWeek.value[m - 1];
  const factor = wet ? WEATHER.wetSeasonFieldDayFactor.value : 1;
  const fieldDays = [0, 1, 2, 3].map(() => Math.round(clamp(normal * factor + WEATHER.fieldDayNoiseSd.value * rng.normal(), 0, 7) * 10) / 10);
  const hddNormal = region.hddNormals.value[m - 1];
  const hdd = Math.max(0, Math.round(hddNormal * (1 + WEATHER.hddNoiseSd.value * rng.normal())));
  const harvestMoisture = wetFall ? WEATHER.harvestMoistureWet.value : WEATHER.harvestMoistureNormal.value;
  return { fieldDays, hdd, hddNormal, wetSpring, wetFall, harvestMoisture };
}
