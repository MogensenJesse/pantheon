// src/config/visual/guideLine.ts — faint path-following ribbon to the next energy orb
import { SPARKLE_LOOK, SPARKLE_PALETTE } from './sparkleLook.ts';

export const guideLine = {
  enabled: true,
  /** Ribbon width (m). */
  width: 0.02,
  /** Halo / mesh expand (0 = tight core, 2 = wide glow). */
  softness: 2,
  /** Height above terrain along on-path segments (m). */
  lift: 1.5,
  /** Extra Y lift at the midpoint of the orb exit Bézier (m). */
  arcHeight: 0.9,
  /** HDR emissive intensity before bloom HDR_SCALE (player orb is ~1.25). */
  hdrIntensity: 5,
  /** Traveling gradient stop A (gold). */
  emissiveHex: SPARKLE_PALETTE.colorAHex,
  /** Traveling gradient stop B. */
  colorBHex: SPARKLE_PALETTE.colorBHex,
  /** Traveling gradient stop C. */
  colorCHex: SPARKLE_PALETTE.colorCHex,
  /** Metres of path per full A→B→C→A cycle. */
  colorTravelM: SPARKLE_PALETTE.colorTravelM,
  /** Packets per second at a point on the path (travel = speed × spacing). */
  pulseSpeed: 0.1,
  /** Brightness contrast of chasing pulses (0 = static, 1 = pulse-led). */
  pulseAmplitude: 1,
  /** Idle ribbon / cobble-glow brightness between packets (1 = full line). */
  pulseIdle: 0.0005,
  /** Metres between chasing pulse peaks. */
  pulseSpacingM: 30,
  /** Pulse envelope half-width (m). Sharper exponent shortens the visible node. */
  pulseLengthM: 9,
  /** Envelope exponent (1 = linear falloff, ~8 = tendril-like hot nodes). */
  pulseSharpness: 6,
  /** Whole-ribbon hover bob (m). Player orb uses 0.12. */
  floatAmp: 0.25,
  /** Bob angular speed. Player orb uses 2.0. */
  floatSpeed: 0.75,
  /** Metres of path per full undulation (larger = more of the line moves together). */
  floatWaveM: 32,
  /** Organic XZ/Y drift amplitude (m); stronger toward the orb. */
  noiseAmp: 0.5,
  /** triNoise3D animation rate for ribbon drift. */
  noiseSpeed: 0.35,
  /** World-metres scale of ribbon drift (smaller = slower spatial change). */
  noiseScale: 0.08,
  /** Metres from the orb end that receive extra brightness / halo. */
  tipGlowM: 6,
  /** Extra HDR boost at the orb tip (0 = none). */
  tipGlowBoost: 0.85,
  /** Whole-ribbon opacity breath (0 = always on, 1 = eases fully out). */
  breathAmount: 0.7,
  /** Breath angular speed (period ≈ 2π / speed seconds). */
  breathSpeed: 2,
  /** Seconds for a new path to wash in from the player to the orb (ease-in-out). */
  revealSec: 1.5,
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
  /** Terrain/prop receive radius (m) around the ribbon; pulse length sets along-path extent. */
  terrainGlowRadius: 10,
  terrainGlowIntensity: 0.3,
  /** Sparkle sprites along the ribbon (fixed capacity; full page reload after count changes). */
  particleCount: 240,
  /** Metres off the path for the sparkle tube. */
  particleSpreadM: 0.5,
  /** Billboard size (m). */
  particleSizeM: SPARKLE_LOOK.sizeM,
  /** Fraction of particles visible on the idle line (1 = all, pulse always denser). */
  particleIdle: 0.24,
  /** HDR scale for sparkles before bloom HDR_SCALE. */
  particleHdr: SPARKLE_LOOK.hdr,
  /** Orbit rate around the ribbon. */
  particleSpin: SPARKLE_LOOK.spin,
} as const;

export interface GuideLineSettings {
  enabled: boolean;
  width: number;
  softness: number;
  lift: number;
  arcHeight: number;
  hdrIntensity: number;
  emissiveHex: number;
  colorBHex: number;
  colorCHex: number;
  colorTravelM: number;
  pulseSpeed: number;
  pulseAmplitude: number;
  pulseIdle: number;
  pulseSpacingM: number;
  pulseLengthM: number;
  pulseSharpness: number;
  floatAmp: number;
  floatSpeed: number;
  floatWaveM: number;
  noiseAmp: number;
  noiseSpeed: number;
  noiseScale: number;
  tipGlowM: number;
  tipGlowBoost: number;
  breathAmount: number;
  breathSpeed: number;
  revealSec: number;
  fadeStartM: number;
  fadeEndM: number;
  playerNearFadeStartM: number;
  playerNearFadeEndM: number;
  onPathSnapM: number;
  landCost: number;
  sampleCount: number;
  terrainGlowRadius: number;
  terrainGlowIntensity: number;
  particleCount: number;
  particleSpreadM: number;
  particleSizeM: number;
  particleIdle: number;
  particleHdr: number;
  particleSpin: number;
}
