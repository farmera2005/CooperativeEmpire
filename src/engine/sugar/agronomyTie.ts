// Beets' agronomy needs and the requirement that shareholders buy them from the co-op (D-148).
// Beets take less nitrogen than corn (too much lowers sugar content), several fungicide passes
// against Cercospora leaf spot, herbicides, and costly pelleted seed. A co-op that runs a beet
// factory and an agronomy business may require its shareholders to buy everything their beet
// acres need from it, as beet co-ops require approved seed bought through them.

import { BEET_INPUTS } from '../../data/sugar';
import { AGRONOMY_DEMAND } from '../../data/supply';
import { valueAt } from '../../data/types';
import type { LineId } from '../../data/supply';
import type { GameState, Member } from '../types';
import type { InputDemand } from '../world/farmEconomy';

/** The requirement is in force: the policy is set and we run a beet factory and an agronomy site. */
export function agronomyTieActive(s: GameState): boolean {
  if (!s.coop.sugarPolicy.agronomyTie) return false;
  const ops = s.coop.facilities.filter((f) => f.status === 'operating');
  return ops.some((f) => f.kind === 'sugarfactory') && ops.some((f) => f.division === 'AGRONOMY');
}

/** A grower the requirement binds: holds beet shares and grows beets this year. */
export const tiedGrower = (m: Member): boolean => m.status === 'active' && (m.beetShares ?? 0) > 0 && (m.beetAcres ?? 0) > 0;

/** A farm's yearly agronomy needs for its beet acres, in line units (as other crops' needs). */
export function beetAgronomyDemand(m: Member, year: number, inp: InputDemand, tied: boolean): Partial<Record<LineId, number>> {
  const acres = m.beetAcres ?? 0;
  if (acres <= 0) return {};
  const b = BEET_INPUTS;
  const ad = AGRONOMY_DEMAND;
  return {
    FERT_N: acres * b.nLbsPerAcre.value * ad.tonsPerLbN.value * inp.nRate,
    FERT_PK: acres * b.pkTonsPerAcre.value * inp.pk,
    CROP_PROTECTION: acres * b.cpPerAcre2024.value * valueAt(ad.cpRealIndex, year) * inp.cropProtection,
    // Tied growers buy all their seed through us; others buy part of it direct from seed companies.
    SEED: acres * b.seedPerAcre2024.value * valueAt(ad.seedRealIndex, year) * (tied ? 1 : b.seedRetailShare.value),
    APPLICATION: acres * valueAt(ad.customShare, year) * b.passesPerAcre.value,
  };
}

/** Beet acres the requirement binds now, and the growers. */
export function tiedBeetAcres(s: GameState): { acres: number; growers: number } {
  let acres = 0;
  let growers = 0;
  for (const m of s.members.list) if (tiedGrower(m)) {
    acres += (m.beetAcres ?? 0) * m.weight;
    growers += m.weight;
  }
  return { acres, growers };
}
