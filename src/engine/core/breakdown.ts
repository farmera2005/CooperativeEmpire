// "Why did this happen": every major number can carry an attribution tree.

export interface Breakdown {
  key: string;
  label: string;
  value: number;
  unit?: 'cents' | 'pct' | 'count' | 'bu' | 'ton' | 'gal' | 'score' | 'rate';
  note?: string;
  components?: Breakdown[];
}

export const bd = (key: string, label: string, value: number, components?: Breakdown[], note?: string, unit?: Breakdown['unit']): Breakdown => ({
  key,
  label,
  value,
  ...(unit ? { unit } : {}),
  ...(note ? { note } : {}),
  ...(components ? { components } : {}),
});
