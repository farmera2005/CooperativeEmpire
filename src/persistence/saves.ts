// Browser persistence: IndexedDB slots (gzip-compressed JSON) and JSON file export/import.

import { createStore, del, get, keys, set } from 'idb-keyval';
import { formatMonth, parseSave, serializeSave, toSaveFile, type GameState, type SaveFile } from '../engine/index';

const store = createStore('ag-coop-tycoon', 'saves');
const AUTOSAVES_KEPT = 3;

export interface SlotMeta {
  id: string;
  name: string;
  coopName: string;
  monthIndex: number;
  dateLabel: string;
  savedAt: string;
  auto: boolean;
}

async function gzip(text: string): Promise<Blob> {
  const cs = new CompressionStream('gzip');
  const stream = new Blob([text]).stream().pipeThrough(cs);
  return await new Response(stream).blob();
}

async function gunzip(blob: Blob): Promise<string> {
  const ds = new DecompressionStream('gzip');
  return await new Response(blob.stream().pipeThrough(ds)).text();
}

export async function listSlots(): Promise<SlotMeta[]> {
  const all = (await keys(store)) as string[];
  const metas = await Promise.all(all.filter((k) => k.startsWith('meta:')).map((k) => get<SlotMeta>(k, store)));
  return metas.filter((m): m is SlotMeta => !!m).sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}

export async function saveSlot(state: GameState, name: string, auto = false): Promise<SlotMeta> {
  const savedAt = new Date().toISOString();
  const id = auto ? `auto-${state.clock.monthIndex}-${Date.now()}` : `slot-${name.replace(/[^\w -]/g, '').slice(0, 40) || 'save'}`;
  const file = toSaveFile(state, name, savedAt);
  const meta: SlotMeta = { id, name, coopName: state.coop.name, monthIndex: state.clock.monthIndex, dateLabel: formatMonth(state.clock.monthIndex), savedAt, auto };
  await set(`data:${id}`, await gzip(serializeSave(file)), store);
  await set(`meta:${id}`, meta, store);
  if (auto) {
    const autos = (await listSlots()).filter((m) => m.auto);
    for (const old of autos.slice(AUTOSAVES_KEPT)) await deleteSlot(old.id);
  }
  return meta;
}

export async function loadSlot(id: string): Promise<SaveFile> {
  const blob = await get<Blob>(`data:${id}`, store);
  if (!blob) throw new Error('Save not found');
  return parseSave(await gunzip(blob));
}

export async function deleteSlot(id: string): Promise<void> {
  await del(`data:${id}`, store);
  await del(`meta:${id}`, store);
}

export function exportSave(state: GameState, name: string): void {
  const text = serializeSave(toSaveFile(state, name, new Date().toISOString()));
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${state.coop.name.replace(/[^\w]+/g, '-')}-${formatMonth(state.clock.monthIndex).replace(' ', '-')}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function importSave(file: File): Promise<SaveFile> {
  return parseSave(await file.text());
}
