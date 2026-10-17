// src/save/saveRequest.ts — whether this visit saves, and whether it continues a saved game
// (pure: no DOM, node-runnable)
//
// Until the start screen can protect a player's progress (M0b), saving is opt-in per visit, so a
// plain visit behaves as it always did and cannot overwrite a save by accident:
//   ?save              start a new game and autosave it
//   ?load=latest       continue the newest save (and autosave from there)
//   ?load=<slot>       continue one slot, e.g. ?load=manual-1
// M0b replaces this with the start screen's Continue, Load and New game.

import { isSlotId, type SlotId } from './slots.ts';

export interface SaveRequest {
  /** Autosave this visit (every few minutes, when the tab hides, on leaving). */
  autosave: boolean;
  /** What to continue, or null for a new game. */
  load: 'latest' | SlotId | null;
}

export function readSaveRequest(search: string): SaveRequest {
  const params = new URLSearchParams(search);
  const raw = params.get('load')?.trim().toLowerCase() ?? '';
  const load = raw === 'latest' ? 'latest' : isSlotId(raw) ? raw : null;
  return { autosave: load !== null || params.has('save'), load };
}
