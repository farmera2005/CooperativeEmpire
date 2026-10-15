import { useEffect, useRef, useState } from 'react';
import type { Breakdown } from '../../engine/core/breakdown';
import { BreakdownView } from './BreakdownView';

/** A "why?" link that opens the number's breakdown in a popover (Esc or a click outside closes it). */
export function Why({ b }: { b: () => Breakdown }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', close);
    window.addEventListener('keydown', close);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('keydown', close);
    };
  }, [open]);
  return (
    <span ref={ref} className="relative">
      <button className="text-xs text-sky underline" aria-expanded={open} onClick={() => setOpen(!open)}>why?</button>
      {open && (
        <div role="dialog" aria-label="Why this number" className="absolute right-0 top-full z-50 mt-1 w-96 rounded border border-stone-300 bg-white p-3 text-left shadow-lg">
          <BreakdownView b={b()} />
        </div>
      )}
    </span>
  );
}
