// src/ui/skills/skillUi.ts — how the skill tree reaches the player: a key, a hint, and the first opening
//
// `T` opens the panel once the tree exists. A quiet line ("2 sparks to spend · T") shows while sparks are
// unspent. The first time, the panel opens by itself, but only after the Aethon memory has been shown,
// so it never covers the story.

import { PHASE0 } from '../../config/phase0';
import { bus } from '../../core/EventBus';
import type { SkillsState, UnlockCheck } from '../../skills/skillTree';
import { sparksLabel } from '../../skills/skillView';
import { createContextualHud, getLayer, h, icon, isPanelOpen, registerHotkey } from '../kit';
import { openSkillPanel } from './skillPanel';

export interface SkillUiDeps {
  state: () => SkillsState;
  unlock: (id: string) => UnlockCheck;
  respec: () => void;
  setPaused: (paused: boolean) => void;
}

/** Open anyway this long after the tree opened, if the memory never reports it has finished. */
const OPEN_FALLBACK_MS = 20_000;
const RETRY_MS = 500;

export function initSkillUi(deps: SkillUiDeps): () => void {
  const listeners = new Set<() => void>();
  const offChanged = bus.on('skills:changed', () => {
    for (const l of listeners) l();
    updateHint(true);
  });

  const open = () => {
    if (!deps.state().opened || isPanelOpen()) return;
    openSkillPanel({
      state: deps.state,
      unlock: deps.unlock,
      respec: deps.respec,
      setPaused: deps.setPaused,
      onChange: (l) => {
        listeners.add(l);
        return () => listeners.delete(l);
      },
    });
  };
  const offKey = registerHotkey('KeyT', open, 'Skill tree');

  // --- the hint ---
  const text = h('span', {});
  const hint = h(
    'p',
    { class: 'sk-spark-hint' },
    icon('spark'),
    text,
    h('span', { class: 'sv-key', text: 'T' }),
  );
  getLayer('hud').appendChild(hint);
  const hud = createContextualHud(hint, { base: 'hidden' });
  const updateHint = (peek: boolean) => {
    const { opened, sparks } = deps.state();
    const show = opened && sparks > 0 && !isPanelOpen();
    text.textContent = ` ${sparksLabel(sparks)} to spend `;
    hud.setBase(show ? 'persistent' : 'hidden');
    if (show && peek) hud.peek();
  };
  const hintTimer = window.setInterval(() => updateHint(false), 500);
  updateHint(false);

  // --- the first opening ---
  let pending: number | undefined;
  let fallback: number | undefined;
  const clearPending = () => {
    window.clearInterval(pending);
    window.clearTimeout(fallback);
    pending = undefined;
    fallback = undefined;
  };
  const openWhenFree = () => {
    if (!isPanelOpen()) {
      open();
      return;
    }
    // Another panel is open (the pause menu, say): wait for it to close.
    if (pending !== undefined) return;
    pending = window.setInterval(() => {
      if (isPanelOpen()) return;
      window.clearInterval(pending);
      pending = undefined;
      open();
    }, RETRY_MS);
  };
  const offOpened = bus.on('skills:opened', () => {
    window.clearTimeout(fallback);
    fallback = window.setTimeout(openWhenFree, OPEN_FALLBACK_MS);
  });
  const offMemory = bus.on('story:fragmentEnded', ({ id }) => {
    if (id !== PHASE0.AETHON_MEMORY_ID || fallback === undefined) return;
    window.clearTimeout(fallback);
    fallback = undefined;
    openWhenFree();
  });

  return () => {
    clearPending();
    window.clearInterval(hintTimer);
    offChanged();
    offOpened();
    offMemory();
    offKey();
    hud.dispose();
    hint.remove();
  };
}
