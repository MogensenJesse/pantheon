// src/config/visual/energyOrb.ts — residue orb look + sparkles
import { SPARKLE_LOOK, SPARKLE_PALETTE } from './sparkleLook.ts';

export const energyOrb = {
  /** Overrides on organicOrb (player keeps defaults). */
  look: {
    rimPower: 2.5,
    rimHdr: 1.25,
    fillWhite: 0.3,
  },
  morphOriginMul: 0.18,
  particles: {
    enabled: true,
    /** Per orb; capacity = this × orb count. Reload after change. */
    idleCountPerOrb: 20,
    idleRadiusM: 0.18,
    spreadM: 0.14,
    particleSizeM: SPARKLE_LOOK.sizeM,
    particleIdle: 0.52,
    particleHdr: 1.65,
    particleSpin: 0.55,
    breathAmount: 0.45,
    breathSpeed: 1.6,
    emissiveHex: SPARKLE_PALETTE.colorAHex,
    colorBHex: SPARKLE_PALETTE.colorBHex,
    colorCHex: SPARKLE_PALETTE.colorCHex,
    colorTravelM: SPARKLE_PALETTE.colorTravelM,
    pulseSpeed: 0.45,
    pulseSpacingM: 1.15,
    pulseLengthM: 0.4,
    burstCount: 56,
    burstConcurrent: 3,
    burstDuration: 1,
    burstRadiusM: 1.7,
    burstLiftM: 0.48,
    burstPop: 0.3,
    burstStagger: 0.4,
    burstSizeM: 0.048,
    burstHdr: 3.4,
    burstSpin: 1.15,
    burstOrbitM: 1.4,
    burstSpreadM: 0.04,
    burstPulseSpeed: 1.15,
    burstPulseSpacingM: 0.7,
    burstPulseLengthM: 0.28,
  },
} as const;

export type EnergyOrbParticleSettings = {
  -readonly [K in keyof typeof energyOrb.particles]: (typeof energyOrb.particles)[K] extends boolean
    ? boolean
    : number;
};
