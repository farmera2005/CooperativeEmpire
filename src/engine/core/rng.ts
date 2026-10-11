// Deterministic random numbers. Every draw in the engine comes from a named substream so
// that adding a draw in one system never perturbs another system's sequence (D-004).

export interface Rng {
  /** Uniform in [0, 1). */
  next(): number;
  /** Integer in [min, max] inclusive. */
  int(min: number, max: number): number;
  /** Uniform in [min, max). */
  range(min: number, max: number): number;
  chance(p: number): boolean;
  /** Standard normal via Box-Muller. */
  normal(mean?: number, sd?: number): number;
  /** Triangular distribution on [min, max] with the given mode. */
  triangular(min: number, mode: number, max: number): number;
  pick<T>(items: readonly T[]): T;
  weighted<T>(items: readonly T[], weight: (item: T) => number): T;
  shuffle<T>(items: T[]): T[];
}

/** cyrb128 string hash → four 32-bit seeds. */
export function hash128(str: string): [number, number, number, number] {
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;
  for (let i = 0; i < str.length; i++) {
    const k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4;
  h2 ^= h1;
  h3 ^= h1;
  h4 ^= h1;
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}

function sfc32(a: number, b: number, c: number, d: number): () => number {
  return () => {
    a >>>= 0;
    b >>>= 0;
    c >>>= 0;
    d >>>= 0;
    let t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    t = (t + d) | 0;
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
}

export function makeRng(seedString: string): Rng {
  const [a, b, c, d] = hash128(seedString);
  const raw = sfc32(a, b, c, d);
  // Warm up: sfc32 needs a few rounds to mix weak seeds.
  for (let i = 0; i < 12; i++) raw();
  let spare: number | null = null;
  const rng: Rng = {
    next: raw,
    int: (min, max) => min + Math.floor(raw() * (max - min + 1)),
    range: (min, max) => min + raw() * (max - min),
    chance: (p) => raw() < p,
    normal: (mean = 0, sd = 1) => {
      if (spare !== null) {
        const s = spare;
        spare = null;
        return mean + sd * s;
      }
      let u = 0;
      while (u === 0) u = raw();
      const v = raw();
      const mag = Math.sqrt(-2 * Math.log(u));
      spare = mag * Math.sin(2 * Math.PI * v);
      return mean + sd * mag * Math.cos(2 * Math.PI * v);
    },
    triangular: (min, mode, max) => {
      const u = raw();
      const f = (mode - min) / (max - min);
      return u < f
        ? min + Math.sqrt(u * (max - min) * (mode - min))
        : max - Math.sqrt((1 - u) * (max - min) * (max - mode));
    },
    pick: (items) => items[Math.floor(raw() * items.length)],
    weighted: (items, weight) => {
      let total = 0;
      for (const it of items) total += Math.max(0, weight(it));
      let r = raw() * total;
      for (const it of items) {
        r -= Math.max(0, weight(it));
        if (r < 0) return it;
      }
      return items[items.length - 1];
    },
    shuffle: (items) => {
      for (let i = items.length - 1; i > 0; i--) {
        const j = Math.floor(raw() * (i + 1));
        const t = items[i];
        items[i] = items[j];
        items[j] = t;
      }
      return items;
    },
  };
  return rng;
}

/**
 * A named substream. `monthIndex` scopes it to a month (use -1 for setup-time streams),
 * `entity` scopes it to an entity when draws per entity must be independent.
 */
export function stream(seed: number, monthIndex: number, name: string, entity: number | string = 0): Rng {
  return makeRng(`${seed}|${monthIndex}|${name}|${entity}`);
}
