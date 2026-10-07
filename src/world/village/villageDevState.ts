// src/world/village/villageDevState.ts — DEV live village controls (inert defaults outside DEV)

export const villageDevState = {
  /** Village time per real second; fixed-step sub-stepping keeps big values stable. */
  timeScale: 1,
  /** Treat the orb as perceivable even in Phase 0, so presence boosts faith. */
  forcePresence: false,
};

export function getVillageTimeScale(): number {
  return import.meta.env.DEV ? villageDevState.timeScale : 1;
}

export function isVillagePresenceForced(): boolean {
  return import.meta.env.DEV && villageDevState.forcePresence;
}
