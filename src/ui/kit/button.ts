// src/ui/kit/button.ts — the kit's text button

import { h } from './dom';

export interface ButtonOptions {
  /** Extra class names beside `k-button`. */
  class?: string;
  /** Spoken name when the text alone is not enough (an icon-like button). */
  ariaLabel?: string;
  disabled?: boolean;
}

export function button(
  text: string,
  onClick: () => void,
  options: ButtonOptions = {},
): HTMLButtonElement {
  return h('button', {
    class: options.class ? `k-button ${options.class}` : 'k-button',
    text,
    attrs: { type: 'button', 'aria-label': options.ariaLabel, disabled: options.disabled },
    on: { click: onClick },
  });
}
