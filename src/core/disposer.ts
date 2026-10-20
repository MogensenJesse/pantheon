// src/core/disposer.ts — collects the "undo" functions of listeners and timers, and runs them together

export interface Disposer {
  /** Keeps `off` to run at `dispose`; returns it, so it can still be called early. */
  add: <T extends () => void>(off: T) => T;
  /** Runs everything added, last first. */
  dispose: () => void;
}

export function createDisposer(): Disposer {
  const offs: (() => void)[] = [];
  return {
    add: (off) => {
      offs.push(off);
      return off;
    },
    dispose: () => {
      while (offs.length > 0) offs.pop()?.();
    },
  };
}
