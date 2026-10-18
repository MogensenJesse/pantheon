// src/world/village/villageDevState.ts — DEV live village controls (inert defaults outside DEV)

export const villageDevState = {
  /** Village time per real second; fixed-step sub-stepping keeps big values stable. */
  timeScale: 1,
  /** Treat the orb as perceivable even in Phase 0, so presence boosts faith. */
  forcePresence: false,
  /** Run the village on this day-cycle phase (0 midnight, 0.25 sunrise, 0.75 sunset); null follows the sun. */
  forceDayPhase: null as number | null,
};

export function getVillageTimeScale(): number {
  return import.meta.env.DEV ? villageDevState.timeScale : 1;
}

/** The phase the village runs on: the forced one in DEV, else `sunPhase`. */
export function villageDayPhase(sunPhase: number): number {
  return import.meta.env.DEV && villageDevState.forceDayPhase !== null
    ? villageDevState.forceDayPhase
    : sunPhase;
}

export function isVillagePresenceForced(): boolean {
  return import.meta.env.DEV && villageDevState.forcePresence;
}
