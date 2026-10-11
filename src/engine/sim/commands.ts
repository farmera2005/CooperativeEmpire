// Player commands (DESIGN §18.2). Each is applied by applyCommand, purely and
// deterministically. The list grows milestone by milestone.

import { cloneState } from './clone';
import type { GameState } from '../types';

export type Command =
  | { type: 'markInboxRead'; id: number }
  | { type: 'markAllInboxRead' }
  | { type: 'renameCoop'; name: string };

export interface CommandMessage {
  level: 'info' | 'warning' | 'error';
  text: string;
}

export interface CommandResult {
  state: GameState;
  ok: boolean;
  messages: CommandMessage[];
}

export function applyCommand(state: GameState, cmd: Command): CommandResult {
  const s = cloneState(state);
  s.clock.commandsThisMonth += 1;
  switch (cmd.type) {
    case 'markInboxRead': {
      const item = s.inbox.find((i) => i.id === cmd.id);
      if (item) item.read = true;
      return { state: s, ok: true, messages: [] };
    }
    case 'markAllInboxRead':
      for (const i of s.inbox) i.read = true;
      return { state: s, ok: true, messages: [] };
    case 'renameCoop': {
      const name = cmd.name.trim();
      if (!name) return { state, ok: false, messages: [{ level: 'error', text: 'Name cannot be empty.' }] };
      s.coop.name = name;
      return { state: s, ok: true, messages: [] };
    }
  }
}
