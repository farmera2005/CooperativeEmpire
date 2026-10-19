import { useEffect, useState } from 'react';

/** A number field that commits on Enter or when it loses focus, not on every keystroke. */
export function CommitNumber({ value, onCommit, min, max, step, className = 'input w-16', ariaLabel }: { value: number; onCommit: (v: number) => void; min?: number; max?: number; step?: number; className?: string; ariaLabel?: string }) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const commit = () => {
    const n = Number(text);
    if (text.trim() === '' || !Number.isFinite(n)) return setText(String(value));
    const v = Math.min(max ?? Infinity, Math.max(min ?? -Infinity, n));
    if (v !== value) onCommit(v);
    else setText(String(value));
  };
  return (
    <input className={className} type="number" min={min} max={max} step={step} value={text} aria-label={ariaLabel}
      onChange={(e) => setText(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
  );
}
