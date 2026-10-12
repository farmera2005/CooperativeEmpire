import { HEDGING } from '../../data/grain';
import type { GrainBook, GrainPolicy } from '../types';
import { emptyPosition } from './operate';

export function defaultGrainPolicy(): GrainPolicy {
  const lim = HEDGING.defaultPositionLimit.value;
  return {
    posture: 'market', hedgeRatio: 1, positionLimit: { corn: lim, soybeans: lim, wheat: lim },
    offerOpenStorage: true, offerDelayedPrice: true, offerForward: true, storageFee: 1, dryingFee: 1, carryAppetite: 'normal',
  };
}

export function emptyGrainBook(): GrainBook {
  return { pos: { corn: emptyPosition(), soybeans: emptyPosition(), wheat: emptyPosition() }, marginAccount: 0, basisNoise: { corn: 0, soybeans: 0, wheat: 0 }, report: null, reports: [] };
}
