// src/config/visual/grass.ts — player-follow GPU grass + flowers

import { GRASS_FOLIAGE_LIGHTING } from './foliage.ts';

export const grass = {
  foliageLighting: GRASS_FOLIAGE_LIGHTING,
  rings: [
    { radius: 20, densityPerM2: 100, bladeWidth: 0.05, segments: 6 },
    { radius: 30, densityPerM2: 25, bladeWidth: 0.075, segments: 1 },
    { radius: 180, densityPerM2: 5, bladeWidth: 0.2, segments: 1 },
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
  /**
   * Remaining far blades widen by this factor so a thinner crop still reads as a carpet.
   * Blend is 1× inside widthNearRadius, full gain by widthFarRadius (Revo 4× / 15→45 m).
   */
  widthFarGain: 2,
  widthNearRadius: 15,
  widthFarRadius: 45,
  /**
   * Screen-space keep: projected blade height ≈ fy × bladeHeight / cameraDistance.
   * Below min the blade is always culled; at full it always stays (modulated by annulus × biome).
   */
  projectedHeightMin: 0.004,
  projectedHeightFull: 0.022,
  /** Stochastic keep hysteresis — stay on a bit longer than the enter threshold to kill sparkle-pop. */
  stochasticHysteresis: 0.11,
  /**
   * World-XZ clump field baked into grass-data G (2-octave value noise).
   * Strength 0 = ignore baked clumps. Coverage is the fraction of the field
   * that remains as patches; size/coverage/softness re-bake the data map.
   */
  clumpStrength: 1,
  /** Patch size (m) — lattice period of the 2-octave value noise. Re-bakes data G. */
  clumpScaleM: 7,
  /** Fraction of the field that stays as clumps (1 = full carpet). Re-bakes data G. */
  clumpCoverage: 0.5,
  /** Smoothstep edge width around coverage (0 = hard patches). Re-bakes data G. */
  clumpSoftness: 0.25,
  /** Blade height multiplier at clump edges (1 = no height fade). */
  clumpEdgeMinScale: 0.05,
  /** Extra keep at the clump fringe (0 = same keep as height fade, 1 = full density on the rim). */
  clumpEdgeDensityBoost: 0.95,
  /**
   * Safety cap on bladesPerSide² per ring. When this binds, wrap-tile reach is
   * kept and spacing is thinned (effective density drops).
   */
  maxInstancesPerRing: 1_000_000,
  /**
   * Hard cap on blades along one tile edge. Same policy as maxInstancesPerRing:
   * keep authored reach, thin density.
   */
  maxBladesPerSide: 2048,
  /**
   * Compact tile cull: mark T×T grid cells against the frustum, then skip expensive
   * per-blade terrain/biome work for off-screen tiles.
   */
  tileCullEnabled: true,
  /** Blades per tile edge (power of two recommended). */
  tileCullSize: 32,
  bladeHeight: 0.75,
  windStrength: 0.27,
  windSpeed: 0.1,
  bladeMinScale: 0.94,
  bladeMaxScale: 3,
  /**
   * Revo muted A/B (sRGB): dark `#1f2612`, base `#476130`, tip `#757d5e`,
   * rust `#612f1c`, warm `#a88769`. Shipped values stay in the Pantheon olive/green.
   */
  baseColorDark: '#375C18',
  baseColor: '#678837',
  tipColor: '#53B344',
  rustColor: '#5D3323',
  warmColor: '#C0A850',
  colorMixFactor: 0.25,
  /** Mix 1 → per-blade noise (Revo). */
  colorVariationStrength: 0.9,
  rustVariationStrength: 0.21,
  warmVariationStrength: 0.48,
  /** Fake AO: proximity (m), rim smoothness, strength. */
  aoRadius: 15,
  aoRimSmoothness: 5,
  aoScale: 0.5,
  sheenStrength: 0.02,
  transmissionStrength: 0.13,
  baseWindShade: 0.75,
  baseShadeHeight: 1,
  baseBending: 3,
  /** Per-blade sprite yaw (rad). */
  spriteRotationRandomness: 0.05,
  /** Shorten blades as they lean (Revo bend drop). */
  bendDropStrength: 1.3,
  /** Bezier control for lean shape (0 = linear in h², 1 = more mid-blade). */
  bendControlPoint: 0.4,
  windUvScale: 1.35,
  ambientSwayStrength: 0.055,
  windLull: 0.09,
  windEddyStrength: 0.9,
  windGustCoverage: 0.6,
  windCurveP1: 0.003,
  windCurveP2: 0.85,
  /** Below this baked weight, no blades (shore/path/water stay empty). */
  biomeGrassThreshold: 0.05,
  /** Edge softness above threshold (m of weight, capped at 0.15 in the keep shader). */
  biomeGrassFadeWidth: 0.12,
  /** Minimum blade height multiplier at biome transition edges. */
  transitionMinBladeScale: 0.35,
  /** Per-biome grass density multipliers (G-channel bake, 0–1 typical). */
  biomeDensity: {
    meadow: 1.0,
    forest: 0.55,
    hills: 0.75,
    shore: 0,
    mountain: 0.3,
    path: 0,
  },
  /** Scale recovery toward rest × seconds since last compact (Revo 5). */
  trailGrowthRate: 5,
  trailMinScale: 0.15,
  trailRadius: 0.65,
  /** Crush toward min scale × contact × compact-dt (Revo 50). */
  trailKDown: 50,
  /** Lean away from the player while crushed. */
  trailBendStrength: 0.8,
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
    /** Grid along one tile edge (clamped 8–64). Spacing = tile / this. */
    flowersPerSide: 64,
    minScale: 0.075,
    maxScale: 0.135,
    boundsRadius: 1.0,
    grassThreshold: 0.25,
    color1: '#051f54',
    color2: '#fc9400',
    colorStrength: 0.275,
    /** Vertical lift above terrain (m), after sprite pivot. */
    heightOffset: 0.5,
    alphaTest: 0.15,
  },
} as const;
