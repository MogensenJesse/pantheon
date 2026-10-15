// src/ui/kit/notify.ts — toasts for saves, orb respawns, deaths, quest updates
//
// The rules (at most 3 visible, priorities, duplicates merged into a counter) live in notifyQueue.ts.
// This file draws them: a polite live region for screen readers, with danger toasts announced at once.

import { h } from './dom';
import { type IconName, icon } from './icons';
import { getLayer } from './layers';
import {
  createNotifyQueue,
  type NotifyInput,
  type NotifyItem,
  type NotifyKind,
} from './notifyQueue';

export type { NotifyInput, NotifyKind } from './notifyQueue';

const KIND_ICON: Record<NotifyKind, IconName> = {
  info: 'info',
  success: 'check',
  warning: 'warning',
  danger: 'warning',
};
/** Said before the text, so the kind never depends on colour or icon alone. */
const KIND_LABEL: Record<NotifyKind, string> = {
  info: 'Notice',
  success: 'Done',
  warning: 'Warning',
  danger: 'Alert',
};
const TICK_MS = 250;
const LEAVE_MS = 200;

let queue = createNotifyQueue({ now: () => performance.now() });
let container: HTMLDivElement | null = null;
const elements = new Map<number, HTMLElement>();
let timer: number | undefined;
let renderedVersion = -1;

function ensureContainer(): HTMLDivElement {
  if (container) return container;
  container = h('div', {
    class: 'k-toasts',
    attrs: { role: 'region', 'aria-label': 'Notifications', 'aria-live': 'polite' },
  });
  getLayer('toast').appendChild(container);
  return container;
}

function createToast(item: NotifyItem): HTMLElement {
  const sticky = item.durationMs === 0;
  return h(
    'div',
    {
      class: `k-toast k-toast--${item.kind}`,
      attrs: { role: item.kind === 'danger' ? 'alert' : 'status' },
    },
    icon(KIND_ICON[item.kind]),
    h('span', { class: 'k-sr-only', text: `${KIND_LABEL[item.kind]}: ` }),
    h('span', { class: 'k-toast__text' }),
    h('span', { class: 'k-toast__count' }),
    sticky &&
      h(
        'button',
        {
          class: 'k-icon-button k-toast__close',
          attrs: { type: 'button', 'aria-label': 'Dismiss' },
          on: { click: () => dismissNotification(item.id) },
        },
        icon('close'),
      ),
  );
}

function render(): void {
  const parent = ensureContainer();
  const items = queue.visible();
  const alive = new Set(items.map((i) => i.id));
  for (const [id, el] of elements) {
    if (alive.has(id)) continue;
    elements.delete(id);
    el.classList.add('is-leaving');
    window.setTimeout(() => el.remove(), LEAVE_MS);
  }
  for (const item of items) {
    let el = elements.get(item.id);
    if (!el) {
      el = createToast(item);
      elements.set(item.id, el);
      parent.appendChild(el);
    }
    el.querySelector('.k-toast__text')!.textContent = item.text;
    el.querySelector('.k-toast__count')!.textContent = item.count > 1 ? `×${item.count}` : '';
  }
  renderedVersion = queue.version();
}

function sync(): void {
  if (queue.version() !== renderedVersion) render();
  if (queue.visible().length === 0 && queue.waiting() === 0 && timer !== undefined) {
    window.clearInterval(timer);
    timer = undefined;
  }
}

export function notify(input: NotifyInput): number {
  const id = queue.push(input);
  sync();
  if (timer === undefined) {
    timer = window.setInterval(() => {
      queue.tick();
      sync();
    }, TICK_MS);
  }
  return id;
}

export function dismissNotification(id: number): void {
  queue.dismiss(id);
  sync();
}

export function disposeNotifications(): void {
  if (timer !== undefined) window.clearInterval(timer);
  timer = undefined;
  container?.remove();
  container = null;
  elements.clear();
  queue = createNotifyQueue({ now: () => performance.now() });
  renderedVersion = -1;
}
