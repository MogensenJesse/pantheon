// src/config/visual/clouds.ts — procedural mesh-cluster clouds

const CLOUDS = {
  enabled: true,
  opacity: 0.5,
  /** View-facing alpha power — higher = softer rims. */
  facingPow: 2.4,
  edgeSoftness: 0.7,
  /** Cotton breakup (0–1). Coarse lumps that break the sphere outline. */
  wispStrength: 0.15,
  /** World-space size of those lumps (~10 m). */
  wispScaleA: 0.03,
  wispSpeed: 0.4,
  /** Fillet of each puff's polygon corners (0 = faceted, 1 = round). */
  cornerRadius: 0.7,
  /** Puffs per cloud. Rebuilds the field. */
  particles: 24,
  /** Horizontal puff layout scale. */
  puffRadiusScale: 1,
  /** Vertical heap scale. */
  puffHeightScale: 1.15,
  /** Fraction of puffs reserved as the wide deck body (0–1). */
  deckBaseFraction: 0.3,
  /** Flatten wrap/SSS so overlaps don't read as lit discs. */
  lightFlatten: 0.32,
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
  sunCatchStrength: 0.9,
  /** Cloud lighting colors per TOD stop (sampled via todWeights). */
  palette: {
    night: { sun: 0x3a5068, ambient: 0x101828, tint: 0x4a6880 },
    goldenHour: { sun: 0xffb060, ambient: 0x5a5068, tint: 0xe8a878 },
    noon: { sun: 0xffffff, ambient: 0x6a9ed0, tint: 0xe8f4ff },
  },
  /** Blend sphere normal → cluster mass normal (0–1). High so puffs do not light as balls. */
  massNormalMix: 0.88,
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
  /** Hard cap on sphere instances. Deck placement lives on cumulusDeck. */
  maxInstances: 2000,
} as const;

export const clouds = CLOUDS;
