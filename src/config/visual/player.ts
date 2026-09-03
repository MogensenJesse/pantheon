// src/config/visual/player.ts — player orb illumination + sparkles
import { SPARKLE_LOOK, SPARKLE_PALETTE } from './sparkleLook.ts';

export const player = {
  illuminationNight: 0.2,
  illuminationDay: 0.02,
  illuminationGrowSmooth: 3.5,
  illuminationShrinkSmooth: 1,
  /** Orb scale at 0% energy (1 = cap look at PLAYER_RADIUS). */
  orbScaleMin: 0.38,
  /** Rim HDR fraction of organicOrb.rimHdr at 0%. */
  orbEmissiveMin: 0.18,
  orbFillWhiteMin: 0.35,
  orbFootingSmoothHz: 8,
  particles: {
    enabled: true,
    /** 100% energy cap; reload after change. */
    count: 92,
    radiusM: 0.35,
    spreadM: 0.4,
    particleSizeM: SPARKLE_LOOK.sizeM,
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
    pulseSpacingM: 1.8,
    pulseLengthM: 0.7,
    dragLagSec: 0.17,
    dragVariation: 1,
    shakeAmpM: 0.27,
    shakeHz: 0.5,
    shakeSpeedRef: 4,
  },
} as const;

export type PlayerParticleSettings = {
  -readonly [K in keyof typeof player.particles]: (typeof player.particles)[K] extends boolean
    ? boolean
    : number;
};
