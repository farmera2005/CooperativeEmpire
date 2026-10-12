import { useState } from 'react';
import type { Breakdown } from '../../engine/core/breakdown';
import { money, num } from '../format';

const fmt = (b: Breakdown) => (b.unit === 'cents' ? money(b.value) : b.unit === 'pct' ? `${(b.value * 100).toFixed(1)}%` : num(b.value, 1));

/** "Why did this happen": an expandable attribution tree. */
export function BreakdownView({ b, depth = 0 }: { b: Breakdown; depth?: number }) {
  const [open, setOpen] = useState(depth < 1);
  const kids = b.components ?? [];
  return (
    <div className={depth ? 'ml-4' : ''}>
      <div className="flex items-baseline justify-between gap-4 border-b border-stone-100 py-0.5 text-sm">
        <button className={`text-left ${kids.length ? 'hover:underline' : 'cursor-default'} ${depth === 0 ? 'font-semibold' : ''}`} onClick={() => kids.length && setOpen(!open)}>
          {kids.length ? (open ? '▾ ' : '▸ ') : ''}{b.label}
        </button>
        <span className={`num ${b.value < 0 ? 'text-rust' : ''}`}>{fmt(b)}</span>
      </div>
      {b.note && open && <div className="ml-4 text-xs text-stone-500">{b.note}</div>}
      {open && kids.map((k) => <BreakdownView key={k.key} b={k} depth={depth + 1} />)}
    </div>
  );
}
