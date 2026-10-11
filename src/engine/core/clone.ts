// Deep clone for plain-data game state (D-003). Arrays and plain objects are copied;
// primitives are shared. Paths listed in `shallow` are copied one level only because they
// are append-only histories whose existing elements are never mutated.

export function deepClone<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) {
    const out = new Array(value.length);
    for (let i = 0; i < value.length; i++) out[i] = deepClone(value[i]);
    return out as T;
  }
  const out: Record<string, unknown> = {};
  for (const k in value as Record<string, unknown>) out[k] = deepClone((value as Record<string, unknown>)[k]);
  return out as T;
}
