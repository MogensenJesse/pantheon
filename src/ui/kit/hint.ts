// src/ui/kit/hint.ts — a one-line hint in the HUD's hint slot, shown and hidden with the kit's fade

import { type Child, h } from './dom';
import { getHudSlot } from './layers';
import { type ContextualHud, createContextualHud } from './visibility';

export interface Hint {
  readonly element: HTMLParagraphElement;
  readonly hud: ContextualHud;
  /** Show it for as long as it matters, or hide it. */
  show: (on: boolean) => void;
  dispose: () => void;
}

/** The key cap in a hint: `Press <B> to survey`. */
export const keycap = (label: string): HTMLSpanElement =>
  h('span', { class: 'k-keycap', text: label });

/** A hint made of `content` (text and key caps), hidden until `show(true)`. */
export function createHint(content: readonly Child[], options: { accent?: boolean } = {}): Hint {
  const element = h(
    'p',
    { class: options.accent ? 'k-hint k-hint--accent' : 'k-hint' },
    ...content,
  );
  getHudSlot('hints').appendChild(element);
  const hud = createContextualHud(element, { base: 'hidden' });
  return {
    element,
    hud,
    show: (on) => hud.setBase(on ? 'persistent' : 'hidden'),
    dispose: () => {
      hud.dispose();
      element.remove();
    },
  };
}
