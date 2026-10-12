// Member and customer generation (DESIGN §7.2).

import { FEMALE_OPERATOR_SHARE, GIVEN_NAMES, SURNAMES } from '../../data/names';
import { CROPS, SPECIES, type CropId, type RegionDef, type SpeciesId } from '../../data/regions/eccb';
import { MEMBER_TRAITS, SETUP } from '../../data/tuning';
import { valueAt } from '../../data/types';
import { clamp } from '../core/math';
import { stream, type Rng } from '../core/rng';
import type { Member, Town } from '../types';
import { townFarmWeight } from '../world/territory';

export function personName(rng: Rng, birthYear: number, year: number, surname?: string): { name: string; female: boolean } {
  const female = rng.chance(valueAt(FEMALE_OPERATOR_SHARE.map((p) => ({ ...p, confidence: 'low' as const })), year));
  let bucket = GIVEN_NAMES[0];
  for (const g of GIVEN_NAMES) if (g.decade <= birthYear) bucket = g;
  const given = rng.pick(female ? bucket.female : bucket.male);
  return { name: `${given} ${surname ?? rng.pick(SURNAMES)}`, female };
}

export function sizeClassOf(acres: number, region: RegionDef): Member['sizeClass'] {
  const c = region.sizeClasses;
  return acres >= c.mega ? 'mega' : acres >= c.large ? 'large' : acres >= c.mid ? 'mid' : 'small';
}

export function cropSplit(rng: Rng, total: number, region: RegionDef, year: number): Record<CropId, number> {
  const raw = CROPS.map((c) => Math.max(0, valueAt(region.cropShares[c], year) * (1 + 0.25 * rng.normal())));
  const s = raw.reduce((a, b) => a + b, 0) || 1;
  const out = {} as Record<CropId, number>;
  CROPS.forEach((c, i) => (out[c] = Math.round((total * raw[i]) / s)));
  return out;
}

export function livestockFor(rng: Rng, acres: number, region: RegionDef, year: number): Record<SpeciesId, number> {
  const out = {} as Record<SpeciesId, number>;
  const mean = valueAt(region.meanFarmAcres, year);
  for (const sp of SPECIES) {
    const def = region.livestock.find((l) => l.species === sp)!;
    if (rng.chance(valueAt(def.farmShare, year))) {
      const head = valueAt(def.headPerFarm, year) * Math.exp(0.5 * rng.normal() - 0.125) * Math.sqrt(acres / mean);
      out[sp] = Math.max(1, Math.round(head));
    } else out[sp] = 0;
  }
  return out;
}

export function farmAcres(rng: Rng, region: RegionDef, year: number): number {
  const mean = valueAt(region.meanFarmAcres, year);
  const sigma = region.farmSizeSigma.value;
  const mu = Math.log(mean) - (sigma * sigma) / 2;
  return Math.round(clamp(Math.exp(mu + sigma * rng.normal()), 40, 12000));
}

export interface NewFarmArgs {
  rng: Rng;
  id: number;
  region: RegionDef;
  year: number;
  monthIndex: number;
  town: Town;
  kind: Member['kind'];
  birthYear: number;
  acresTotal: number;
  surname?: string;
}

export function newFarmRecord(a: NewFarmArgs): Member {
  const { rng, region, year } = a;
  const { name, female } = personName(rng, a.birthYear, year, a.surname);
  const acres = cropSplit(rng, a.acresTotal, region, year);
  const sizeClass = sizeClassOf(a.acresTotal, region);
  const [l0, l1] = MEMBER_TRAITS.loyalty.value;
  const [p0, p1] = MEMBER_TRAITS.priceSens.value;
  const [s0, s1] = MEMBER_TRAITS.serviceSens.value;
  const big = sizeClass === 'large' || sizeClass === 'mega';
  return {
    id: a.id, name, female, birthYear: a.birthYear, townId: a.town.id, districtId: a.town.districtId,
    kind: a.kind, status: 'active', joinedMonth: a.monthIndex,
    acres, livestock: livestockFor(rng, a.acresTotal, region, year), sizeClass,
    loyalty: rng.range(l0, l1),
    priceSens: clamp(rng.range(p0, p1) + (big ? MEMBER_TRAITS.largeFarmPriceSensBonus.value : 0), 0, 1),
    serviceSens: rng.range(s0, s1),
    creditNeed: rng.range(0.1, 0.5),
    satisfaction: MEMBER_TRAITS.initialSatisfaction.value,
    grievances: [], relationship: {}, isDirector: false, weight: 1, share: {}, ytd: {},
  };
}

export function generateMembers(seed: number, towns: Town[], region: RegionDef, year: number, monthIndex: number, count: number): Member[] {
  const rng = stream(seed, -1, 'members.generate');
  const ageMean = valueAt(region.operatorAgeMean, year);
  const ageSd = region.operatorAgeSd.value;
  const out: Member[] = [];
  const nonMembers = Math.round(count * SETUP.nonMemberShare.value);
  for (let i = 0; i < count + nonMembers; i++) {
    const kind: Member['kind'] = i < count ? 'member' : 'nonmember';
    const town = rng.weighted(towns, (t) => townFarmWeight(t) * (kind === 'nonmember' && t.onHighway ? 1.5 : 1));
    const age = Math.round(clamp(rng.normal(ageMean, ageSd), 22, 85));
    out.push(newFarmRecord({ rng, id: i + 1, region, year, monthIndex, town, kind, birthYear: year - age, acresTotal: farmAcres(rng, region, year) }));
  }
  return out;
}

export const totalAcres = (m: Member): number => m.acres.corn + m.acres.soybeans + m.acres.wheat + m.acres.other;
