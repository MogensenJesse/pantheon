// src/config/visual/shrineZone.ts — the ring drawn at the edge of a shrine's regeneration zone

export const shrineZone = {
  /** Ring colour, linear RGB (a pale lilac). */
  color: [0.71, 0.63, 0.86],
  ribbonWidthM: 0.45,
  /** Lifted this far (m) off the ground so it does not z-fight. */
  liftM: 0.18,
  /** Opacity with the orb outside the zone, and inside it (where energy returns). */
  baseOpacity: 0.2,
  activeOpacity: 0.55,
  /** Share of the way to the target brightness covered each fixed step. */
  brightenRate: 0.08,
  pulse: 0.12,
  pulseSpeed: 1.6,
} as const;
