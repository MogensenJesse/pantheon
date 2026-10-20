// src/ui/skills/skillUi.ts — how the skill tree reaches the player: a key, a hint, and the first opening
//
// `T` opens the panel once the tree exists. A quiet line ("2 sparks to spend · T") shows while sparks are
// unspent. The first time, the panel opens by itself, but only after the Aethon memory has been shown,
// so it never covers the story.

import { PHASE0 } from '../../config/phase0';
import { createDisposer } from '../../core/disposer';
import { bus } from '../../core/EventBus';
import type { SkillsState, UnlockCheck } from '../../skills/skillTree';
import { sparksLabel } from '../../skills/skillView';
import {
  closePanel,
  createHint,
  h,
  icon,
  isPanelOpen,
  keycap,
  notify,
  onPanelsChanged,
  registerHotkey,
} from '../kit';
import { openSkillPanel, SKILL_PANEL_ID } from './skillPanel';

export interface SkillUiDeps {
  state: () => SkillsState;
  unlock: (id: string) => UnlockCheck;
  respec: () => void;
}

/** Open anyway this long after the tree opened, if the memory never reports it has finished. */
const OPEN_FALLBACK_MS = 20_000;

export function initSkillUi(deps: SkillUiDeps): () => void {
  const off = createDisposer();
  off.add(bus.on('skills:changed', () => updateHint(true)));

  const open = () => {
    if (!deps.state().opened || isPanelOpen()) return;
    openSkillPanel(deps);
  };
  off.add(registerHotkey('KeyT', open, 'Skill tree', { whenPanelOpen: false }));

  // --- the hint ---
  const text = h('span', {});
  const hint = createHint([icon('spark'), text, keycap('T')], { accent: true });
  off.add(hint.dispose);
  const updateHint = (peek: boolean) => {
    const { opened, sparks } = deps.state();
    const show = opened && sparks > 0 && !isPanelOpen();
    text.textContent = ` ${sparksLabel(sparks)} to spend `;
    hint.show(show);
    if (show && peek) hint.hud.peek();
  };
  updateHint(false);

  // --- the first opening ---
  let waiting = false;
  let fallback: number | undefined;
  const openWhenFree = () => {
    if (!isPanelOpen()) {
      waiting = false;
      open();
      return;
    }
    // Another panel is open (the pause menu, say): wait for it to close.
    waiting = true;
  };
  // The hint hides while a panel is open; a first opening that had to wait goes ahead once it is free.
  off.add(
    onPanelsChanged(() => {
      updateHint(false);
      if (waiting && !isPanelOpen()) openWhenFree();
    }),
  );
  // Arch II opens by itself as the village earns faith: say so once.
  off.add(
    bus.on('skills:villageOpened', ({ sparks }) =>
      notify({
        text: `The Village opens in the skill tree (${sparksLabel(sparks)} to spend).`,
        kind: 'info',
        key: 'village-opened',
      }),
    ),
  );
  off.add(
    bus.on('skills:opened', () => {
      window.clearTimeout(fallback);
      fallback = window.setTimeout(() => {
        // Spent: the memory ending later must not open the tree a second time.
        fallback = undefined;
        openWhenFree();
      }, OPEN_FALLBACK_MS);
    }),
  );
  off.add(
    bus.on('story:fragmentEnded', ({ id }) => {
      if (id !== PHASE0.AETHON_MEMORY_ID || fallback === undefined) return;
      window.clearTimeout(fallback);
      fallback = undefined;
      openWhenFree();
    }),
  );

  return () => {
    window.clearTimeout(fallback);
    closePanel(SKILL_PANEL_ID);
    off.dispose();
  };
}
