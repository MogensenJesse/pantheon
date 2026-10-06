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
  /** Local-space puff shear. 0 holds the rigid pattern. */
  boilAmount: 0.5,
  boilSpeed: 0.15,
  /** Extra height above the puff bottom. The deck base stays put. */
  growAmount: 0.12,
  growSpeed: 0.08,
  /** 0 holds every cloud solid. 1 lets small clouds follow the life noise. */
  lifeAmount: 1,
  /** World-space frequency. 0.005 is about a 200 m patch. */
  lifeNoiseFreq: 0.02,
  /** Noise-space drift per second so clouds still fade when the wind is stopped. */
  lifeScroll: 0.1,
  /** Horizontal extent (m) that fully follows the noise. */
  lifeExtentLo: 40,
  /** Horizontal extent (m) that stays solid. */
  lifeExtentHi: 140,
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
    night: { sun: 0x3a5068, ambient: 0x1e3454, tint: 0x2c4464 },
    goldenHour: { sun: 0xffa878, ambient: 0x6a5a88, tint: 0xffc8b8 },
    noon: { sun: 0xffffff, ambient: 0x6a9ed0, tint: 0xcfeaf6 },
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
  terrainClearanceM: 0,
  terrainFadeBelowM: 20,
  /** Hard cap on sphere instances. Deck placement lives on cumulusDeck. */
  maxInstances: 2000,
} as const;

export const clouds = CLOUDS;
