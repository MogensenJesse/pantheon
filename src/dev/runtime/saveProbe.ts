// src/dev/runtime/saveProbe.ts — DEV console hook: window.__pantheonSave

import type { BootRestore } from '../../save/bootSave';
import type { Autosaver } from '../../save/gameSave';
import { startScreenUrl } from '../../save/saveRequest';
import type { SaveParts, SaveService } from '../../save/saveService';
import { isSlotId, SLOT_IDS } from '../../save/slots';
import type { PauseMenu } from '../../ui/saves/pauseMenu';
import { installDevHook } from './devHook';

export interface SaveProbeSources {
  service: SaveService;
  saver: Autosaver;
  capture: () => SaveParts;
  /** The save this visit continued, or null for a new game. */
  restored: BootRestore | null;
  /** Whether this visit autosaves (see `saveRequest.ts`). */
  autosaving: boolean;
  pauseMenu: PauseMenu;
}

/**
 * Install `window.__pantheonSave`: save, list and load from the console. Loading reloads the page
 * with `?load=` (the game boots from the save). Returns a disposer that removes the hook.
 */
export function initSaveProbe(src: SaveProbeSources): () => void {
  const reloadWith = (change: (params: URLSearchParams) => void) => {
    const url = new URL(window.location.href);
    change(url.searchParams);
    window.location.assign(url);
  };

  const removeHook = installDevHook('__pantheonSave', {
    /** Save into a slot (default manual-1). */
    save: (slot = 'manual-1') => {
      if (!isSlotId(slot)) throw new Error(`slot must be one of ${SLOT_IDS.join(', ')}`);
      return src.saver.saveNow(slot);
    },
    /** Write the older autosave slot now. */
    autosave: () => src.saver.saveNow(),
    list: () => src.service.list(),
    /** What a slot holds, as the game would load it ({ ok, snapshot } or why not). */
    read: (slot = 'manual-1') => {
      if (!isSlotId(slot)) throw new Error(`slot must be one of ${SLOT_IDS.join(', ')}`);
      return src.service.load(slot);
    },
    /** Reload continuing a slot, or the newest save ('latest'). */
    load: (slot = 'latest') => {
      if (slot !== 'latest' && !isSlotId(slot)) {
        throw new Error(`slot must be 'latest' or one of ${SLOT_IDS.join(', ')}`);
      }
      reloadWith((p) => p.set('load', slot));
    },
    /** Reload as a new game (autosaving into the rotating slots, as ?save does). */
    newGame: () =>
      reloadWith((p) => {
        p.delete('load');
        p.set('save', '');
      }),
    /** Open or close the pause menu (the world freezes while it is open). */
    pause: (open = true) => (open ? src.pauseMenu.open() : src.pauseMenu.close()),
    /** Reload to the start screen (a DEV plain visit skips it). */
    startScreen: () => window.location.assign(startScreenUrl(window.location.href)),
    /** Delete every slot. */
    wipe: async () => {
      for (const slot of SLOT_IDS) await src.service.remove(slot);
    },
    /** What a save would hold right now (nothing is written). */
    capture: src.capture,
    /** The save this visit started from, if any. */
    restored: () =>
      src.restored && {
        slot: src.restored.slot,
        playSeconds: src.restored.playSeconds,
        migratedFrom: src.restored.migratedFrom,
      },
    autosaving: src.autosaving,
  });

  return removeHook;
}
