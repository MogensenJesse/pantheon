// src/core/dayCount.ts — which game day the world clock is on (pure: node-runnable)

/** Game days played, from the world clock (a day is one turn of the sun). */
export function dayOf(elapsedSec: number, dayDurationSec: number): number {
  return dayDurationSec > 0 ? Math.floor(elapsedSec / dayDurationSec) + 1 : 1;
}
