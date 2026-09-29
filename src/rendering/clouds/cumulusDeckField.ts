// src/rendering/clouds/cumulusDeckField.ts — cumulus deck field for play and the editor
import type { CloudSettings } from './cloudConfig';
import { readCloudSettings } from './cloudConfig';
import { readCumulusDeck } from './cumulusDeck';
import {
  assignClusterWindMotion,
  type CloudFieldData,
  designerWeightSizeScale,
  generateCloudField,
} from './generateCloudField';

/** Placed clouds and the hotspot weight the picker used. Not saved. */
export interface DesignerPreviewDebugSnapshot {
  spread: number;
  /** Deck altitude for the coverage sheet (midpoint of the preview min/max). */
  deckY: number;
  /** Same 0–1 value passed as coverageHotspot. */
  supercluster: number;
  /** One marker per accepted site. Each site is one blob. */
  sites: { x: number; y: number; z: number }[];
  /** Field settings. Coverage sampling reads the deck coverage. */
  settings: CloudSettings;
}

let latestPreviewDebug: DesignerPreviewDebugSnapshot | null = null;

export function readDesignerPreviewDebug(): DesignerPreviewDebugSnapshot | null {
  return latestPreviewDebug;
}

/**
 * Scale puff offsets after placement. Values come from CloudSettings.
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

/**
 * Radius scales around the anchor.
 * Height grows upward from the underside, so a large cloud does not lift its base.
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
    baseByCloud.set(cluster.index, condensationUndersideY(cluster.particles.map((p) => p.y)));
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
 */
function condensationUndersideY(offsetYs: readonly number[]): number {
  const count = offsetYs.length;
  if (count <= 0) return 0;
  const sorted = [...offsetYs].sort((a, b) => a - b);
  const target = Math.min(count - 1, Math.max(0, Math.floor(count * 0.25)));
  return sorted[target] ?? 0;
}

/**
 * When the deck is one height, sit every cloud on `deckY`.
 * The condensation underside lands on `deckY`; wind adds deck Y bias once.
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
    const localUnderside =
      puffs.length > 0 ? condensationUndersideY(puffs.map((p) => p.offsetY)) : 0;
    cluster.centerY = deckY - localUnderside;
    for (const p of field.particles) {
      if (p.cloudIndex === cluster.index) p.clusterY = cluster.centerY;
    }
  }
}

/** Play and editor field. Look overrides (particles, puff scale) come from the caller. */
export function buildCumulusDeckField(look: CloudSettings = readCloudSettings()): CloudFieldData {
  const deck = readCumulusDeck();
  const particles = Math.max(1, Math.round(look.particles));
  const cloudCount = look.layer.cloudCount;
  const settings: CloudSettings = {
    ...look,
    edgeFadeM: Math.min(look.edgeFadeM, look.spread * 0.5),
    maxInstances: Math.max(look.maxInstances, cloudCount * particles + 64),
  };
  const field = generateCloudField({
    settings,
    seed: deck.seed,
    coverageHotspot: deck.supercluster,
  });
  const deckMinY = Math.min(deck.deckMinY, deck.deckMaxY);
  const deckMaxY = Math.max(deck.deckMinY, deck.deckMaxY);
  latestPreviewDebug = {
    spread: field.settings.spread,
    deckY: (deckMinY + deckMaxY) * 0.5,
    supercluster: deck.supercluster,
    sites: field.clusters.map((cluster) => ({
      x: cluster.centerX,
      y: cluster.centerY,
      z: cluster.centerZ,
    })),
    settings: field.settings,
  };
  applyPuffLayoutScales(field, look.puffRadiusScale, look.puffHeightScale);
  applyDesignerWeightSize(field, deck.supercluster);
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
