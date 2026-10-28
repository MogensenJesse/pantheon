// src/dev/panelTickHooks.ts — DEV panel late-frame sync hooks (registered by panels, run from game tick)
type LateTickFn = () => void;

/** The elements a callback writes to; it runs while any of them is on screen (none given: always). */
const lateTicks = new Map<LateTickFn, readonly Element[]>();

/**
 * Register a DEV panel sync callback; returns disposer. Pass the `hosts` it writes to and it is skipped while
 * they sit in a hidden panel or a closed section.
 */
export function registerDevPanelLateTick(
  fn: LateTickFn,
  ...hosts: Array<Element | null | undefined>
): () => void {
  lateTicks.set(
    fn,
    hosts.filter((h): h is Element => h != null),
  );
  return () => {
    lateTicks.delete(fn);
  };
}

/** False when `el` or an ancestor is `hidden` or a closed `<details>` (reads properties only: no layout flush). */
function onScreen(el: Element): boolean {
  for (let n: Element | null = el; n; n = n.parentElement) {
    if ((n as HTMLElement).hidden) return false;
    if (n instanceof HTMLDetailsElement && !n.open) return false;
  }
  return true;
}

/** Run all registered panel late-frame syncs (DEV only). */
export function runDevPanelLateTicks(): void {
  if (!import.meta.env.DEV) return;
  for (const [fn, hosts] of lateTicks) {
    if (hosts.length === 0 || hosts.some(onScreen)) fn();
  }
}
