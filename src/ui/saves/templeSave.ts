// src/ui/saves/templeSave.ts — "Press E to save" near the temple
//
// A hint fades in when the orb is close to the temple and a key press there opens the save list. The
// check runs a few times a second, not every frame; it hides while any panel is open.

import { createHint, isPanelOpen, keycap, registerHotkey } from '../kit';

export interface TempleSaveDeps {
  /** Where the orb is. */
  playerPosition: () => { x: number; z: number };
  /** The temple's centre and how far from it counts as "at the temple" (m). */
  temple: { x: number; z: number; reachM: number };
  openSavePanel: () => void;
}

const CHECK_MS = 250;

export function initTempleSave(deps: TempleSaveDeps): () => void {
  const hint = createHint(['Press ', keycap('E'), ' to save']);

  const isNear = () => {
    const p = deps.playerPosition();
    return Math.hypot(p.x - deps.temple.x, p.z - deps.temple.z) <= deps.temple.reachM;
  };

  const timer = window.setInterval(() => {
    hint.show(isNear() && !isPanelOpen());
  }, CHECK_MS);

  const offKey = registerHotkey(
    'KeyE',
    () => {
      if (isNear()) deps.openSavePanel();
    },
    'Save at the temple',
    { whenPanelOpen: false },
  );

  return () => {
    window.clearInterval(timer);
    offKey();
    hint.dispose();
  };
}
