// src/world/village/villageDevState.ts — DEV live village controls (inert defaults outside DEV)

export const villageDevState = {
  /** Village time per real second; fixed-step sub-stepping keeps big values stable. */
  timeScale: 1,
  /** Treat the orb as perceivable even in Phase 0, so presence boosts faith. */
  forcePresence: false,
  /** Run the village on this day-cycle phase (0 midnight, 0.25 sunrise, 0.75 sunset); null follows the sun. */
  forceDayPhase: null as number | null,
  /** Rain 0..1 forced on the weather everywhere (DEV only); null follows the weather. Set it with `forceRain`. */
  rain01: null as number | null,
};

/** Forces the rain (clamped to 0..1), or lets the weather decide again with null. */
export function forceRain(rain01: number | null): void {
  villageDevState.rain01 = rain01 === null ? null : Math.max(0, Math.min(1, rain01));
}

export function getVillageTimeScale(): number {
  return import.meta.env.DEV ? villageDevState.timeScale : 1;
}

/** The phase the village runs on: the forced one in DEV, else `sunPhase`. */
export function villageDayPhase(sunPhase: number): number {
  return import.meta.env.DEV && villageDevState.forceDayPhase !== null
    ? villageDevState.forceDayPhase
    : sunPhase;
}

/** The rain the village sees: the weather's, or the DEV value when one is forced. */
export function villageRain01(weatherRain: number): number {
  return import.meta.env.DEV && villageDevState.rain01 !== null
    ? villageDevState.rain01
    : weatherRain;
}

export function isVillagePresenceForced(): boolean {
  return import.meta.env.DEV && villageDevState.forcePresence;
}
