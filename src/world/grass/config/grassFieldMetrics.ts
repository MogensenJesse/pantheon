// src/world/grass/config/grassFieldMetrics.ts — derive per-ring wrap tile from radius + density

export interface GrassRingAuthored {
  /**
   * Full-density band thickness (m). Cumulative full outer = sum of radii through this ring.
   * Fade-out (if any) extends beyond this into the next ring’s start.
   */
  radius: number;
  densityPerM2: number;
  bladeWidth: number;
  segments: number;
}

export interface GrassRingDerived extends GrassRingAuthored {
  /** Cull/tile inner edge (m) — hard start; next ring begins here at full strength. */
  innerRadius: number;
  /** Cull/tile outer edge (m) — authored full outer + fade band (fade-out skirt). */
  outerRadius: number;
  /** Outer fade-out length (m) used for this ring’s soft skirt. */
  fadeBandM: number;
  /** Inner fade-in length (m); 0 = hard start (LOD0/LOD1). */
  fadeInBandM: number;
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

export interface DeriveGrassRingOptions {
  /**
   * Outer fade-out length (m). Cull outer = authored full outer + this;
   * next ring still starts at the authored full boundary (overlap = fade band).
   */
  ringFadeBandM?: number;
  /** Inner fade-in length (m); 0 = hard step at cull inner. */
  ringFadeInBandM?: number;
  /** Hard cap on blades along one tile edge. */
  maxBladesPerSide?: number;
}

/** LOD0 uses fade01; LOD1 and LOD2 use fade12 (mid/far edge + far soft skirt). */
export function fadeBandForRingIndex(
  ringIndex: number,
  fadeLod01M: number,
  fadeLod12M: number,
): number {
  return ringIndex === 0 ? Math.max(0, fadeLod01M) : Math.max(0, fadeLod12M);
}

/** Only LOD2 gets a short inner fade-in at the mid/far boundary. */
export function fadeInBandForRingIndex(ringIndex: number, fadeInLod2M: number): number {
  return ringIndex === 2 ? Math.max(0, fadeInLod2M) : 0;
}

export function deriveGrassRingLayout(
  ring: GrassRingAuthored,
  authoredInnerRadius: number,
  maxInstancesPerRing = DEFAULT_MAX_INSTANCES_PER_RING,
  opts: DeriveGrassRingOptions = {},
): GrassRingDerived {
  const ringWidth = Math.max(1, ring.radius);
  const densityPerM2 = Math.max(0.05, ring.densityPerM2);
  const bladeWidth = Math.max(0.005, ring.bladeWidth);
  const segments = Math.max(1, Math.round(ring.segments));
  const authoredInner = Math.max(0, authoredInnerRadius);
  const authoredOuter = authoredInner + ringWidth;

  const fadeBand = Math.max(0, opts.ringFadeBandM ?? 0);
  const fadeInBand = Math.max(0, opts.ringFadeInBandM ?? 0);
  // Hard start at authored inner (next ring is already full here). Fade extends past full outer.
  const cullInner = authoredInner;
  const cullOuter = authoredOuter + fadeBand;

  const tileSize = cullOuter * 2;
  const bladeSpacing = 1 / Math.sqrt(densityPerM2);
  let bladesPerSide = Math.round(tileSize / bladeSpacing);
  bladesPerSide = Math.max(DEFAULT_MIN_BLADES_PER_SIDE, bladesPerSide);

  const maxBladesPerSide = Math.max(
    DEFAULT_MIN_BLADES_PER_SIDE,
    Math.floor(opts.maxBladesPerSide ?? DEFAULT_MAX_BLADES_PER_SIDE),
  );
  const maxSideFromInstances = Math.floor(Math.sqrt(maxInstancesPerRing));
  bladesPerSide = Math.min(bladesPerSide, maxBladesPerSide, maxSideFromInstances);

  const actualTileSize = bladesPerSide * bladeSpacing;
  const instanceCount = bladesPerSide * bladesPerSide;
  const effectiveDensityPerM2 = instanceCount / (actualTileSize * actualTileSize);

  // Keep annulus/fade honest when the side cap shrinks the wrap tile.
  const maxReach = actualTileSize * 0.5;
  const cullOuterClamped = Math.min(cullOuter, maxReach);
  const effectiveFade = Math.max(0, cullOuterClamped - authoredOuter);

  return {
    radius: ringWidth,
    innerRadius: cullInner,
    outerRadius: cullOuterClamped,
    fadeBandM: effectiveFade,
    fadeInBandM: fadeInBand,
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
  ringFadeBandM = 0,
  ringFadeBandLod12M = ringFadeBandM,
  maxBladesPerSide = DEFAULT_MAX_BLADES_PER_SIDE,
  ringFadeInLod2M = 0,
): GrassRingsDerived {
  let authoredOuter = 0;
  const derived = rings.map((ring, i) => {
    const layout = deriveGrassRingLayout(ring, authoredOuter, maxInstancesPerRing, {
      ringFadeBandM: fadeBandForRingIndex(i, ringFadeBandM, ringFadeBandLod12M),
      ringFadeInBandM: fadeInBandForRingIndex(i, ringFadeInLod2M),
      maxBladesPerSide,
    });
    authoredOuter += Math.max(1, ring.radius);
    return layout;
  }) as [GrassRingDerived, GrassRingDerived, GrassRingDerived];

  return {
    rings: derived,
    totalInstances: derived.reduce((sum, r) => sum + r.instanceCount, 0),
  };
}

/** Writable derived layout cache (parallel to authored ring inputs). */
export type GrassRingDerivedCache = Pick<
  GrassRingDerived,
  | 'innerRadius'
  | 'outerRadius'
  | 'tileSize'
  | 'bladesPerSide'
  | 'instanceCount'
  | 'fadeBandM'
  | 'fadeInBandM'
>;

export function syncGrassRingDerived(
  ring: GrassRingAuthored,
  derived: GrassRingDerivedCache,
  authoredInnerRadius: number,
  maxInstancesPerRing?: number,
  opts: DeriveGrassRingOptions = {},
): GrassRingDerived {
  const layout = deriveGrassRingLayout(ring, authoredInnerRadius, maxInstancesPerRing, opts);
  derived.innerRadius = layout.innerRadius;
  derived.outerRadius = layout.outerRadius;
  derived.tileSize = layout.tileSize;
  derived.bladesPerSide = layout.bladesPerSide;
  derived.instanceCount = layout.instanceCount;
  derived.fadeBandM = layout.fadeBandM;
  derived.fadeInBandM = layout.fadeInBandM;
  return layout;
}

export function syncAllGrassRingsDerived(
  rings: [GrassRingAuthored, GrassRingAuthored, GrassRingAuthored],
  ringDerived: [GrassRingDerivedCache, GrassRingDerivedCache, GrassRingDerivedCache],
  maxInstancesPerRing?: number,
  ringFadeBandM = 0,
  ringFadeBandLod12M = ringFadeBandM,
  maxBladesPerSide = DEFAULT_MAX_BLADES_PER_SIDE,
  ringFadeInLod2M = 0,
): GrassRingsDerived {
  let authoredOuter = 0;
  const derived = rings.map((ring, i) => {
    const layout = syncGrassRingDerived(ring, ringDerived[i]!, authoredOuter, maxInstancesPerRing, {
      ringFadeBandM: fadeBandForRingIndex(i, ringFadeBandM, ringFadeBandLod12M),
      ringFadeInBandM: fadeInBandForRingIndex(i, ringFadeInLod2M),
      maxBladesPerSide,
    });
    authoredOuter += Math.max(1, ring.radius);
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
  const reach = ring.tileSize * 0.5;
  const authoredFullOuter = ring.innerRadius + ring.radius;
  const truncNote = reach + 0.05 < authoredFullOuter ? ` [tile caps @±${reach.toFixed(0)}m]` : '';
  const fadeNote = ring.fadeBandM > 0 ? ` + ${ring.fadeBandM.toFixed(0)}m fade` : '';
  return `LOD${index}: ${ring.instanceCount.toLocaleString()} (${ring.bladesPerSide}/side, ${ring.radius.toFixed(0)}m full${fadeNote} → ${ring.innerRadius.toFixed(0)}–${ring.outerRadius.toFixed(0)}m, ${ring.segments} seg${densityNote}${truncNote})`;
}

export function formatGrassRingsSummary(layout: GrassRingsDerived): string {
  const ringSummaries = layout.rings.map((r, i) => formatGrassRingSummary(r, i));
  return `${ringSummaries.join(' | ')} · total ${layout.totalInstances.toLocaleString()}`;
}
