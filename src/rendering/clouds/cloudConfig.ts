// src/rendering/clouds/cloudConfig.ts - types and VISUAL.clouds accessors (single baked default)
import { VISUAL } from '../../config/visualTuning';
import { cumulusCloudCountForDensity, readCumulusDeck } from './cumulusDeck';

/** Tileable coverage/bank-noise FBM parameters (gen-time placement). Octaves frozen in generator. */
export interface CoverageNoiseSettings {
  /** Noise cell size in world meters. */
  cellM: number;
  /** Density soft threshold width (0-1). */
  softness: number;
}

/** Cumulus deck placement. */
export interface CloudLayerSettings {
  baseY: number;
  jitter: number;
  cloudCount: number;
  particlesMin: number;
  particlesMax: number;
}

export interface CloudSettings {
  enabled: boolean;
  /** Coverage threshold (0-1). */
  coverage: number;
  seed: number;
  spread: number;
  /** Soft opacity fade width at wind-wrap domain edges (m). */
  edgeFadeM: number;
  opacity: number;
  /** View-facing alpha power - higher = softer / more faded rims. */
  facingPow: number;
  /** N.V smoothstep width for soft-particle rim dissolve. */
  edgeSoftness: number;
  /** World-space cotton breakup strength (0-1). Coarse lumps on the puff outline. */
  wispStrength: number;
  /** Coarse lump frequency. */
  wispScaleA: number;
  wispSpeed: number;
  /** 0–1 fillet of the low-poly puff silhouette. 0 = faceted mesh. */
  cornerRadius: number;
  /** Flatten wrap/SSS lighting (0-1). */
  lightFlatten: number;
  windSpeed: number;
  windDirectionDeg: number;
  revealMinCoverage: number;
  revealMaxCoverage: number;
  /** Soft cast shadows onto terrain. */
  castShadows: boolean;
  /** Receive sun shadows from terrain / props. */
  receiveShadows: boolean;
  /** Min lit fraction of sun term in full shadow. */
  shadowFloor: number;
  /** Y lift for shadow map samples (m). */
  shadowSampleLiftM: number;
  /** Night valley term mix (0 = exempt, 1 = full). Noon aerial is ground-only. */
  hazeMix: number;
  /** Floor for world light scale (night/dawn readable). */
  lightScaleMin: number;
  /** Dawn/dusk directional sun catch on the lit face (0-1). */
  sunCatchStrength: number;
  /** Blend sphere normal to cluster mass normal (0-1). */
  massNormalMix: number;
  /** Darken flat cloud bases from aCloudMass.y (0-1). */
  baseShade: number;
  /** In-mass self-shadow power on the sun term. */
  selfShadow: number;
  /** Henyey-Greenstein silver-lining strength. */
  silverStrength: number;
  /** HG anisotropy g (~0.6 forward scatter). */
  silverG: number;
  terrainInteractionEnabled: boolean;
  terrainClearanceM: number;
  terrainFadeBelowM: number;
  coverageNoise: CoverageNoiseSettings;
  /** Puffs per cloud. Field rebuild. */
  particles: number;
  /** Horizontal puff layout scale. */
  puffRadiusScale: number;
  /** Vertical heap scale. */
  puffHeightScale: number;
  /** Fraction of puffs reserved as the wide deck body (0-1). */
  deckBaseFraction: number;
  /** Local-space puff shear. 0 holds the rigid pattern. */
  boilAmount: number;
  boilSpeed: number;
  /** Extra height above the puff bottom. */
  growAmount: number;
  growSpeed: number;
  /** 0 holds every cloud solid. 1 lets small clouds follow the life noise. */
  lifeAmount: number;
  /** World-space frequency of the life noise. */
  lifeNoiseFreq: number;
  /** Noise-space drift per second. */
  lifeScroll: number;
  /** Horizontal extent (m) that fully follows the noise. */
  lifeExtentLo: number;
  /** Horizontal extent (m) that stays solid. */
  lifeExtentHi: number;
  /** Single cumulus deck. Altitude, count, and puffs per cloud. */
  layer: CloudLayerSettings;
  maxInstances: number;
}

