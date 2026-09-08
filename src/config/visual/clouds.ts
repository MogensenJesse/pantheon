// src/config/visual/clouds.ts — procedural mesh-cluster clouds

const CLOUDS = {
  enabled: true,
  preset: 'partlyCloudy' as const,
  /** Full reload after change. */
  seed: 12345,
  cloudCount: 50,
  particlesPerCloud: 32,
  cloudBaseY: 40,
  altitudeJitter: 50,
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
  goldenTintStrength: 0.7,
  sunCatchStrength: 0.85,
  /** Cloud lighting colors per TOD stop (sampled via todWeights). */
  palette: {
    night: { sun: 0x4a5a7a, ambient: 0x1c2438, tint: 0x8a96b0 },
    goldenHour: { sun: 0xd4884a, ambient: 0x4a3828, tint: 0xe0a070 },
    noon: { sun: 0xfff8e7, ambient: 0xb0c4de, tint: 0xffffff },
  },
  terrainInteractionEnabled: true,
  terrainClearanceM: 12,
  terrainFadeBelowM: 8,
} as const;

export const clouds = CLOUDS;
