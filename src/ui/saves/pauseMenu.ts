// src/ui/saves/pauseMenu.ts — the pause menu: Resume, Save, Load, Settings, Quit to start
//
// Opening it freezes the world; closing it (Resume, Esc, a click outside) lets time go on. The slot
// lists and Settings open above it, so closing one lands back on the menu. When it opens is decided by
// the rules in ui/pauseRules.ts.

import type { SlotId, SlotMeta } from '../../save/slots';
import { button, closePanel, h, isPanelOpen, openPanel, openSettingsPanel } from '../kit';
import { openSlotPanel } from './slotPanel';

const PANEL_ID = 'pause';

export interface PauseMenuDeps {
  listSlots: () => Promise<readonly SlotMeta[]>;
  deleteSlot: (id: SlotId) => Promise<void>;
  /** Opens the list of slots to save into. */
  openSavePanel: () => void;
  /** Leaves this page for the saved game in the slot. */
  loadSlot: (id: SlotId) => void;
  /** Saves, then leaves for the start screen; rejects (and stays) when the save fails. */
  quitToStart: () => Promise<void>;
}

export interface PauseMenu {
  open: () => void;
  close: () => void;
  isOpen: () => boolean;
}

export function createPauseMenu(deps: PauseMenuDeps): PauseMenu {
  const open = () => {
    if (isPanelOpen(PANEL_ID)) return;

    const quitButton = button('Quit to start', () => {
      quitButton.disabled = true;
      quitButton.textContent = 'Saving…';
      deps.quitToStart().catch(() => {
        quitButton.disabled = false;
        quitButton.textContent = 'Quit to start';
      });
    });
    const content = h(
      'div',
      { class: 'sv-stack' },
      button('Resume', () => closePanel(PANEL_ID)),
      button('Save game', deps.openSavePanel),
      button('Load game', () =>
        openSlotPanel({
          mode: 'load',
          listSlots: deps.listSlots,
          onDelete: deps.deleteSlot,
          confirm: {
            text: 'Load this save? Progress since your last save is lost.',
            action: 'Load',
          },
          onChoose: (id) => {
            deps.loadSlot(id);
            // The page is on its way out; keep the panel as it is, buttons off, until it goes.
            return 'leaving';
          },
        }),
      ),
      button('Settings', () => openSettingsPanel()),
      quitButton,
    );
    openPanel({ id: PANEL_ID, title: 'Paused', content, pausesWorld: true });
  };

  return {
    open,
    close: () => closePanel(PANEL_ID),
    isOpen: () => isPanelOpen(PANEL_ID),
  };
}
