import type { ReactNode } from 'react';
import { GLOSSARY_BY_ID } from '../../data/glossary';

/** A co-op term with a glossary tooltip. */
export function Term({ id, children }: { id: string; children?: ReactNode }) {
  const g = GLOSSARY_BY_ID[id];
  if (!g) return <>{children}</>;
  return (
    <span className="group relative cursor-help border-b border-dotted border-stone-500" tabIndex={0}>
      {children ?? g.term}
      <span role="tooltip" className="pointer-events-none absolute left-0 top-full z-50 mt-1 hidden w-72 rounded border border-stone-300 bg-white p-2 text-xs font-normal normal-case tracking-normal text-stone-700 shadow-lg group-hover:block group-focus:block">
        <b>{g.term}.</b> {g.text}
      </span>
    </span>
  );
}
