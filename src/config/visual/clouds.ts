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
  /** Gold mix = goldenHourT × this. */
  goldenTintStrength: 0.7,
  sunCatchStrength: 0.85,
  terrainInteractionEnabled: true,
  terrainClearanceM: 12,
  terrainFadeBelowM: 8,
} as const;

export const clouds = CLOUDS;
