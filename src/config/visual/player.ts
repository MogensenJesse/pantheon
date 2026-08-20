// src/config/visual/player.ts — player orb illumination + footing smooth; surface glow muls live on terrain/grass/props
import { SPARKLE_LOOK, SPARKLE_PALETTE } from './sparkleLook.ts';

export const player = {
  illuminationNight: 0.2,
  illuminationDay: 0.02,
  /** Exponential smooth when the ring grows (orb absorbed). Higher = snappier. */
  illuminationGrowSmooth: 3.5,
  /** Exponential smooth when the ring shrinks (day fade / cap handoff). Lower = gentler. */
  illuminationShrinkSmooth: 1,
  /**
   * Orb mesh at 0% energy. Scale 1 and rim HDR 1 = current look at cap
   * (`PHASE0.ORB.PLAYER_RADIUS`, `organicOrb.rimHdr`).
   */
  orbScaleMin: 0.38,
  /** Rim HDR at 0% energy as a fraction of `organicOrb.rimHdr`. */
  orbEmissiveMin: 0.18,
  /** Fill white at 0% energy. Lerps to `organicOrb.fillWhite` at cap. */
  orbFillWhiteMin: 0.35,
  /** Low-pass on macro terrain footing while moving (Hz). */
  orbFootingSmoothHz: 8,
  /**
   * Additive sparkle sprites around the player orb (same look as guide-line motes).
   * `count` is the 100% energy cap (InstancedMesh capacity — full page reload after changes).
   */
  particles: {
    enabled: true,
    count: 92,
    /** Shell radius from orb center (m); start just outside PLAYER_RADIUS. */
    radiusM: 0.35,
    /** Extra tube offset off the shell (m). */
    spreadM: 0.4,
    particleSizeM: SPARKLE_LOOK.sizeM,
    /** Fraction visible between chasing packets (1 = always full surround). */
    particleIdle: 1,
    particleHdr: SPARKLE_LOOK.hdr,
    particleSpin: SPARKLE_LOOK.spin,
    breathAmount: 0.57,
    breathSpeed: 2,
    emissiveHex: SPARKLE_PALETTE.colorAHex,
    colorBHex: SPARKLE_PALETTE.colorBHex,
    colorCHex: SPARKLE_PALETTE.colorCHex,
    colorTravelM: SPARKLE_PALETTE.colorTravelM,
    pulseSpeed: 0.6,
    /** Fake circumference for packet chase around the shell (m). */
    pulseSpacingM: 1.8,
    pulseLengthM: 0.7,
    /** Slowest sparkle follow time-constant (s). 0 = glued to the orb. */
    dragLagSec: 0.17,
    /** 0 = all motes share `dragLagSec`; 1 = some nearly glued, others use full lag. */
    dragVariation: 1,
    /** Extra chaotic offset while moving (m). */
    shakeAmpM: 0.27,
    /** Shake noise / swirl rate. */
    shakeHz: 0.5,
    /** Player speed (m/s) at which shake is full. */
    shakeSpeedRef: 4,
  },
} as const;

export type PlayerParticleSettings = {
  -readonly [K in keyof typeof player.particles]: (typeof player.particles)[K] extends boolean
    ? boolean
    : number;
};
