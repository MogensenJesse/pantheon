// src/config/visual/grass.ts — player-follow GPU grass + flowers

import { GRASS_FOLIAGE_LIGHTING } from './foliage';

export const grass = {
    foliageLighting: GRASS_FOLIAGE_LIGHTING,
    rings: [
      { radius: 17, densityPerM2: 250, bladeWidth: 0.02, segments: 4 },
      { radius: 30, densityPerM2: 60, bladeWidth: 0.05, segments: 1 },
      { radius: 240, densityPerM2: 50, bladeWidth: 0.075, segments: 1 },
    ],
    /**
     * LOD0→LOD1 outer fade-out (m). LOD0 stays full for its radius, then fades while LOD1 is full.
     */
    ringFadeBandM: 16,
    /**
     * LOD1→LOD2 outer fade-out (m). Same pattern at the mid/far boundary (also softens LOD2’s far edge).
     */
    ringFadeBandLod12M: 24,
    /**
     * LOD2 inner fade-in (m) at the LOD1→2 boundary — short ramp so far LOD doesn’t hard-pop.
     */
    ringFadeInLod2M: 12,
    /** Safety cap on bladesPerSide² per ring. */
    maxInstancesPerRing: 6_000_000,
    /**
     * Hard cap on blades along one tile edge. Caps wrap-tile size when radius×density
     * would exceed this (effective grass reach ≈ tileSize/2). 1024 ≈ ±72 m at 50/m².
     */
    maxBladesPerSide: 2048,
    bladeHeight: 0.5,
    windStrength: 0.27,
    windSpeed: 0.1,
    bladeMinScale: 0.94,
    bladeMaxScale: 3,
    /** NDC frustum padding (Revo-style compute cull). Keep Y pads modest + balanced. */
    cullPadNdcX: 0.075,
    cullPadNdcYNear: 0.2,
    cullPadNdcYFar: 0.2,
    baseColor: '#818932',
    tipColor: '#35b143',
    colorMixFactor: 0.125,
    colorVariationStrength: 3.5,
    baseWindShade: 0.75,
    baseShadeHeight: 1,
    baseBending: 3,
    biomeGrassThreshold: 0.25,
    /** Normalized grass-weight range above threshold for full density/height. */
    biomeGrassFadeWidth: 0.8,
    /** Minimum blade height multiplier at biome transition edges. */
    transitionMinBladeScale: 0.35,
    /** Grid-cell blur for grass path grass mask (wider than terrain for softer path edges). */
    pathOffMaskRadiusCells: 8,
    /** Per-biome grass density multipliers (G-channel bake, 0–1 typical). */
    biomeDensity: {
      meadow: 1.0,
      forest: 0.3,
      hills: 0.1,
      shore: 0,
      mountain: 0.0,
      path: 0,
    },
    trailGrowthRate: 0.2,
    trailMinScale: 0,
    trailRadius: 0.8,
    trailKDown: 0.4,
    /** Pad beyond mesh silhouette before grass fade (m). */
    propGrassPadM: 0,
    /** Narrow fade band at mesh silhouette edge (m). */
    propGrassEdgeFadeM: 0.12,
    /** Influence below this (0–1) hard-culls grass/flower instances. */
    propGrassCullThreshold: 0.3,
    playerGlowMul: 0.35,
    /** Night albedo floor — distant grass recedes like ground at night. */
    nightColorFloor: 0.06,
    /** Lifts blades slightly above terrain Y to reduce z-fighting on steep slopes. */
    surfaceBias: 0.04,
    flowers: {
      enabled: true,
      /** Single field spanning LOD0 + LOD1 (through mid ring outer edge). */
      flowersPerSide: 50,
      minScale: 0.075,
      maxScale: 0.135,
      boundsRadius: 1.0,
      grassThreshold: 0.25,
      color1: '#051f54',
      color2: '#fc9400',
      colorStrength: 0.275,
      /** Vertical lift above terrain (m), after sprite pivot. */
      heightOffset: 0.65,
      alphaTest: 0.15,
    },
  } as const;
