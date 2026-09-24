// src/config/visual/clouds.ts — procedural mesh-cluster clouds

const CLOUDS = {
  enabled: true,
  /** Baked dramatic-ish field look (was CLOUD_PRESETS.dramatic). */
  coverage: 0.72,
  layerCoverage: { low: 0.78, high: 0.55 },
  typeWeights: { cumulus: 0.75, stratus: 0.2, cirrus: 0.05 },
  /** Full reload after change. */
  seed: 12345,
  /** Wind-wrap domain (m); slightly > WORLD.SIZE. */
  spread: 2400,
  edgeFadeM: 140,
  opacity: 0.5,
  /** View-facing alpha power — higher = softer rims. */
  facingPow: 2.4,
  edgeSoftness: 0.7,
  /** Extra soft-particle power (safe on spheres). */
  radialSoftness: 0.3,
  wispStrength: 1,
  wispScaleA: 0.1,
  wispScaleB: 0.12,
  wispSpeed: 0.18,
  /** Flatten wrap/SSS so overlaps don't read as lit discs. */
  lightFlatten: 0.32,
  windSpeed: 16,
  windDirectionDeg: 270,
  revealMinCoverage: 0.25,
  revealMaxCoverage: 1,
  /** Dedicated soft shadow map (not PCSS sun map). */
  castShadows: true,
  castShadowSoftness: 64,
  castShadowMapSize: 2048,
  receiveShadows: true,
  shadowFloor: 0.35,
  shadowSampleLiftM: 6,
  /** Night valley fog mix (noon aerial is ground-only). */
  hazeMix: 0.75,
  lightScaleMin: 0.08,
  /** Warm golden palette strength at low sun (0–1). */
  goldenTintStrength: 0.6,
  sunCatchStrength: 0.9,
  /** Cloud lighting colors per TOD stop (sampled via todWeights). */
  palette: {
    night: { sun: 0x3a5068, ambient: 0x101828, tint: 0x4a6880 },
    goldenHour: { sun: 0xffb060, ambient: 0x5a5068, tint: 0xe8a878 },
    noon: { sun: 0xffffff, ambient: 0x6a9ed0, tint: 0xe8f4ff },
  },
  /** Blend sphere normal → cluster mass normal (0–1). */
  massNormalMix: 0.7,
  /** Darken flat cloud bases from aCloudMass.y (0–1). */
  baseShade: 0.28,
  /** In-mass self-shadow power on the sun term. */
  selfShadow: 1.8,
  /** Henyey–Greenstein silver-lining strength. */
  silverStrength: 0.45,
  /** HG anisotropy g (~0.6 forward scatter). */
  silverG: 0.6,
  terrainInteractionEnabled: true,
  terrainClearanceM: 12,
  terrainFadeBelowM: 8,
  /** Tileable coverage-noise FBM (Engine samples inline in generateCloudField). Octaves frozen at 4 in generator. */
  coverageNoise: {
    cellM: 256,
    softness: 0.2,
  },
  /** Low valley + high sky layers (Engine places from these). */
  layers: {
    low: {
      baseY: 40,
      jitter: 50,
      cloudCount: 28,
      particlesMin: 12,
      particlesMax: 32,
      sizeMul: 1,
      terrainLift: true,
    },
    high: {
      baseY: 400,
      jitter: 80,
      cloudCount: 14,
      particlesMin: 16,
      particlesMax: 40,
      sizeMul: 3,
      terrainLift: false,
    },
  },
  /** Hard cap on sphere instances across both layers. */
  maxInstances: 2000,
} as const;

export const clouds = CLOUDS;
