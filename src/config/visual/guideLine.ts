// src/config/visual/guideLine.ts — path ribbon to next energy orb
import { SPARKLE_LOOK, SPARKLE_PALETTE } from './sparkleLook.ts';

export const guideLine = {
  enabled: true,
  width: 0.02,
  softness: 2,
  lift: 1.5,
  arcHeight: 0.9,
  hdrIntensity: 5,
  emissiveHex: SPARKLE_PALETTE.colorAHex,
  colorBHex: SPARKLE_PALETTE.colorBHex,
  colorCHex: SPARKLE_PALETTE.colorCHex,
  colorTravelM: SPARKLE_PALETTE.colorTravelM,
  pulseSpeed: 0.1,
  pulseAmplitude: 1,
  pulseIdle: 0.0005,
  pulseSpacingM: 30,
  pulseLengthM: 9,
  pulseSharpness: 6,
  floatAmp: 0.25,
  floatSpeed: 0.75,
  floatWaveM: 32,
  noiseAmp: 0.5,
  noiseSpeed: 0.35,
  noiseScale: 0.08,
  tipGlowM: 6,
  tipGlowBoost: 0.85,
  breathAmount: 0.7,
  breathSpeed: 2,
  revealSec: 1.5,
  fadeStartM: 16,
  fadeEndM: 64,
  playerNearFadeStartM: 2.4,
  playerNearFadeEndM: 5.5,
  onPathSnapM: 1.8,
  landCost: 14,
  /** Fixed BufferGeometry capacity. */
  sampleCount: 256,
  terrainGlowRadius: 10,
  terrainGlowIntensity: 0.3,
  /** Reload after count change. */
  particleCount: 240,
  particleSpreadM: 0.5,
  particleSizeM: SPARKLE_LOOK.sizeM,
  particleIdle: 0.24,
  particleHdr: SPARKLE_LOOK.hdr,
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
