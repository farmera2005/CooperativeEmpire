// Save schema migrations. Each entry upgrades a save from version N to N+1. Add one (with a
// fixture test) whenever SCHEMA_VERSION changes.

import { SCHEMA_VERSION, type GameState } from '../types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyState = any;

export const MIGRATIONS: Record<number, (s: AnyState) => AnyState> = {
  // 1: (s) => ({ ...s, schemaVersion: 2, newField: default }),
};

export interface SaveFile {
  format: 'ag-coop-tycoon-save';
  schemaVersion: number;
  savedAt: string;
  slotName: string;
  state: GameState;
}

export class SaveError extends Error {}

export function migrate(raw: AnyState): GameState {
  if (!raw || typeof raw !== 'object' || typeof raw.schemaVersion !== 'number') throw new SaveError('Not a game state');
  let s = raw;
  while (s.schemaVersion < SCHEMA_VERSION) {
    const step = MIGRATIONS[s.schemaVersion];
    if (!step) throw new SaveError(`No migration from schema ${s.schemaVersion}`);
    s = step(s);
  }
  if (s.schemaVersion > SCHEMA_VERSION) throw new SaveError(`Save is from a newer version (schema ${s.schemaVersion})`);
  return s as GameState;
}

export function toSaveFile(state: GameState, slotName: string, savedAt: string): SaveFile {
  return { format: 'ag-coop-tycoon-save', schemaVersion: state.schemaVersion, savedAt, slotName, state };
}

export function serializeSave(file: SaveFile): string {
  return JSON.stringify(file);
}

export function parseSave(text: string): SaveFile {
  let raw: AnyState;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SaveError('File is not valid JSON');
  }
  if (raw?.format !== 'ag-coop-tycoon-save') throw new SaveError('Not an Agricultural Cooperative Tycoon save file');
  return { ...raw, state: migrate(raw.state), schemaVersion: SCHEMA_VERSION };
}
