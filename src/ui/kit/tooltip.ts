// src/ui/kit/tooltip.ts — one tooltip, three layers of detail
//
// Glance: the title. Hover: the body, after a short delay (a keyboard user gets it at once on focus).
// Inspect: a longer text while Shift is held. Esc hides it first; a second Esc closes the panel under it.

import { h } from './dom';
import { getLayer } from './layers';
import { placeTooltip } from './tooltipPlacement';

export interface TooltipContent {
  title: string;
  body?: string;
  /** Shown while Shift is held. */
  inspect?: string;
}

const SHOW_DELAY_MS = 300;
const TIP_ID = 'k-tooltip';

let tip: HTMLDivElement | null = null;
let titleEl: HTMLElement;
let bodyEl: HTMLElement;
let inspectEl: HTMLElement;
let hintEl: HTMLElement;
let activeTarget: HTMLElement | null = null;
let activeContent: TooltipContent | null = null;
let showTimer: number | undefined;

function ensureTip(): HTMLDivElement {
  if (tip) return tip;
  titleEl = h('div', { class: 'k-tooltip__title' });
  bodyEl = h('div', { class: 'k-tooltip__body' });
  inspectEl = h('div', { class: 'k-tooltip__inspect' });
  hintEl = h('div', { class: 'k-tooltip__hint', text: 'Hold Shift for details' });
  tip = h(
    'div',
    { class: 'k-tooltip', attrs: { id: TIP_ID, role: 'tooltip', hidden: true } },
    titleEl,
    bodyEl,
    inspectEl,
    hintEl,
  );
  getLayer('tooltip').appendChild(tip);
  return tip;
}

function position(): void {
  if (!tip || !activeTarget) return;
  const r = activeTarget.getBoundingClientRect();
  const p = placeTooltip(
    { left: r.left, top: r.top, width: r.width, height: r.height },
    { width: tip.offsetWidth, height: tip.offsetHeight },
    { width: window.innerWidth, height: window.innerHeight },
  );
  tip.style.left = `${p.x}px`;
  tip.style.top = `${p.y}px`;
  tip.dataset.side = p.side;
}

function showInspect(on: boolean): void {
  const has = Boolean(activeContent?.inspect);
  inspectEl.hidden = !(on && has);
  hintEl.hidden = on || !has;
  position();
}

function onModifier(e: KeyboardEvent): void {
  if (e.key === 'Shift') showInspect(e.type === 'keydown');
  else if (e.key === 'Escape' && e.type === 'keydown') {
    e.stopPropagation();
    hide();
  }
}

function show(target: HTMLElement, content: TooltipContent): void {
  const el = ensureTip();
  hide();
  activeTarget = target;
  activeContent = content;
  titleEl.textContent = content.title;
  bodyEl.textContent = content.body ?? '';
  bodyEl.hidden = !content.body;
  inspectEl.textContent = content.inspect ?? '';
  el.style.visibility = 'hidden';
  el.hidden = false;
  showInspect(false);
  el.style.visibility = '';
  target.setAttribute('aria-describedby', TIP_ID);
  window.addEventListener('keydown', onModifier, true);
  window.addEventListener('keyup', onModifier, true);
}

function hide(): void {
  window.clearTimeout(showTimer);
  showTimer = undefined;
  if (activeTarget) {
    activeTarget.removeAttribute('aria-describedby');
    window.removeEventListener('keydown', onModifier, true);
    window.removeEventListener('keyup', onModifier, true);
  }
  activeTarget = null;
  activeContent = null;
  if (tip) tip.hidden = true;
}

/** Shows `content` when `target` is hovered (after 300 ms) or keyboard-focused. Returns the detach function. */
export function attachTooltip(
  target: HTMLElement,
  content: TooltipContent | (() => TooltipContent),
): () => void {
  const resolve = () => (typeof content === 'function' ? content() : content);
  const onEnter = () => {
    window.clearTimeout(showTimer);
    showTimer = window.setTimeout(() => show(target, resolve()), SHOW_DELAY_MS);
  };
  const onFocus = () => {
    if (target.matches(':focus-visible')) show(target, resolve());
  };
  const onLeave = () => {
    if (activeTarget === target || showTimer !== undefined) hide();
  };
  target.addEventListener('pointerenter', onEnter);
  target.addEventListener('pointerleave', onLeave);
  target.addEventListener('pointerdown', onLeave);
  target.addEventListener('focus', onFocus);
  target.addEventListener('blur', onLeave);
  return () => {
    target.removeEventListener('pointerenter', onEnter);
    target.removeEventListener('pointerleave', onLeave);
    target.removeEventListener('pointerdown', onLeave);
    target.removeEventListener('focus', onFocus);
    target.removeEventListener('blur', onLeave);
    onLeave();
  };
}

export function disposeTooltip(): void {
  hide();
  tip?.remove();
  tip = null;
}
