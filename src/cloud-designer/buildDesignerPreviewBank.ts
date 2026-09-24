// src/cloud-designer/buildDesignerPreviewBank.ts - designer preview via play generateCloudField
import type { CloudGenus, CloudSettings } from '../rendering/clouds/cloudConfig';
import { readCloudSettings, syncCloudSettingsAliases } from '../rendering/clouds/cloudConfig';
import { getCloudGenusProfile } from '../rendering/clouds/cloudGenusProfiles';
import { type CloudFieldData, generateCloudField } from '../rendering/clouds/generateCloudField';
import type { DesignerPreviewLayout } from './CloudDesignerShell';

/**
 * Fixed designer preview seed - stable across reloads and genus toggles.
 * Independent of play VISUAL.clouds.seed; never written to Save JSON / play settings.
 */
export const PREVIEW_SEED = 42;

/** Designer wrap domain (m) - coverage-noise field, tight enough for orbit inspection. */
const PREVIEW_SPREAD_M = 480;

/** Generator minimum spacing (`pickWeightedWithSpacing` floor). Packed deck uses this. */
const DECK_MIN_SPACING_M = 40;

/** Previous designer target, expressed as density on the packed deck. */
const DEFAULT_PREVIEW_CLOUD_COUNT = 28;

/**
 * Play edge fade is 140 m on a 2400 m spread (~12% of half-spread).
 * Same fraction on the 480 m deck (~29 m) so rim clouds stay readable.
 */
const PREVIEW_EDGE_FADE_M = PREVIEW_SPREAD_M * 0.5 * 0.12;

/** Clouds that fit the preview deck at the generator's 40 m spacing floor. */
export function previewDeckMaxCloudCount(spread = PREVIEW_SPREAD_M): number {
  return Math.max(1, Math.floor((spread / DECK_MIN_SPACING_M) ** 2));
}

/**
 * Density 0 = empty deck. Any density above 0 places at least one cloud.
 * 1 = packed to `previewDeckMaxCloudCount` (144 on the 480 m deck).
 */
export function previewCloudCountForDensity(density: number, spread = PREVIEW_SPREAD_M): number {
  const d = Math.max(0, Math.min(1, density));
  if (d <= 0) return 0;
  const max = previewDeckMaxCloudCount(spread);
  return Math.max(1, Math.min(max, Math.round(d * max)));
}

/** Default when shell has not overridden preview chrome (28 clouds on this deck). */
export const DEFAULT_DESIGNER_PREVIEW_DENSITY =
  DEFAULT_PREVIEW_CLOUD_COUNT / previewDeckMaxCloudCount();

/** Default when shell has not overridden Phase 5 preview chrome. */
export const DEFAULT_DESIGNER_PREVIEW_LAYOUT: Readonly<DesignerPreviewLayout> = Object.freeze({
  density: DEFAULT_DESIGNER_PREVIEW_DENSITY,
});

function typeWeightsForGenus(genus: CloudGenus): CloudSettings['typeWeights'] {
  return {
    cumulus: genus === 'cumulus' ? 1 : 0,
    stratus: genus === 'stratus' ? 1 : 0,
    cirrus: genus === 'cirrus' ? 1 : 0,
  };
}

/**
 * Preview cluster count from deck density × preview area.
 * particlesHint stays on the genus profile (per cloud) - never derived from layout.
 */
export function resolvePreviewCloudCount(layout: DesignerPreviewLayout): number {
  return previewCloudCountForDensity(layout.density);
}

/** Designer-only settings overlay - does not mutate shipped VISUAL / play readCloudSettings(). */
function buildPreviewFieldSettings(
  genus: CloudGenus,
  cloudCount: number,
  particlesHint: number,
): CloudSettings {
  const base = readCloudSettings();
  const particles = Math.max(1, Math.round(particlesHint));
  const settings: CloudSettings = {
    ...base,
    seed: PREVIEW_SEED,
    spread: PREVIEW_SPREAD_M,
    edgeFadeM: PREVIEW_EDGE_FADE_M,
    typeWeights: typeWeightsForGenus(genus),
    coverageNoise: { ...base.coverageNoise },
    layerCoverage: { ...base.layerCoverage },
    layers: {
      low: {
        ...base.layers.low,
        cloudCount,
        particlesMin: particles,
        particlesMax: particles,
      },
      high: {
        ...base.layers.high,
        // Low layer only for genus authoring clarity.
        cloudCount: 0,
        particlesMin: particles,
        particlesMax: particles,
      },
    },
    maxInstances: Math.max(base.maxInstances, cloudCount * particles + 64),
  };
  syncCloudSettingsAliases(settings);
  return settings;
}

/**
 * Apply genus puffLayout scales after play placement (designer shape chrome).
 * Cluster XZ from generateCloudField stay untouched - not a second placement SoT.
 */
function applyGenusPuffLayoutScales(field: CloudFieldData, genus: CloudGenus): void {
  const profile = getCloudGenusProfile(genus);
  const rs = profile.puffLayoutRadiusScale;
  const hs = profile.puffLayoutHeightScale;
  if (rs === 1 && hs === 1) return;

  for (const cluster of field.clusters) {
    for (const p of cluster.particles) {
      p.x *= rs;
      p.y *= hs;
      p.z *= rs;
      p.sx *= rs;
      p.sy *= hs;
      p.sz *= rs;
    }
  }
  for (const p of field.particles) {
    p.offsetX *= rs;
    p.offsetY *= hs;
    p.offsetZ *= rs;
    p.scaleX *= rs;
    p.scaleY *= hs;
    p.scaleZ *= rs;
  }
}

/**
 * Soft-sphere preview field via play generateCloudField (fixed seed, active-genus weights).
 * - particlesHint -> layers.low.particlesMin = particlesMax (per cloud only; genus panel)
 * - layout.density -> derived layers.low.cloudCount (amount of clouds on this deck)
 * - typeWeights 100% active genus (genus switcher isolates look)
 * - high layer cloudCount 0 (low-only for genus authoring)
 * - real coverage-noise placement - not a straight line of banks along X
 * Sit/clip: deckBaseFraction + deckPlaneYBiasM stay on play profile / wind path.
 * Soft shading / condensation Discard-inside-Fn untouched. Save JSON untouched.
 */
export function buildDesignerPreviewBank(
  genus: CloudGenus,
  layout: DesignerPreviewLayout = DEFAULT_DESIGNER_PREVIEW_LAYOUT,
): CloudFieldData {
  const genusProfile = getCloudGenusProfile(genus);
  const cloudCount = resolvePreviewCloudCount(layout);
  const settings = buildPreviewFieldSettings(genus, cloudCount, genusProfile.particlesHint);
  const field = generateCloudField({ settings, seed: PREVIEW_SEED });
  applyGenusPuffLayoutScales(field, genus);
  return field;
}
