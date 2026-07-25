// src/dev/panelTickHooks.ts — DEV panel late-frame sync hooks (registered by panels, run from game tick)
type LateTickFn = () => void;

const lateTicks = new Set<LateTickFn>();

/** Register a DEV panel sync callback; returns disposer. */
export function registerDevPanelLateTick(fn: LateTickFn): () => void {
  lateTicks.add(fn);
  return () => {
    lateTicks.delete(fn);
  };
}

/** Run all registered panel late-frame syncs (DEV only). */
export function runDevPanelLateTicks(): void {
  if (!import.meta.env.DEV) return;
  for (const fn of lateTicks) fn();
}
