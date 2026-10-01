// src/world/grass/config/grassFieldMetrics.ts — derive per-ring wrap tile from radius + density
import { VISUAL } from '../../../config/visualTuning';

export interface GrassRingAuthored {
  /**
   * Full-density band thickness (m). Cumulative full outer = sum of radii through this ring.
   * Fade-out (if any) extends beyond this into the next ring’s start.
   */
  radius: number;
  densityPerM2: number;
  bladeWidth: number;
  segments: number;
  /** Outer fade-out length (m) past `radius`; the next ring is already full there. */
  fadeOutM: number;
  /** Fade-in length (m) from the inner edge (density and blade length); 0 = full from the inner edge. */
  fadeInM: number;
}

export interface GrassRingDerived extends Omit<GrassRingAuthored, 'fadeOutM' | 'fadeInM'> {
  /** Cull/tile inner edge (m). The next ring starts here at full strength. */
  innerRadius: number;
  /** Cull/tile outer edge (m) — authored full outer + fade band (fade-out skirt). */
  outerRadius: number;
  /** Outer fade-out length (m). Height and density lerp to 0 across this skirt. */
  fadeBandM: number;
  /** Inner fade-in length (m). 0 = full strength from the inner edge. */
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

const DEFAULT_MAX_INSTANCES_PER_RING: number = VISUAL.grass.maxInstancesPerRing;
const DEFAULT_MAX_BLADES_PER_SIDE: number = VISUAL.grass.maxBladesPerSide;
const DEFAULT_MIN_BLADES_PER_SIDE = 8;

export interface DeriveGrassRingOptions {
  /** Hard cap on blades along one tile edge. */
  maxBladesPerSide?: number;
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

  // Cull outer = authored full outer + fade-out; the next ring still starts at the authored
  // boundary, so the overlap equals the fade-out.
  const fadeBand = Math.max(0, ring.fadeOutM);
  const fadeInBand = Math.max(0, ring.fadeInM);
  // Hard start at authored inner (next ring is already full here). Fade extends past full outer.
  const cullInner = authoredInner;
  const cullOuter = authoredOuter + fadeBand;

  const desiredTileSize = cullOuter * 2;
  const authoredSpacing = 1 / Math.sqrt(densityPerM2);
  const unconstrainedSide = Math.round(desiredTileSize / authoredSpacing);
  const maxBladesPerSide = Math.max(
    DEFAULT_MIN_BLADES_PER_SIDE,
    Math.floor(opts.maxBladesPerSide ?? DEFAULT_MAX_BLADES_PER_SIDE),
  );
  const maxSideFromInstances = Math.floor(Math.sqrt(maxInstancesPerRing));
  const bladesPerSide = Math.min(
    Math.max(DEFAULT_MIN_BLADES_PER_SIDE, unconstrainedSide),
    maxBladesPerSide,
    maxSideFromInstances,
  );

  // Instance/side caps keep authored reach and thin spacing. Shrinking the wrap
  // tile used to eat the far fade band and hard-cut the field (~square disk edge).
  let tileSize: number;
  let bladeSpacing: number;
  if (bladesPerSide < unconstrainedSide) {
    tileSize = desiredTileSize;
    bladeSpacing = tileSize / bladesPerSide;
  } else {
    bladeSpacing = authoredSpacing;
    tileSize = bladesPerSide * bladeSpacing;
  }

  const instanceCount = bladesPerSide * bladesPerSide;
  const effectiveDensityPerM2 = instanceCount / (tileSize * tileSize);

  const maxReach = tileSize * 0.5;
  const cullOuterClamped = Math.min(cullOuter, maxReach);
  const fadeBudget = Math.max(0, cullOuterClamped - cullInner);
  const effectiveFade = Math.min(fadeBand, fadeBudget);

  return {
    radius: ringWidth,
    innerRadius: cullInner,
    outerRadius: cullOuterClamped,
    fadeBandM: effectiveFade,
    fadeInBandM: fadeInBand,
    densityPerM2,
    bladeWidth,
    segments,
    tileSize,
    bladesPerSide,
    instanceCount,
    bladeSpacing,
    effectiveDensityPerM2,
  };
}

export function deriveGrassRingsLayout(
  rings: [GrassRingAuthored, GrassRingAuthored, GrassRingAuthored],
  maxInstancesPerRing = DEFAULT_MAX_INSTANCES_PER_RING,
  maxBladesPerSide = DEFAULT_MAX_BLADES_PER_SIDE,
): GrassRingsDerived {
  let authoredOuter = 0;
  const derived = rings.map((ring) => {
    const layout = deriveGrassRingLayout(ring, authoredOuter, maxInstancesPerRing, {
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
