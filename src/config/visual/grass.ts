// src/config/visual/grass.ts — player-follow GPU grass + flowers

import { GRASS_FOLIAGE_LIGHTING } from './foliage.ts';

export const grass = {
  foliageLighting: GRASS_FOLIAGE_LIGHTING,
  /**
   * `radius` is the full-strength band width. `fadeOutM` extends past it (density and
   * blade length shrink to 0) while the next ring is already full, so the overlap is the
   * fade-out. `fadeInM` is the mirror ramp (density and blade length) from the ring's inner edge.
   */
  rings: [
    { radius: 20, densityPerM2: 100, bladeWidth: 0.05, segments: 6, fadeOutM: 16, fadeInM: 0 },
    { radius: 30, densityPerM2: 25, bladeWidth: 0.075, segments: 1, fadeOutM: 24, fadeInM: 0 },
    { radius: 180, densityPerM2: 5, bladeWidth: 0.2, segments: 1, fadeOutM: 24, fadeInM: 0 },
  ],
  /** Blade length across a fade-out is `fade^power`; density is linear, so length leads the thinning. */
  ringFadeHeightPower: 1.5,
  /** Far blades widen by this factor (1× inside widthNearRadius). */
  widthFarGain: 2,
  widthNearRadius: 15,
  widthFarRadius: 45,
  /** Screen-space cull: projected height ≈ fy × bladeHeight / dist. */
  projectedHeightMin: 0.004,
  projectedHeightFull: 0.022,
  stochasticHysteresis: 0.11,
  /** Clump field in data G — strength/coverage/scale/softness re-bake G. */
  clumpStrength: 1,
  clumpScaleM: 7,
  clumpCoverage: 0.5,
  clumpSoftness: 0.25,
  clumpEdgeMinScale: 0.05,
  clumpEdgeDensityBoost: 0.95,
  /** When capped, keep reach and thin density. */
  maxInstancesPerRing: 1_000_000,
  maxBladesPerSide: 2048,
  /**
   * LOD0/LOD1 sun shadow source. true = near PCSS cascade (about 50 extra compare taps per
   * pixel, sharpest shadows); false = far Vogel cascade + clouds (about 20 taps, softer).
   * LOD0 is fragment-bound, so this is its largest single cost. Full page reload.
   */
  nearShadow: false,
  frustumCullEnabled: true,
  tileCullEnabled: true,
  tileCullSize: 32,
  bladeHeight: 0.75,
  windStrength: 0.27,
  windSpeed: 0.1,
  bladeMinScale: 0.94,
  bladeMaxScale: 3,
  /** Blade albedo stops — sampled via todWeights. */
  colorStops: {
    night: {
      baseColorDark: '#061C1A',
      baseColor: '#0C3028',
      tipColor: '#1A4A40',
      rustColor: '#2A2018',
      warmColor: '#3A5A28',
    },
    goldenHour: {
      baseColorDark: '#4A4424',
      baseColor: '#7A7040',
      tipColor: '#A89858',
      rustColor: '#8A4030',
      warmColor: '#A06040',
    },
    noon: {
      baseColorDark: '#4A6A20',
      baseColor: '#6A8A30',
      tipColor: '#A8B848',
      rustColor: '#7A4830',
      warmColor: '#D0A840',
    },
  },
  colorMixFactor: 0.25,
  colorVariationStrength: 0.9,
  rustVariationStrength: 0.21,
  warmVariationStrength: 0.48,
  aoRadius: 15,
  aoRimSmoothness: 5,
  aoScale: 0.5,
  sheenStrength: 0.02,
  transmissionStrength: 0.13,
  baseWindShade: 0.75,
  baseShadeHeight: 1,
  baseBending: 3,
  spriteRotationRandomness: 0.05,
  bendDropStrength: 1.3,
  bendControlPoint: 0.4,
  windUvScale: 1.35,
  ambientSwayStrength: 0.055,
  windLull: 0.09,
  windEddyStrength: 0.9,
  windGustCoverage: 0.6,
  windCurveP1: 0.003,
  windCurveP2: 0.85,
  biomeGrassThreshold: 0.05,
  biomeGrassFadeWidth: 0.12,
  transitionMinBladeScale: 0.35,
  biomeDensity: {
    meadow: 1.0,
    forest: 0.55,
    hills: 0.75,
    shore: 0,
    mountain: 0.3,
    path: 0,
  },
  trailGrowthRate: 5,
  trailMinScale: 0.15,
  trailRadius: 0.65,
  trailKDown: 50,
  trailBendStrength: 0.8,
  propGrassPadM: 0,
  propGrassEdgeFadeM: 0.12,
  propGrassCullThreshold: 0.3,
  playerGlowMul: 0.35,
  nightColorFloor: 0.06,
  /** Root offset from the chiseled terrain surface (m); slightly negative buries the blade base. */
  surfaceBias: -0.03,
  /** Pull blade/flower roots toward the camera along the view ray (m) — depth only, no screen shift. */
  depthPullM: 0.12,
  flowers: {
    enabled: true,
    flowersPerSide: 64,
    minScale: 0.075,
    maxScale: 0.135,
    grassThreshold: 0.25,
    color1: '#3D2A7A',
    color2: '#FC5C1A',
    colorStrength: 0.275,
    heightOffset: 0.5,
    alphaTest: 0.15,
  },
} as const;
