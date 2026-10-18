// src/ui/kit/panels.ts — panels, the modal backdrop, and who owns the mouse and the keyboard
//
// A modal panel dims the world, lets go of pointer lock and stops roam input (held movement keys are
// dropped), so the orb never moves from a click or a key meant for the panel. The backdrop swallows
// clicks, so the canvas cannot grab the mouse back until the last modal closes. Esc closes the top
// panel (while the mouse is locked the browser takes Esc first, to release it). Tab stays inside a
// modal, and closing returns focus to where it was.

import { setInputBlocked } from '../../core/InputManager';
import { h } from './dom';
import { icon } from './icons';
import { getLayer } from './layers';

export interface PanelOptions {
  id: string;
  title: string;
  content: HTMLElement;
  /** Dim the world and take input. Default true. */
  modal?: boolean;
  /** Close when the dimmed backdrop is clicked (modal only). Default true. */
  dismissOnBackdrop?: boolean;
  onClose?: () => void;
}

export interface PanelHandle {
  readonly id: string;
  readonly element: HTMLElement;
  close: () => void;
}

interface OpenPanel {
  id: string;
  element: HTMLElement;
  modal: boolean;
  dismissOnBackdrop: boolean;
  onClose?: () => void;
  previousFocus: Element | null;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

const stack: OpenPanel[] = [];
const changeListeners = new Set<() => void>();
let backdrop: HTMLDivElement | null = null;
let keysInstalled = false;

const modalCount = () => stack.filter((p) => p.modal).length;

function topPanel(): OpenPanel | undefined {
  for (let i = stack.length - 1; i >= 0; i--) if (stack[i]!.modal) return stack[i];
  return stack[stack.length - 1];
}

function ensureBackdrop(): HTMLDivElement {
  if (backdrop) return backdrop;
  backdrop = h('div', {
    class: 'k-backdrop',
    attrs: { hidden: true },
    on: {
      pointerdown: (e) => {
        if (e.target !== backdrop) return;
        const top = topPanel();
        if (top?.modal && top.dismissOnBackdrop) closePanel(top.id);
      },
    },
  });
  getLayer('modal').prepend(backdrop);
  return backdrop;
}

function takeInput(): void {
  if (document.pointerLockElement) document.exitPointerLock();
  setInputBlocked(true);
  ensureBackdrop().hidden = false;
}

function giveInputBack(): void {
  setInputBlocked(false);
  if (backdrop) backdrop.hidden = true;
}

function visibleFocusables(panel: HTMLElement): HTMLElement[] {
  return [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (el) => el.getClientRects().length > 0,
  );
}

function focusPanel(panel: HTMLElement): void {
  const first = visibleFocusables(panel.querySelector<HTMLElement>('.k-panel__body') ?? panel)[0];
  (first ?? panel).focus({ preventScroll: true });
}

function trapTab(e: KeyboardEvent, panel: HTMLElement): void {
  const items = visibleFocusables(panel);
  if (items.length === 0) {
    e.preventDefault();
    panel.focus({ preventScroll: true });
    return;
  }
  const first = items[0]!;
  const last = items[items.length - 1]!;
  const active = document.activeElement;
  if (!panel.contains(active)) {
    e.preventDefault();
    first.focus();
  } else if (e.shiftKey && (active === first || active === panel)) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && active === last) {
    e.preventDefault();
    first.focus();
  }
}

function onKeyDown(e: KeyboardEvent): void {
  const top = topPanel();
  if (!top) return;
  if (e.key === 'Escape') {
    e.preventDefault();
    e.stopPropagation();
    closePanel(top.id);
  } else if (e.key === 'Tab' && top.modal) {
    trapTab(e, top.element);
  }
}

function installKeys(): void {
  if (keysInstalled) return;
  // Capture phase, so an open panel sees Esc and Tab before any hotkey does.
  document.addEventListener('keydown', onKeyDown, true);
  keysInstalled = true;
}

function removeKeys(): void {
  if (!keysInstalled) return;
  document.removeEventListener('keydown', onKeyDown, true);
  keysInstalled = false;
}

function handleOf(entry: OpenPanel): PanelHandle {
  return { id: entry.id, element: entry.element, close: () => closePanel(entry.id) };
}

export function openPanel(options: PanelOptions): PanelHandle {
  const existing = stack.find((p) => p.id === options.id);
  if (existing) {
    // Already open: bring it to the front instead of opening a second copy.
    existing.element.parentElement?.appendChild(existing.element);
    focusPanel(existing.element);
    return handleOf(existing);
  }

  const modal = options.modal ?? true;
  const titleId = `k-panel-title-${options.id}`;
  const element = h(
    'section',
    {
      class: 'k-panel',
      attrs: {
        id: `k-panel-${options.id}`,
        role: 'dialog',
        'aria-modal': String(modal),
        'aria-labelledby': titleId,
        tabindex: -1,
      },
    },
    h(
      'header',
      { class: 'k-panel__head' },
      h('h2', { class: 'k-panel__title', attrs: { id: titleId }, text: options.title }),
      h(
        'button',
        {
          class: 'k-icon-button',
          attrs: { type: 'button', 'aria-label': 'Close' },
          on: { click: () => closePanel(options.id) },
        },
        icon('close'),
      ),
    ),
    h('div', { class: 'k-panel__body' }, options.content),
  );
  const entry: OpenPanel = {
    id: options.id,
    element,
    modal,
    dismissOnBackdrop: options.dismissOnBackdrop ?? true,
    onClose: options.onClose,
    previousFocus: document.activeElement,
  };
  if (modal && modalCount() === 0) takeInput();
  stack.push(entry);
  getLayer(modal ? 'modal' : 'panel').appendChild(element);
  installKeys();
  focusPanel(element);
  for (const listener of [...changeListeners]) listener();
  return handleOf(entry);
}

export function closePanel(id: string): void {
  const index = stack.findIndex((p) => p.id === id);
  if (index < 0) return;
  const [entry] = stack.splice(index, 1);
  entry!.element.remove();
  if (entry!.modal && modalCount() === 0) giveInputBack();
  if (entry!.previousFocus instanceof HTMLElement && entry!.previousFocus.isConnected) {
    entry!.previousFocus.focus({ preventScroll: true });
  }
  entry!.onClose?.();
  if (stack.length === 0) removeKeys();
  for (const listener of [...changeListeners]) listener();
}

/** Closes the top panel; false when none is open. */
export function closeTopPanel(): boolean {
  const top = topPanel();
  if (!top) return false;
  closePanel(top.id);
  return true;
}

/** Calls `listener` whenever a panel opens or closes; returns the unsubscribe. */
export function onPanelsChanged(listener: () => void): () => void {
  changeListeners.add(listener);
  return () => changeListeners.delete(listener);
}

export function isPanelOpen(id?: string): boolean {
  return id === undefined ? stack.length > 0 : stack.some((p) => p.id === id);
}

export function disposePanels(): void {
  while (closeTopPanel());
  changeListeners.clear();
  removeKeys();
  backdrop?.remove();
  backdrop = null;
  setInputBlocked(false);
}
