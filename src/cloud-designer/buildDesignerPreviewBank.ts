// src/cloud-designer/buildDesignerPreviewBank.ts - designer preview via play generateCloudField
import type { CloudGenus, CloudSettings } from '../rendering/clouds/cloudConfig';
import { readCloudSettings, syncCloudSettingsAliases } from '../rendering/clouds/cloudConfig';
import { getCloudGenusProfile } from '../rendering/clouds/cloudGenusProfiles';
import { genusUsesCondensationClip } from '../rendering/clouds/cloudProfiles';
import {
  type CloudFieldData,
  coveragePickWeight,
  generateCloudField,
} from '../rendering/clouds/generateCloudField';

/** Designer-only preview chrome. Not persisted in genus profiles / Save JSON / play. */
export interface DesignerPreviewLayout {
  /** 0–1 density. 0 = empty, 1 = packed to the generator's 40 m spacing. */
  density: number;
  /** 0–1 play day-cycle phase. Places sun elevation and azimuth together. */
  sunPhase: number;
  /** Lowest cluster altitude (m). Maps to the preview layer base Y. */
  deckMinY: number;
  /** Highest cluster altitude (m). Span above min is the layer jitter. */
  deckMaxY: number;
  /** Wind-wrap domain (m). */
  spread: number;
  /** Soft opacity fade at the wrap edge (m). Clamped to half the spread. */
  edgeFadeM: number;
  /** 0–1 coverage threshold. Play's layer coverage is not used. */
  coverage: number;
  /** Drift speed for the preview wind clock. Does not write play wind. */
  windSpeed: number;
  /**
   * 0–1 pick bias inside the coverage mask. 0 is even. 1 sits on density² cores.
   * Preview only. Not saved. Play stays on density².
   */
  supercluster: number;
}

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

const shippedPreview = readCloudSettings();
const shippedLow = shippedPreview.layers.low;

/** Midday on the play day arc. Matches the designer's previous fixed sun. */
export const DEFAULT_PREVIEW_SUN_PHASE = 0.5;

/** Default when shell has not overridden preview chrome. Matches the previous fixed deck. */
export const DEFAULT_DESIGNER_PREVIEW_LAYOUT: Readonly<DesignerPreviewLayout> = Object.freeze({
  density: DEFAULT_DESIGNER_PREVIEW_DENSITY,
  sunPhase: DEFAULT_PREVIEW_SUN_PHASE,
  deckMinY: shippedLow.baseY,
  deckMaxY: shippedLow.baseY + shippedLow.jitter,
  spread: PREVIEW_SPREAD_M,
  edgeFadeM: PREVIEW_EDGE_FADE_M,
  coverage: shippedPreview.layerCoverage.low,
  windSpeed: shippedPreview.windSpeed,
  supercluster: 0,
});

function clampUnit(v: number): number {
  return Math.max(0, Math.min(1, v));
}

/** Keep a partial edit inside the preview ranges. Min/max stay ordered. */
export function clampDesignerPreviewLayout(
  current: DesignerPreviewLayout,
  partial: Partial<DesignerPreviewLayout>,
): DesignerPreviewLayout {
  const next: DesignerPreviewLayout = { ...current };
  if (partial.density !== undefined && Number.isFinite(partial.density)) {
    next.density = clampUnit(partial.density);
  }
  if (partial.sunPhase !== undefined && Number.isFinite(partial.sunPhase)) {
    next.sunPhase = clampUnit(partial.sunPhase);
  }
  if (partial.deckMinY !== undefined && Number.isFinite(partial.deckMinY)) {
    next.deckMinY = Math.max(0, Math.min(800, partial.deckMinY));
    if (next.deckMaxY < next.deckMinY) next.deckMaxY = next.deckMinY;
  }
  if (partial.deckMaxY !== undefined && Number.isFinite(partial.deckMaxY)) {
    next.deckMaxY = Math.max(0, Math.min(800, partial.deckMaxY));
    if (next.deckMinY > next.deckMaxY) next.deckMinY = next.deckMaxY;
  }
  if (partial.spread !== undefined && Number.isFinite(partial.spread)) {
    next.spread = Math.max(160, Math.min(1600, partial.spread));
  }
  if (partial.edgeFadeM !== undefined && Number.isFinite(partial.edgeFadeM)) {
    next.edgeFadeM = Math.max(0, partial.edgeFadeM);
  }
  next.edgeFadeM = Math.min(next.edgeFadeM, next.spread * 0.5);
  if (partial.coverage !== undefined && Number.isFinite(partial.coverage)) {
    next.coverage = clampUnit(partial.coverage);
  }
  if (partial.windSpeed !== undefined && Number.isFinite(partial.windSpeed)) {
    next.windSpeed = Math.max(0, Math.min(100, partial.windSpeed));
  }
  if (partial.supercluster !== undefined && Number.isFinite(partial.supercluster)) {
    next.supercluster = clampUnit(partial.supercluster);
  }
  return next;
}

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
  return previewCloudCountForDensity(layout.density, layout.spread);
}

