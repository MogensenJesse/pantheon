// src/world/grass/grassFieldMetrics.ts — derive per-ring wrap tile from radius + density

export interface GrassRingAuthored {
  /** Ring thickness (m) for this LOD; cumulative outer = sum of all radii through this ring. */
  radius: number;
  densityPerM2: number;
  bladeWidth: number;
  segments: number;
}

export interface GrassRingDerived extends GrassRingAuthored {
  innerRadius: number;
  /** Cumulative outer edge (m) from player center. */
  outerRadius: number;
  tileSize: number;
  bladesPerSide: number;
  instanceCount: number;
  bladeSpacing: number;
  /** Actual ρ after clamping (blades / m²). */
  effectiveDensityPerM2: number;
}

export interface GrassRingsDerived {
  rings: [GrassRingDerived, GrassRingDerived, GrassRingDerived];
  totalInstances: number;
}

const DEFAULT_MAX_INSTANCES_PER_RING = 600_000;
const DEFAULT_MAX_BLADES_PER_SIDE = 1024;
const DEFAULT_MIN_BLADES_PER_SIDE = 8;

export function deriveGrassRingLayout(
  ring: GrassRingAuthored,
  innerRadius: number,
  maxInstancesPerRing = DEFAULT_MAX_INSTANCES_PER_RING,
): GrassRingDerived {
  const ringWidth = Math.max(1, ring.radius);
  const densityPerM2 = Math.max(0.05, ring.densityPerM2);
  const bladeWidth = Math.max(0.005, ring.bladeWidth);
  const segments = Math.max(1, Math.round(ring.segments));
  const inner = Math.max(0, innerRadius);
  const outerRadius = inner + ringWidth;

  const tileSize = outerRadius * 2;
  const bladeSpacing = 1 / Math.sqrt(densityPerM2);
  let bladesPerSide = Math.round(tileSize / bladeSpacing);
  bladesPerSide = Math.max(DEFAULT_MIN_BLADES_PER_SIDE, bladesPerSide);

  const maxSideFromInstances = Math.floor(Math.sqrt(maxInstancesPerRing));
  bladesPerSide = Math.min(bladesPerSide, DEFAULT_MAX_BLADES_PER_SIDE, maxSideFromInstances);

  const actualTileSize = bladesPerSide * bladeSpacing;
  const instanceCount = bladesPerSide * bladesPerSide;
  const effectiveDensityPerM2 = instanceCount / (actualTileSize * actualTileSize);

  return {
    radius: ringWidth,
    innerRadius: inner,
    outerRadius,
    densityPerM2,
    bladeWidth,
    segments,
    tileSize: actualTileSize,
    bladesPerSide,
    instanceCount,
    bladeSpacing,
    effectiveDensityPerM2,
  };
}

export function deriveGrassRingsLayout(
  rings: [GrassRingAuthored, GrassRingAuthored, GrassRingAuthored],
  maxInstancesPerRing = DEFAULT_MAX_INSTANCES_PER_RING,
): GrassRingsDerived {
  let prevOuter = 0;
  const derived = rings.map((ring) => {
    const layout = deriveGrassRingLayout(ring, prevOuter, maxInstancesPerRing);
    prevOuter = layout.outerRadius;
    return layout;
  }) as [GrassRingDerived, GrassRingDerived, GrassRingDerived];

  return {
    rings: derived,
    totalInstances: derived.reduce((sum, r) => sum + r.instanceCount, 0),
  };
}

/** Writable ring entry (VISUAL.grass.rings[i] or devSettings.grass.rings[i]). */
export function syncGrassRingDerived(
  ring: GrassRingAuthored & {
    innerRadius?: number;
    outerRadius?: number;
    tileSize?: number;
    bladesPerSide?: number;
    instanceCount?: number;
  },
  innerRadius: number,
  maxInstancesPerRing?: number,
): GrassRingDerived {
  const derived = deriveGrassRingLayout(ring, innerRadius, maxInstancesPerRing);
  ring.innerRadius = derived.innerRadius;
  ring.outerRadius = derived.outerRadius;
  ring.tileSize = derived.tileSize;
  ring.bladesPerSide = derived.bladesPerSide;
  ring.instanceCount = derived.instanceCount;
  return derived;
}

export function syncAllGrassRingsDerived(
  rings: [
    GrassRingAuthored & {
      innerRadius?: number;
      outerRadius?: number;
      tileSize?: number;
      bladesPerSide?: number;
      instanceCount?: number;
    },
    GrassRingAuthored & {
      innerRadius?: number;
      outerRadius?: number;
      tileSize?: number;
      bladesPerSide?: number;
      instanceCount?: number;
    },
    GrassRingAuthored & {
      innerRadius?: number;
      outerRadius?: number;
      tileSize?: number;
      bladesPerSide?: number;
      instanceCount?: number;
    },
  ],
  maxInstancesPerRing?: number,
): GrassRingsDerived {
  let prevOuter = 0;
  const derived = rings.map((ring) => {
    const layout = syncGrassRingDerived(ring, prevOuter, maxInstancesPerRing);
    prevOuter = layout.outerRadius;
    return layout;
  }) as [GrassRingDerived, GrassRingDerived, GrassRingDerived];

  return {
    rings: derived,
    totalInstances: derived.reduce((sum, r) => sum + r.instanceCount, 0),
  };
}

export function formatGrassRingSummary(ring: GrassRingDerived, index: number): string {
  const densityNote =
    Math.abs(ring.effectiveDensityPerM2 - ring.densityPerM2) > ring.densityPerM2 * 0.02
      ? ` (~${ring.effectiveDensityPerM2.toFixed(1)}/m² capped)`
      : '';
  return `LOD${index}: ${ring.instanceCount.toLocaleString()} (${ring.bladesPerSide}/side, ${ring.radius.toFixed(0)}m band → ${ring.innerRadius.toFixed(0)}–${ring.outerRadius.toFixed(0)}m, ${ring.segments} seg${densityNote})`;
}

export function formatGrassRingsSummary(layout: GrassRingsDerived): string {
  const parts = layout.rings.map((r, i) => formatGrassRingSummary(r, i));
  return `${parts.join(' | ')} · total ${layout.totalInstances.toLocaleString()}`;
}
