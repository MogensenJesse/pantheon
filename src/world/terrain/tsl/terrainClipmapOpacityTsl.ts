// src/world/terrain/tsl/terrainClipmapOpacityTsl.ts — opaque ring coverage + morph weights
import { Fn, float, length, max, mix, smoothstep } from 'three/tsl';
import { VISUAL } from '../../../config/visualTuning';
import type { TerrainSplatUniforms } from '../material/biomeSplatUniforms';

type TslNode = any;

const SEAM_OVERLAP_STEPS = VISUAL.terrain.lod.seamOverlapSteps;

export function createTerrainClipmapTsl(uniforms: TerrainSplatUniforms) {
  const {
    uDetailPatchOrigin,
    uDetailRadiusM,
    uDetailDispFadeStartM,
    uLayerFadeBandM,
    uMacroRadiusM,
    uMacroFadeBandM,
    uLodMidStepM,
    uLodFarStepM,
  } = uniforms as any;

  const detailDiskDistanceM = Fn(([worldXZ]: TslNode[]) => length(worldXZ.sub(uDetailPatchOrigin)));

  const detailFadeStartM = Fn(() =>
    max(uDetailDispFadeStartM, uDetailRadiusM.sub(uLayerFadeBandM)),
  );

  /** Metres the mid mesh draws inside detailRadiusM. */
  const detailSeamOverlapM = Fn(() => uLodMidStepM.mul(float(SEAM_OVERLAP_STEPS)));

  /** Fine geomorph finishes here; mid coverage starts here. */
  const detailSeamInnerM = Fn(() => max(float(0), uDetailRadiusM.sub(detailSeamOverlapM())));

  /** Metres the far mesh draws inside macroRadiusM. */
  const macroSeamOverlapM = Fn(() => uLodFarStepM.mul(float(SEAM_OVERLAP_STEPS)));

  const macroSeamInnerM = Fn(() => max(float(0), uMacroRadiusM.sub(macroSeamOverlapM())));

  /**
   * Crag/detail disp fades to 0 before geomorph completes so the handoff is not a height pop.
   * Completes ~60% of the way through the fade → seam-inner band.
   */
  const detailDispRadialWeight = Fn(([worldXZ]: TslNode[]) => {
    const dist = detailDiskDistanceM(worldXZ);
    const fadeStart = detailFadeStartM();
    const dispFadeEnd = mix(fadeStart, detailSeamInnerM(), float(0.6));
    return float(1).sub(smoothstep(fadeStart, dispFadeEnd, dist));
  });

  /**
   * 1 inside the fine ring, 0 at the seam inner radius. Drives geomorph (1 - this) so
   * heights/normals match the mid mesh before the overlap underlay.
   */
  const detailDiskOpacity = Fn(([worldXZ]: TslNode[]) => {
    const dist = detailDiskDistanceM(worldXZ);
    return float(1).sub(smoothstep(detailFadeStartM(), detailSeamInnerM(), dist));
  });

  /**
   * 1 inside the mid ring, 0 at the macro seam inner radius. Drives mid→far geomorph.
   */
  const macroRadialWeight = Fn(([worldXZ]: TslNode[]) => {
    const dist = detailDiskDistanceM(worldXZ);
    const fadeStart = max(float(0), uMacroRadiusM.sub(uMacroFadeBandM));
    return float(1).sub(smoothstep(fadeStart, macroSeamInnerM(), dist));
  });

  /** Fine draws to detailRadiusM. Mid underlay fills [seamInner, radius). */
  const detailCoverageDiscard = Fn(([worldXZ]: TslNode[]) =>
    detailDiskDistanceM(worldXZ).greaterThanEqual(uDetailRadiusM),
  );

  const midCoverageDiscard = Fn(([worldXZ]: TslNode[]) => {
    const dist = detailDiskDistanceM(worldXZ);
    return dist.lessThan(detailSeamInnerM()).or(dist.greaterThanEqual(uMacroRadiusM));
  });

  const farCoverageDiscard = Fn(([worldXZ]: TslNode[]) =>
    detailDiskDistanceM(worldXZ).lessThan(macroSeamInnerM()),
  );

  return {
    detailDiskDistanceM,
    detailDispRadialWeight,
    macroRadialWeight,
    detailDiskOpacity,
    detailCoverageDiscard,
    midCoverageDiscard,
    farCoverageDiscard,
  };
}

export type TerrainClipmapTsl = ReturnType<typeof createTerrainClipmapTsl>;
