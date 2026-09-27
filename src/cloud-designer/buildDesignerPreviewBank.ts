// src/cloud-designer/buildDesignerPreviewBank.ts - designer preview via play generateCloudField
import type { CloudSettings } from '../rendering/clouds/cloudConfig';
import { readCloudSettings } from '../rendering/clouds/cloudConfig';
import { genusUsesCondensationClip } from '../rendering/clouds/cloudProfiles';
import {
  cumulusCloudCountForDensity,
  cumulusDeckMaxCloudCount,
  readCumulusDeck,
} from '../rendering/clouds/cumulusDeck';
import { clampCumulusDeckSlider } from '../rendering/clouds/cumulusDeckSliders';
import {
  assignClusterWindMotion,
  type CloudFieldData,
  coveragePickWeight,
  generateCloudField,
} from '../rendering/clouds/generateCloudField';

/** Shared cumulus deck plus the designer sun scrubber. Deck fields are the play field. */
export interface DesignerPreviewLayout {
  /** 0–1 density. 0 = empty, 1 = packed to the generator's 40 m spacing. */
  density: number;
  /** 0–1 play day-cycle phase. Designer sun scrubber only. */
  sunPhase: number;
  /** Lowest cluster altitude (m). Maps to the layer base Y. */
  deckMinY: number;
  /** Highest cluster altitude (m). Span above min is the layer jitter. */
  deckMaxY: number;
  /** Wind-wrap domain (m). */
  spread: number;
  /** Soft opacity fade at the wrap edge (m). Clamped to half the spread. */
  edgeFadeM: number;
  /** 0–1 coverage threshold. */
  coverage: number;
  /** Drift speed. Play wind clock uses the same value. */
  windSpeed: number;
  /**
   * 0–1 pick bias inside the coverage mask. 0 is even weight and 1× size.
   * 1 uses the wide yellow band, tight red spacing, and 0.5×–6× size.
   */
  supercluster: number;
  /** Meters added once to the shared base. Not multiplied by height scale. */
  deckYBiasM: number;
  /** Weather-pattern size (m). Larger cells make bigger banks. */
  bankScaleM: number;
  /** Width of the coverage threshold. */
  bankSoftness: number;
}

/** Placement seed shared with play (`cumulusDeck.seed`). */
export const PREVIEW_SEED = readCumulusDeck().seed;

/** Midday on the play day arc. Designer sun scrubber only. */
export const DEFAULT_PREVIEW_SUN_PHASE = 0.5;

const shippedDeck = readCumulusDeck();

/** Default deck. Same object play reads. */
export const DEFAULT_DESIGNER_PREVIEW_LAYOUT: Readonly<DesignerPreviewLayout> = Object.freeze({
  density: shippedDeck.density,
  sunPhase: DEFAULT_PREVIEW_SUN_PHASE,
  deckMinY: shippedDeck.deckMinY,
  deckMaxY: shippedDeck.deckMaxY,
  spread: shippedDeck.spread,
  edgeFadeM: shippedDeck.edgeFadeM,
  coverage: shippedDeck.coverage,
  windSpeed: shippedDeck.windSpeed,
  supercluster: shippedDeck.supercluster,
  deckYBiasM: shippedDeck.deckYBiasM,
  bankScaleM: shippedDeck.bankScaleM,
  bankSoftness: shippedDeck.bankSoftness,
});

/** Clouds that fit the deck at the generator's 40 m spacing floor. */
export function previewDeckMaxCloudCount(spread = readCumulusDeck().spread): number {
  return cumulusDeckMaxCloudCount(spread);
}

/**
 * Density 0 = empty deck. Any density above 0 places at least one cloud.
 * 1 = packed to `previewDeckMaxCloudCount` (144 on the 480 m deck).
 */
export function previewCloudCountForDensity(
  density: number,
  spread = readCumulusDeck().spread,
): number {
  return cumulusCloudCountForDensity(density, spread);
}

/** Default when shell has not overridden preview chrome (28 clouds on this deck). */
export const DEFAULT_DESIGNER_PREVIEW_DENSITY = readCumulusDeck().density;

/** Keep a partial edit inside the shared deck slider ranges. Min/max stay ordered. */
export function clampDesignerPreviewLayout(
  current: DesignerPreviewLayout,
  partial: Partial<DesignerPreviewLayout>,
): DesignerPreviewLayout {
  const next: DesignerPreviewLayout = { ...current };
  for (const key of Object.keys(partial) as (keyof DesignerPreviewLayout)[]) {
    const value = partial[key];
    if (value === undefined || !Number.isFinite(value)) continue;
    next[key] = clampCumulusDeckSlider(key, value);
  }
  if (partial.deckMinY !== undefined && next.deckMaxY < next.deckMinY) {
    next.deckMaxY = next.deckMinY;
  }
  if (partial.deckMaxY !== undefined && next.deckMinY > next.deckMaxY) {
    next.deckMinY = next.deckMaxY;
  }
  next.edgeFadeM = Math.min(next.edgeFadeM, next.spread * 0.5);
  return next;
}

