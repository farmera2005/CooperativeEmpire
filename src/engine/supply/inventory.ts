// Inventory layers (FIFO) for position products: fertilizer and propane.

import { roundCents, type Cents } from '../core/money';
import type { InventoryLayer } from '../types';

export const layerQty = (layers: InventoryLayer[]): number => layers.reduce((a, l) => a + l.qty, 0);
export const layerCost = (layers: InventoryLayer[]): Cents => layers.reduce((a, l) => a + l.cost, 0);

/** Remove qty FIFO; returns the cost relieved. Mutates layers. */
export function relieve(layers: InventoryLayer[], qty: number): { qty: number; cost: Cents } {
  let left = qty;
  let cost = 0;
  let taken = 0;
  while (left > 1e-9 && layers.length) {
    const l = layers[0];
    if (l.qty <= left + 1e-9) {
      left -= l.qty;
      taken += l.qty;
      cost += l.cost;
      layers.shift();
    } else {
      const c = roundCents((l.cost * left) / l.qty);
      l.qty -= left;
      l.cost -= c;
      cost += c;
      taken += left;
      left = 0;
    }
  }
  return { qty: taken, cost };
}

/** Lower of cost or market: write layers down to replacement cost. Returns the write-down. */
export function lowerOfCostOrMarket(layers: InventoryLayer[], replacement: number): Cents {
  let wd = 0;
  for (const l of layers) {
    const market = roundCents(l.qty * replacement * 100);
    if (l.cost > market) {
      wd += l.cost - market;
      l.cost = market;
    }
  }
  return wd;
}
