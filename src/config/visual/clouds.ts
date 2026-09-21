// src/config/visual/clouds.ts ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â procedural mesh-cluster clouds

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
  /** View-facing alpha power ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â higher = softer rims. */
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
  /** Warm golden palette strength at low sun (0ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Å“1). */
  goldenTintStrength: 0.6,
  sunCatchStrength: 0.9,
  /** Cloud lighting colors per TOD stop (sampled via todWeights). */
  palette: {
    night: { sun: 0x3a5068, ambient: 0x101828, tint: 0x4a6880 },
    goldenHour: { sun: 0xffb060, ambient: 0x5a5068, tint: 0xe8a878 },
    noon: { sun: 0xffffff, ambient: 0x6a9ed0, tint: 0xe8f4ff },
  },
  terrainInteractionEnabled: true,
  terrainClearanceM: 12,
  terrainFadeBelowM: 8,

  /** Volumetric WebGPU clouds (webgpu-clouds). Composited in postFX before bloom/AgX. */
  volumetric: {
    enabled: true,
    qualityPreset: 'high' as const,
    coverage: 0.38,
    mapSize: 2048,
    layers: [
      { channel: 'r' as const, altitude: 50, height: 65, densityScale: 0.2, shadow: true },
      { channel: 'g' as const, altitude: 300, height: 110, densityScale: 0.05, shadow: true },
      { channel: 'b' as const, altitude: 1000, height: 60, densityScale: 0.02, shadow: false },
    ],
  },
} as const;

export const clouds = CLOUDS;