/** Designer-only settings overlay - does not mutate shipped VISUAL / play readCloudSettings(). */
function buildPreviewFieldSettings(
  genus: CloudGenus,
  layout: DesignerPreviewLayout,
  particlesHint: number,
): CloudSettings {
  const base = readCloudSettings();
  const particles = Math.max(1, Math.round(particlesHint));
  const cloudCount = resolvePreviewCloudCount(layout);
  const deckMinY = Math.min(layout.deckMinY, layout.deckMaxY);
  const deckMaxY = Math.max(layout.deckMinY, layout.deckMaxY);
  const settings: CloudSettings = {
    ...base,
    seed: PREVIEW_SEED,
    spread: layout.spread,
    edgeFadeM: Math.min(layout.edgeFadeM, layout.spread * 0.5),
    windSpeed: layout.windSpeed,
    coverage: layout.coverage,
    typeWeights: typeWeightsForGenus(genus),
    coverageNoise: { ...base.coverageNoise },
    layerCoverage: { low: layout.coverage, high: layout.coverage },
    layers: {
      low: {
        ...base.layers.low,
        baseY: deckMinY,
        jitter: deckMaxY - deckMinY,
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
 * Offsets stay puff-local. This pass does not change pick weight.
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

/** Green fringe shrinks. Red cores grow to six times. Slider 0 stays 1×. */
const DESIGNER_GREEN_SIZE = 0.5;
const DESIGNER_RED_SIZE = 6;

/**
 * Same 0–1 weight the coverage heatmap colors.
 * Slider 0 is flat, so every cloud stays 1×. The 0.5×→6× spread fades in with the slider.
 */
function designerWeightSizeScale(density: number, hotspot: number): number {
  const s = Math.max(0, Math.min(1, hotspot));
  if (s <= 1e-6) return 1;
  const weight = coveragePickWeight(density, s);
  const n = Math.max(0, Math.min(1, (weight - (1 - s)) / s));
  const atFull = DESIGNER_GREEN_SIZE + (DESIGNER_RED_SIZE - DESIGNER_GREEN_SIZE) * n;
  return 1 + (atFull - 1) * s;
}

/** Local Y of the point that must stay put while height scale grows upward. */
function puffUndersideY(
  puffs: readonly { offsetY: number; scaleY: number; clip: boolean }[],
): number {
  if (puffs.length === 0) return 0;
  if (puffs[0]?.clip) return condensationUndersideY(puffs.map((p) => p.offsetY));
  let min = Number.POSITIVE_INFINITY;
  for (const p of puffs) min = Math.min(min, p.offsetY - p.scaleY);
  return min;
}

/**
 * Designer preview only. Radius scales around the anchor.
 * Height grows upward from the underside, so a 6× cloud does not lift its base.
 * Does not move XZ centers.
 */
function applyDesignerWeightSize(field: CloudFieldData, hotspot: number): void {
  const s = Math.max(0, Math.min(1, hotspot));
  if (s <= 1e-6) return;

  const scaleByCloud = new Map<number, number>();
  const baseByCloud = new Map<number, number>();
  for (const cluster of field.clusters) {
    const scale = designerWeightSizeScale(cluster.density, s);
    scaleByCloud.set(cluster.index, scale);
    const clip = genusUsesCondensationClip(cluster.genus);
    const puffs = cluster.particles.map((p) => ({ offsetY: p.y, scaleY: p.sy, clip }));
    baseByCloud.set(cluster.index, puffUndersideY(puffs));
  }

  for (const cluster of field.clusters) {
    const scale = scaleByCloud.get(cluster.index) ?? 1;
    const base = baseByCloud.get(cluster.index) ?? 0;
    if (scale === 1) continue;
    for (const p of cluster.particles) {
      p.x *= scale;
      p.z *= scale;
      p.sx *= scale;
      p.sz *= scale;
      p.y = base + (p.y - base) * scale;
      p.sy *= scale;
    }
  }
  for (const p of field.particles) {
    const scale = scaleByCloud.get(p.cloudIndex) ?? 1;
    const base = baseByCloud.get(p.cloudIndex) ?? 0;
    if (scale === 1) continue;
    p.offsetX *= scale;
    p.offsetZ *= scale;
    p.scaleX *= scale;
    p.scaleZ *= scale;
    p.offsetY = base + (p.offsetY - base) * scale;
    p.scaleY *= scale;
  }
}

/**
 * Same P25 of puff-center local Y that the sit/clip path uses as the mass underside.
 * Matches `deckCenterPercentile(..., 0.25)` without touching the play wind path.
 */
function condensationUndersideY(offsetYs: readonly number[]): number {
  const count = offsetYs.length;
  if (count <= 0) return 0;
  const sorted = [...offsetYs].sort((a, b) => a - b);
  const target = Math.min(count - 1, Math.max(0, Math.floor(count * 0.25)));
  return sorted[target] ?? 0;
}

/**
 * When the preview deck is one height, sit every cloud on
 * `deckY + deckPlaneYBiasM` (meters, not multiplied by height scale).
 * Clip genera: shift the anchor so the condensation underside lands on `deckY`;
 * wind adds the bias once. Other genera: put the sphere underside on `deckY + bias`.
 * XZ centers stay put.
 */
function applySharedDesignerDeckBase(field: CloudFieldData, deckY: number): void {
  const byCloud = new Map<number, { offsetY: number; scaleY: number }[]>();
  for (const p of field.particles) {
    const list = byCloud.get(p.cloudIndex);
    const puff = { offsetY: p.offsetY, scaleY: p.scaleY };
    if (list) list.push(puff);
    else byCloud.set(p.cloudIndex, [puff]);
  }

  for (const cluster of field.clusters) {
    const puffs = byCloud.get(cluster.index) ?? [];
    const biasM = getCloudGenusProfile(cluster.genus).deckPlaneYBiasM;
    const clip = genusUsesCondensationClip(cluster.genus);
    let localUnderside = 0;
    if (puffs.length > 0) {
      localUnderside = clip
        ? condensationUndersideY(puffs.map((p) => p.offsetY))
        : puffs.reduce((min, p) => Math.min(min, p.offsetY - p.scaleY), Number.POSITIVE_INFINITY);
    }
    const anchor = clip ? deckY : deckY + biasM;
    cluster.centerY = anchor - localUnderside;
    for (const p of field.particles) {
      if (p.cloudIndex === cluster.index) p.clusterY = cluster.centerY;
    }
  }
}

/** Placed clouds and the hotspot weight the picker used. Not saved. */
export interface DesignerPreviewDebugSnapshot {
  spread: number;
  /** Deck altitude for the coverage sheet (midpoint of the preview min/max). */
  deckY: number;
  /** Same 0–1 value passed as coverageHotspot. */
  supercluster: number;
  /** One marker per accepted site. Each site is one blob. */
  sites: { x: number; y: number; z: number }[];
  /** Preview field settings. Coverage sampling reads the low layer only. */
  settings: CloudSettings;
}

let latestPreviewDebug: DesignerPreviewDebugSnapshot | null = null;

export function readDesignerPreviewDebug(): DesignerPreviewDebugSnapshot | null {
  return latestPreviewDebug;
}

/**
 * Soft-sphere preview field via play generateCloudField (fixed seed, active-genus weights).
 * - particlesHint -> layers.low.particlesMin = particlesMax (per cloud only; genus panel)
 * - layout.density + spread -> derived layers.low.cloudCount
 * - deckMinY/deckMaxY -> low base Y and jitter (preview altitude band)
 * - coverage -> preview layer coverage (not play's)
 * - windSpeed -> preview drift only
 * - typeWeights 100% active genus (genus switcher isolates look)
 * - high layer cloudCount 0 (low-only for genus authoring)
 * Sit/clip: deckBaseFraction + deckPlaneYBiasM stay on the genus profile.
 * Soft shading untouched. Save JSON / play VISUAL untouched.
 */
export function buildDesignerPreviewBank(
  genus: CloudGenus,
  layout: DesignerPreviewLayout = DEFAULT_DESIGNER_PREVIEW_LAYOUT,
): CloudFieldData {
  const genusProfile = getCloudGenusProfile(genus);
  const settings = buildPreviewFieldSettings(genus, layout, genusProfile.particlesHint);
  const field = generateCloudField({
    settings,
    seed: PREVIEW_SEED,
    coverageHotspot: layout.supercluster,
  });
  latestPreviewDebug = {
    spread: field.settings.spread,
    deckY: (layout.deckMinY + layout.deckMaxY) * 0.5,
    supercluster: layout.supercluster,
    sites: field.clusters.map((cluster) => ({
      x: cluster.centerX,
      y: cluster.centerY,
      z: cluster.centerZ,
    })),
    settings: field.settings,
  };
  applyGenusPuffLayoutScales(field, genus);
  applyDesignerWeightSize(field, layout.supercluster);
  const deckMinY = Math.min(layout.deckMinY, layout.deckMaxY);
  const deckMaxY = Math.max(layout.deckMinY, layout.deckMaxY);
  if (deckMaxY - deckMinY <= 1e-3) {
    applySharedDesignerDeckBase(field, deckMinY);
    if (latestPreviewDebug) {
      latestPreviewDebug.sites = field.clusters.map((cluster) => ({
        x: cluster.centerX,
        y: cluster.centerY,
        z: cluster.centerZ,
      }));
    }
  }
  return field;
}
