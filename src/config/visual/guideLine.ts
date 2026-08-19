// src/config/visual/guideLine.ts — faint path-following ribbon to the next energy orb

export const guideLine = {
  enabled: true,
  /** Ribbon width (m). */
  width: 0.02,
  /** Edge softness (0 = hard strip, 1 = gaussian glow). */
  softness: 5,
  /** Height above terrain along on-path segments (m). */
  lift: 1.5,
  /** Extra Y lift at the midpoint of the orb exit Bézier (m). */
  arcHeight: 0.9,
  /** HDR emissive intensity before bloom HDR_SCALE (player orb is ~1.25). */
  hdrIntensity: 5,
  emissiveHex: 0xffcc44,
  /** Packets per second at a point on the path (travel = speed × spacing). */
  pulseSpeed: 0.1,
  /** Brightness contrast of chasing pulses (0 = static, 1 = pulse-led). */
  pulseAmplitude: 1,
  /** Idle ribbon / cobble-glow brightness between packets (1 = full line). */
  pulseIdle: 0.0005,
  /** Metres between chasing pulse peaks. */
  pulseSpacingM: 30,
  /** Gentle extra Y hop on each pulse packet (m). */
  pulseLift: 0.1,
  /** Whole-ribbon hover bob (m). Player orb uses 0.12. */
  floatAmp: 0.25,
  /** Bob angular speed. Player orb uses 2.0. */
  floatSpeed: 0.75,
  /** Metres of path per full undulation (larger = more of the line moves together). */
  floatWaveM: 32,
  fadeStartM: 16,
  fadeEndM: 64,
  /** Fully hidden within this XZ distance of the player (m). */
  playerNearFadeStartM: 2.4,
  /** Fully visible beyond this XZ / along-path distance from the player (m). */
  playerNearFadeEndM: 5.5,
  /** Treat the energy orb as on-path within this distance of the snapped cell (m). */
  onPathSnapM: 1.8,
  /** A* step cost for non-path land (path cells cost 1). */
  landCost: 14,
  /** Max ribbon samples (fixed BufferGeometry capacity). */
  sampleCount: 256,
  /** Terrain cobble glow around the closest point on the ribbon. */
  terrainGlowRadius: 10,
  terrainGlowIntensity: 0.12,
  terrainGlowMul: 1,
} as const;

export interface GuideLineSettings {
  enabled: boolean;
  width: number;
  softness: number;
  lift: number;
  arcHeight: number;
  hdrIntensity: number;
  emissiveHex: number;
  pulseSpeed: number;
  pulseAmplitude: number;
  pulseIdle: number;
  pulseSpacingM: number;
  pulseLift: number;
  floatAmp: number;
  floatSpeed: number;
  floatWaveM: number;
  fadeStartM: number;
  fadeEndM: number;
  playerNearFadeStartM: number;
  playerNearFadeEndM: number;
  onPathSnapM: number;
  landCost: number;
  sampleCount: number;
  terrainGlowRadius: number;
  terrainGlowIntensity: number;
  terrainGlowMul: number;
}
