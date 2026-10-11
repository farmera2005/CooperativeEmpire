import type { ReactNode } from 'react';

export function Panel({ title, children, className = '', right }: { title?: ReactNode; children: ReactNode; className?: string; right?: ReactNode }) {
  return (
    <section className={`panel ${className}`}>
      {title && (
        <div className="flex items-center justify-between pr-3">
          <h2 className="panel-title">{title}</h2>
          {right}
        </div>
      )}
      <div className="p-3">{children}</div>
    </section>
  );
}

export function Stat({ label, value, sub, tone }: { label: ReactNode; value: ReactNode; sub?: ReactNode; tone?: 'good' | 'bad' | 'neutral' }) {
  const color = tone === 'good' ? 'text-field' : tone === 'bad' ? 'text-rust' : 'text-ink';
  return (
    <div className="panel px-3 py-2">
      <div className="text-xs uppercase tracking-wide text-stone-500">{label}</div>
      <div className={`num text-xl font-semibold ${color}`}>{value}</div>
      {sub && <div className="text-xs text-stone-500">{sub}</div>}
    </div>
  );
}
