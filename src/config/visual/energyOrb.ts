// src/config/visual/energyOrb.ts — idle halo + absorb burst sparkles around residue orbs
import { SPARKLE_LOOK, SPARKLE_PALETTE } from './sparkleLook.ts';

export const energyOrb = {
  /** Residue mesh overrides on `VISUAL.organicOrb` (player keeps organicOrb as-is). */
  look: {
    rimPower: 2.5,
    rimHdr: 1.25,
    fillWhite: 0.3,
  },
  particles: {
    enabled: true,
    /**
     * Idle motes per unabsorbed orb (shared InstancedMesh; capacity = this × orb count).
     * Full page reload after changes.
     */
    idleCountPerOrb: 20,
    /** Shell radius from orb center (m); start just outside ENERGY_RADIUS. */
    idleRadiusM: 0.18,
    /** Extra tube offset off the idle shell (m). */
    spreadM: 0.14,
    particleSizeM: SPARKLE_LOOK.sizeM,
    /** Fraction visible between chasing packets. */
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
    /** Motes spawned per absorb (fixed pool × burstConcurrent). Reload after changes. */
    burstCount: 56,
    /** Simultaneous absorb bursts before the oldest slot is reused. */
    burstConcurrent: 3,
    /** Burst particle lifetime (seconds). Pop, then assimilate into the player. */
    burstDuration: 1,
    /** Outward pop travel at the end of the pop phase (m). */
    burstRadiusM: 1.7,
    /** Extra upward drift during the pop (m). */
    burstLiftM: 0.48,
    /** Fraction of lifetime spent popping outward before pull-in starts. */
    burstPop: 0.3,
    /** Extra delay spread (0–1 of remaining time) so motes stream into the player. */
    burstStagger: 0.4,
    burstSizeM: 0.048,
    burstHdr: 3.4,
    burstSpin: 1.15,
  },
} as const;

export type EnergyOrbParticleSettings = {
  -readonly [K in keyof typeof energyOrb.particles]: (typeof energyOrb.particles)[K] extends boolean
    ? boolean
    : number;
};