function cumulusTypeWeights(): CloudSettings['typeWeights'] {
  return { cumulus: 1, stratus: 0, cirrus: 0 };
}

/**
 * Preview cluster count from deck density × preview area.
 * Puff count stays on CloudSettings.
 */
export function resolvePreviewCloudCount(layout: DesignerPreviewLayout): number {
  return previewCloudCountForDensity(layout.density, layout.spread);
}

/** Designer-only settings overlay - does not mutate shipped VISUAL / play readCloudSettings(). */
function buildPreviewFieldSettings(
  layout: DesignerPreviewLayout,
  base: CloudSettings = readCloudSettings(),
): CloudSettings {
  const particles = Math.max(1, Math.round(base.particles));
  const cloudCount = resolvePreviewCloudCount(layout);
  const deckMinY = Math.min(layout.deckMinY, layout.deckMaxY);
  const deckMaxY = Math.max(layout.deckMinY, layout.deckMaxY);
  const settings: CloudSettings = {
    ...base,
    seed: readCumulusDeck().seed,
    spread: layout.spread,
    edgeFadeM: Math.min(layout.edgeFadeM, layout.spread * 0.5),
    windSpeed: layout.windSpeed,
    coverage: layout.coverage,
    typeWeights: cumulusTypeWeights(),
    coverageNoise: {
      cellM: layout.bankScaleM,
      softness: layout.bankSoftness,
    },
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
  return settings;
}

/**
 * Scale puff offsets after placement. Values come from CloudSettings, not the genus profile.
 */
function applyPuffLayoutScales(
  field: CloudFieldData,
  radiusScale: number,
  heightScale: number,
): void {
  const rs = radiusScale;
  const hs = heightScale;
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

function designerWeightSizeScale(density: number, hotspot: number): number {
  const s = Math.max(0, Math.min(1, hotspot));
  if (s <= 1e-6) return 1;
  const deck = readCumulusDeck();
  const weight = coveragePickWeight(density, s);
  const n = Math.max(0, Math.min(1, (weight - (1 - s)) / s));
  const atFull = deck.greenSize + (deck.redSize - deck.greenSize) * n;
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
 * `deckY + cumulusDeck.deckYBiasM` (meters, not multiplied by height scale).
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
    const biasM = readCumulusDeck().deckYBiasM;
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
 * Cumulus field. Placement comes from the shared deck layout.
 * Puff count and scales come from CloudSettings (play dev overrides).
 * High layer count stays 0. Deck fields are not genus Save JSON.
 */
function buildDesignerPreviewBank(
  layout: DesignerPreviewLayout = DEFAULT_DESIGNER_PREVIEW_LAYOUT,
  look: CloudSettings = readCloudSettings(),
): CloudFieldData {
  const deck = readCumulusDeck();
  deck.density = layout.density;
  deck.deckMinY = layout.deckMinY;
  deck.deckMaxY = layout.deckMaxY;
  deck.spread = layout.spread;
  deck.edgeFadeM = layout.edgeFadeM;
  deck.coverage = layout.coverage;
  deck.bankScaleM = layout.bankScaleM;
  deck.bankSoftness = layout.bankSoftness;
  deck.windSpeed = layout.windSpeed;
  deck.supercluster = layout.supercluster;
  deck.deckYBiasM = layout.deckYBiasM;
  const settings = buildPreviewFieldSettings(layout, look);
  const field = generateCloudField({
    settings,
    seed: deck.seed,
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
  applyPuffLayoutScales(field, look.puffRadiusScale, look.puffHeightScale);
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
  assignClusterWindMotion(field);
  return field;
}

/** Play and designer field. An optional layout is written onto the shared deck first. */
export function buildCumulusDeckField(
  look: CloudSettings = readCloudSettings(),
  layout?: DesignerPreviewLayout,
): CloudFieldData {
  if (layout) {
    const deck = readCumulusDeck();
    deck.density = layout.density;
    deck.deckMinY = layout.deckMinY;
    deck.deckMaxY = layout.deckMaxY;
    deck.spread = layout.spread;
    deck.edgeFadeM = layout.edgeFadeM;
    deck.coverage = layout.coverage;
    deck.bankScaleM = layout.bankScaleM;
    deck.bankSoftness = layout.bankSoftness;
    deck.windSpeed = layout.windSpeed;
    deck.supercluster = layout.supercluster;
    deck.deckYBiasM = layout.deckYBiasM;
  }
  const deck = readCumulusDeck();
  return buildDesignerPreviewBank(
    {
      density: deck.density,
      sunPhase: layout?.sunPhase ?? DEFAULT_PREVIEW_SUN_PHASE,
      deckMinY: deck.deckMinY,
      deckMaxY: deck.deckMaxY,
      spread: deck.spread,
      edgeFadeM: deck.edgeFadeM,
      coverage: deck.coverage,
      windSpeed: deck.windSpeed,
      supercluster: deck.supercluster,
      deckYBiasM: deck.deckYBiasM,
      bankScaleM: deck.bankScaleM,
      bankSoftness: deck.bankSoftness,
    },
    look,
  );
}
