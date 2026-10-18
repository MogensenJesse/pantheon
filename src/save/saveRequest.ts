// src/save/saveRequest.ts — whether this visit saves, and whether it continues a saved game
// (pure: no DOM, node-runnable)
//
// A visit either carries an explicit request in its URL (used by menus that reload the page, by
// automation and by developers) or shows the start screen and lets the player choose:
//   ?new or ?save      start a new game and autosave it
//   ?load=latest       continue the newest save (and autosave from there)
//   ?load=<slot>       continue one slot, e.g. ?load=manual-1
//   ?start             show the start screen (in a DEV build a plain visit skips it, so reloading
//                      while developing stays as quick as it was and never writes a save)

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
  return { autosave: load !== null || params.has('save') || params.has('new'), load };
}

type Launch = { kind: 'request'; request: SaveRequest } | { kind: 'start' };

/** What this visit does first: follow the URL's request, or ask the player on the start screen. */
export function resolveLaunch(search: string, dev: boolean): Launch {
  const request = readSaveRequest(search);
  if (request.autosave) return { kind: 'request', request };
  if (new URLSearchParams(search).has('start')) return { kind: 'start' };
  return dev ? { kind: 'request', request } : { kind: 'start' };
}

/** The address of this page with the save request taken out and the start screen asked for. */
export function startScreenUrl(href: string): string {
  const url = new URL(href);
  for (const key of ['load', 'save', 'new']) url.searchParams.delete(key);
  url.searchParams.set('start', '');
  return url.toString();
}

/** The address of this page continuing a slot (or the newest save). */
export function loadUrl(href: string, slot: 'latest' | SlotId): string {
  const url = new URL(href);
  for (const key of ['save', 'new', 'start']) url.searchParams.delete(key);
  url.searchParams.set('load', slot);
  return url.toString();
}
