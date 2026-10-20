// src/ui/kit/notifyQueue.ts — the notification queue's rules (pure: no DOM, node-runnable)
//
// At most `maxVisible` notifications show at once; the rest wait, highest priority first, then oldest.
// A notification with the same key as one already visible or waiting is merged into it (a counter goes
// up, the timer restarts) instead of piling up. `durationMs: 0` makes one sticky until dismissed.

export type NotifyKind = 'info' | 'success' | 'warning' | 'danger';

export interface NotifyInput {
  /** Merge key. Default: kind and text. */
  key?: string;
  text: string;
  kind?: NotifyKind;
  /** Higher shows first when several wait. Default 0. */
  priority?: number;
  /** How long it stays once visible; 0 is sticky. Default by kind. */
  durationMs?: number;
}

export interface NotifyItem {
  id: number;
  key: string;
  text: string;
  kind: NotifyKind;
  priority: number;
  durationMs: number;
  /** How many pushes were merged into this one (1 for a single push). */
  count: number;
  /** When it leaves; null while waiting, Infinity while sticky. */
  expiresAt: number | null;
}

const DEFAULT_DURATION_MS: Readonly<Record<NotifyKind, number>> = {
  info: 4000,
  success: 3000,
  warning: 6000,
  danger: 8000,
};

export interface NotifyQueue {
  /** Adds or merges a notification; returns its id. */
  push: (input: NotifyInput) => number;
  dismiss: (id: number) => boolean;
  /** Expires finished notifications and promotes waiting ones. */
  tick: () => void;
  visible: () => readonly NotifyItem[];
  waiting: () => number;
  /** Goes up on every change, so a renderer can skip work when nothing happened. */
  version: () => number;
}

export interface NotifyQueueOptions {
  maxVisible?: number;
  now: () => number;
}

export function createNotifyQueue(options: NotifyQueueOptions): NotifyQueue {
  const maxVisible = options.maxVisible ?? 3;
  const { now } = options;
  const shown: NotifyItem[] = [];
  const queued: NotifyItem[] = [];
  let nextId = 1;
  let version = 0;

  const expiry = (item: NotifyItem): number =>
    item.durationMs === 0 ? Number.POSITIVE_INFINITY : now() + item.durationMs;

  const promote = () => {
    while (shown.length < maxVisible && queued.length > 0) {
      let best = 0;
      for (let i = 1; i < queued.length; i++) {
        if (queued[i]!.priority > queued[best]!.priority) best = i;
      }
      const [item] = queued.splice(best, 1);
      item!.expiresAt = expiry(item!);
      shown.push(item!);
      version++;
    }
  };

  return {
    push: (input) => {
      const kind = input.kind ?? 'info';
      const key = input.key ?? `${kind}:${input.text}`;
      const existing = shown.find((n) => n.key === key) ?? queued.find((n) => n.key === key);
      if (existing) {
        existing.count++;
        existing.text = input.text;
        existing.priority = Math.max(existing.priority, input.priority ?? 0);
        if (existing.expiresAt !== null) existing.expiresAt = expiry(existing);
        version++;
        return existing.id;
      }
      const item: NotifyItem = {
        id: nextId++,
        key,
        text: input.text,
        kind,
        priority: input.priority ?? 0,
        durationMs: input.durationMs ?? DEFAULT_DURATION_MS[kind],
        count: 1,
        expiresAt: null,
      };
      queued.push(item);
      version++;
      promote();
      return item.id;
    },
    dismiss: (id) => {
      for (const list of [shown, queued]) {
        const index = list.findIndex((n) => n.id === id);
        if (index >= 0) {
          list.splice(index, 1);
          version++;
          promote();
          return true;
        }
      }
      return false;
    },
    tick: () => {
      const t = now();
      for (let i = shown.length - 1; i >= 0; i--) {
        if (shown[i]!.expiresAt! <= t) {
          shown.splice(i, 1);
          version++;
        }
      }
      promote();
    },
    visible: () => shown,
    waiting: () => queued.length,
    version: () => version,
  };
}
