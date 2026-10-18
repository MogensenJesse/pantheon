// src/ui/saves/startScreen.ts — the first thing a player sees: Continue, Load, New game, Settings
//
// It sits in the overlay layer, so the kit's panels (the slot list, the new-game question, Settings)
// open above it. It answers with the save request the rest of the boot follows (save/saveRequest.ts).

import type { SaveRequest } from '../../save/saveRequest';
import { newestFirst, type SlotId, type SlotMeta } from '../../save/slots';
import { describeSlot } from '../../save/slotView';
import { button, getLayer, h, openConfirmPanel, openSettingsPanel } from '../kit';
import { openSlotPanel } from './slotPanel';

export interface StartScreenOptions {
  /** Rejects when the browser's storage cannot be read. */
  listSlots: () => Promise<readonly SlotMeta[]>;
  deleteSlot: (id: SlotId) => Promise<void>;
  now?: () => number;
}

const LEAVE_MS = 700;

export function showStartScreen(o: StartScreenOptions): Promise<SaveRequest> {
  const now = o.now ?? Date.now;
  return new Promise((resolve) => {
    let metas: readonly SlotMeta[] = [];
    let storageOk = true;

    const note = h('p', { class: 'sv-note', attrs: { 'aria-live': 'polite' } });

    const finish = (request: SaveRequest) => {
      screen.classList.add('is-leaving');
      window.setTimeout(() => screen.remove(), LEAVE_MS);
      resolve(request);
    };

    const continueButton = button('Continue', () => finish({ autosave: true, load: 'latest' }));
    const loadButton = button('Load game', () => {
      openSlotPanel({
        mode: 'load',
        listSlots: o.listSlots,
        onDelete: o.deleteSlot,
        onChoose: (id) => {
          finish({ autosave: true, load: id });
          return true;
        },
        now,
      });
    });
    const newButton = button('New game', () => {
      if (metas.length === 0) {
        finish({ autosave: storageOk, load: null });
        return;
      }
      openConfirmPanel({
        id: 'new-game',
        title: 'New game',
        text: 'Start over? Your autosaves are replaced as you play. Saves in numbered slots are kept.',
        action: 'Start a new game',
        onConfirm: () => finish({ autosave: true, load: null }),
      });
    });
    const settingsButton = button('Settings', () => openSettingsPanel());

    const screen = h(
      'section',
      { class: 'sv-screen', attrs: { 'aria-label': 'Pantheon' } },
      h('h1', { class: 'sv-title', text: 'Pantheon' }),
      h('nav', { class: 'sv-menu' }, continueButton, loadButton, newButton, settingsButton),
      note,
    );
    continueButton.disabled = true;
    loadButton.disabled = true;
    getLayer('overlay').appendChild(screen);
    newButton.focus({ preventScroll: true });

    o.listSlots().then(
      (list) => {
        metas = list;
        const latest = newestFirst(list)[0];
        continueButton.disabled = !latest;
        loadButton.disabled = list.length === 0;
        if (latest) {
          const { title, detail } = describeSlot(latest, now());
          note.textContent = `${title} · ${detail}`;
          continueButton.focus({ preventScroll: true });
        }
      },
      () => {
        storageOk = false;
        note.textContent =
          'This browser is not letting the game keep saves. You can still play, but nothing will be kept.';
      },
    );
  });
}