/** Shipped look from visualTuning.ts. Deck fields are filled on each read. */
let _shippedCloudLook: Omit<
  CloudSettings,
  'coverage' | 'seed' | 'spread' | 'edgeFadeM' | 'windSpeed' | 'coverageNoise' | 'layer'
> | null = null;

function readLayer(raw: {
  baseY: number;
  jitter: number;
  cloudCount: number;
  particlesMin: number;
  particlesMax: number;
}): CloudLayerSettings {
  return {
    baseY: raw.baseY,
    jitter: raw.jitter,
    cloudCount: raw.cloudCount,
    particlesMin: raw.particlesMin,
    particlesMax: raw.particlesMax,
  };
}

export function readCloudSettings(): CloudSettings {
  if (!_shippedCloudLook) {
    const c = VISUAL.clouds;
    _shippedCloudLook = {
      enabled: c.enabled,
      opacity: c.opacity,
      facingPow: c.facingPow,
      edgeSoftness: c.edgeSoftness,
      wispStrength: c.wispStrength,
      wispScaleA: c.wispScaleA,
      wispSpeed: c.wispSpeed,
      cornerRadius: c.cornerRadius,
      lightFlatten: c.lightFlatten,
      windDirectionDeg: c.windDirectionDeg,
      revealMinCoverage: c.revealMinCoverage,
      revealMaxCoverage: c.revealMaxCoverage,
      castShadows: c.castShadows,
      receiveShadows: c.receiveShadows,
      shadowFloor: c.shadowFloor,
      shadowSampleLiftM: c.shadowSampleLiftM,
      hazeMix: c.hazeMix,
      lightScaleMin: c.lightScaleMin,
      sunCatchStrength: c.sunCatchStrength,
      massNormalMix: c.massNormalMix,
      baseShade: c.baseShade,
      selfShadow: c.selfShadow,
      silverStrength: c.silverStrength,
      silverG: c.silverG,
      terrainInteractionEnabled: c.terrainInteractionEnabled,
      terrainClearanceM: c.terrainClearanceM,
      terrainFadeBelowM: c.terrainFadeBelowM,
      particles: c.particles,
      puffRadiusScale: c.puffRadiusScale,
      puffHeightScale: c.puffHeightScale,
      deckBaseFraction: c.deckBaseFraction,
      boilAmount: c.boilAmount,
      boilSpeed: c.boilSpeed,
      growAmount: c.growAmount,
      growSpeed: c.growSpeed,
      lifeAmount: c.lifeAmount,
      lifeNoiseFreq: c.lifeNoiseFreq,
      lifeScroll: c.lifeScroll,
      lifeExtentLo: c.lifeExtentLo,
      lifeExtentHi: c.lifeExtentHi,
      maxInstances: c.maxInstances,
    };
  }
  const look = _shippedCloudLook;
  const deck = readCumulusDeck();
  const deckMinY = Math.min(deck.deckMinY, deck.deckMaxY);
  const deckMaxY = Math.max(deck.deckMinY, deck.deckMaxY);
  const particles = Math.max(1, Math.round(look.particles));
  return {
    ...look,
    coverage: deck.coverage,
    seed: deck.seed,
    spread: deck.spread,
    edgeFadeM: deck.edgeFadeM,
    windSpeed: deck.windSpeed,
    coverageNoise: { cellM: deck.bankScaleM, softness: deck.bankSoftness },
    layer: readLayer({
      baseY: deckMinY,
      jitter: deckMaxY - deckMinY,
      cloudCount: cumulusCloudCountForDensity(deck.density, deck.spread),
      particlesMin: particles,
      particlesMax: particles,
    }),
  };
}

/** Target cluster count for the cumulus deck. */
export function effectiveCloudCount(settings: CloudSettings = readCloudSettings()): number {
  return Math.max(0, Math.round(settings.layer.cloudCount));
}

/** Mid-density instance estimate, capped by maxInstances. */
export function estimateCloudInstanceCount(settings: CloudSettings = readCloudSettings()): number {
  const layer = settings.layer;
  const mid = Math.round((layer.particlesMin + layer.particlesMax) * 0.5);
  const raw = Math.max(0, Math.round(layer.cloudCount)) * mid;
  return Math.max(0, Math.min(settings.maxInstances, raw));
}
