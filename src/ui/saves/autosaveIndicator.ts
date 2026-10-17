// src/ui/saves/autosaveIndicator.ts — a small "Saving" in the corner while a save is being written
//
// It stays at least a moment so a fast write is still seen, and it is announced politely to screen
// readers. Warnings and the "Game saved" toast are separate (the toast queue).

import { createContextualHud, getLayer, h, icon } from '../kit';

const MIN_VISIBLE_MS = 1200;

export interface AutosaveIndicator {
  /** A write began. */
  start: () => void;
  /** The write finished (or failed). */
  end: () => void;
  dispose: () => void;
}

export function createAutosaveIndicator(): AutosaveIndicator {
  const element = h(
    'p',
    { class: 'sv-saving', attrs: { role: 'status' } },
    icon('save'),
    h('span', { text: 'Saving' }),
  );
  getLayer('hud').appendChild(element);
  const hud = createContextualHud(element, { base: 'hidden' });
  let shownAt = 0;
  let timer: number | undefined;

  return {
    start: () => {
      window.clearTimeout(timer);
      timer = undefined;
      shownAt = performance.now();
      hud.setBase('persistent');
    },
    end: () => {
      const wait = Math.max(0, MIN_VISIBLE_MS - (performance.now() - shownAt));
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        timer = undefined;
        hud.setBase('hidden');
      }, wait);
    },
    dispose: () => {
      window.clearTimeout(timer);
      hud.dispose();
      element.remove();
    },
  };
}
