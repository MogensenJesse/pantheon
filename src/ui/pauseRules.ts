// src/ui/pauseRules.ts — when the pause menu opens (pure: no DOM, node-runnable)
//
// While the mouse is locked the browser takes Esc to release the lock and the page never sees the key,
// so the menu opens when the lock is lost with no panel open (which also covers alt-tabbing away).
// Our own panels release the lock too, but they are already open by the time the browser reports it.
// With the mouse free, Esc reaches the page and opens the menu itself.

export interface PauseContext {
  /** The game is running (not loading, not on the start screen). */
  ready: boolean;
  /** Any panel, including the pause menu, is open. */
  panelOpen: boolean;
}

export function pauseOnLockChange(
  wasLocked: boolean,
  isLocked: boolean,
  ctx: PauseContext,
): boolean {
  return wasLocked && !isLocked && ctx.ready && !ctx.panelOpen;
}

export function pauseOnKey(key: string, isLocked: boolean, ctx: PauseContext): boolean {
  return key === 'Escape' && !isLocked && ctx.ready && !ctx.panelOpen;
}
