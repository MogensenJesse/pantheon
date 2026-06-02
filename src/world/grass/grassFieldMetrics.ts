// src/world/grass/grassFieldMetrics.ts — derive tile grid from field radius + density

export interface GrassFieldAuthored {
  /** Visible grass extent from player (thinning / LOD outer ring). */
  fieldRadius: number;
  lod0Radius: number;
  /** Target blades per m² on the wrap tile (independent of fieldRadius). */
  densityPerM2: number;
  /** Repeating wrap patch size (m); grid is sized from this + density, not from fieldRadius. */
  wrapTileExtentM?: number;
  /** Hard cap on instanced blade count (safety). */
  maxInstances?: number;
  /** Hard cap on grid resolution per axis. */
  maxBladesPerSide?: number;
  minBladesPerSide?: number;
}

export interface GrassFieldDerived {
  fieldRadius: number;
  lod0Radius: number;
  densityPerM2: number;
  tileSize: number;
  bladesPerSide: number;
  instanceCount: number;
  bladeSpacing: number;
  /** Actual ρ after clamping (blades / m²). */
  effectiveDensityPerM2: number;
  lodRadius: number;
  thinningR0: number;
  thinningR1: number;
}

const DEFAULT_WRAP_TILE_EXTENT_M = 64;
const DEFAULT_MAX_INSTANCES = 600_000;
const DEFAULT_MAX_BLADES_PER_SIDE = 1024;
const DEFAULT_MIN_BLADES_PER_SIDE = 16;

export function deriveGrassFieldLayout(authored: GrassFieldAuthored): GrassFieldDerived {
  const fieldRadius = Math.max(8, authored.fieldRadius);
  const lod0Radius = Math.min(Math.max(1, authored.lod0Radius), fieldRadius);
  const densityPerM2 = Math.max(0.05, authored.densityPerM2);
  const wrapExtent = Math.max(16, authored.wrapTileExtentM ?? DEFAULT_WRAP_TILE_EXTENT_M);
  const maxInstances = authored.maxInstances ?? DEFAULT_MAX_INSTANCES;
  const maxBladesPerSide = authored.maxBladesPerSide ?? DEFAULT_MAX_BLADES_PER_SIDE;
  const minBladesPerSide = authored.minBladesPerSide ?? DEFAULT_MIN_BLADES_PER_SIDE;

  const bladeSpacing = 1 / Math.sqrt(densityPerM2);
  let bladesPerSide = Math.round(wrapExtent / bladeSpacing);
  bladesPerSide = Math.max(minBladesPerSide, bladesPerSide);

  const maxSideFromInstances = Math.floor(Math.sqrt(maxInstances));
  bladesPerSide = Math.min(bladesPerSide, maxBladesPerSide, maxSideFromInstances);

  const tileSize = bladesPerSide * bladeSpacing;
  const instanceCount = bladesPerSide * bladesPerSide;
  const effectiveDensityPerM2 = instanceCount / (tileSize * tileSize);

  return {
    fieldRadius,
    lod0Radius,
    densityPerM2,
    tileSize,
    bladesPerSide,
    instanceCount,
    bladeSpacing,
    effectiveDensityPerM2,
    lodRadius: lod0Radius,
    thinningR0: lod0Radius,
    thinningR1: fieldRadius,
  };
}

/** Writable grass settings (VISUAL.grass or devSettings.grass). */
export function syncGrassFieldDerived(g: {
  fieldRadius: number;
  lod0Radius: number;
  densityPerM2: number;
  maxInstances?: number;
  wrapTileExtentM?: number;
  tileSize?: number;
  bladesPerSide?: number;
  lodRadius?: number;
  thinningR0?: number;
  thinningR1?: number;
}): GrassFieldDerived {
  const derived = deriveGrassFieldLayout({
    fieldRadius: g.fieldRadius,
    lod0Radius: g.lod0Radius,
    densityPerM2: g.densityPerM2,
    maxInstances: g.maxInstances,
    wrapTileExtentM: g.wrapTileExtentM,
  });
  g.tileSize = derived.tileSize;
  g.bladesPerSide = derived.bladesPerSide;
  g.lodRadius = derived.lodRadius;
  g.thinningR0 = derived.thinningR0;
  g.thinningR1 = derived.thinningR1;
  return derived;
}

export function formatGrassFieldSummary(derived: GrassFieldDerived): string {
  const densityNote =
    Math.abs(derived.effectiveDensityPerM2 - derived.densityPerM2) > derived.densityPerM2 * 0.02
      ? `, effective ~${derived.effectiveDensityPerM2.toFixed(2)}/m² (capped)`
      : `, ${derived.densityPerM2.toFixed(2)}/m²`;
  return `${derived.instanceCount.toLocaleString()} blades (${derived.bladesPerSide}/side, ${derived.tileSize.toFixed(1)}m wrap tile${densityNote})`;
}
