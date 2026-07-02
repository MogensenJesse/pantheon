// src/world/terrain/tsl/terrainClipmapOpacityTsl.ts — detail ring fade + complementary mesh visibility
import { Fn, float, length, max, smoothstep } from 'three/tsl';
import type { TerrainSplatUniforms } from '../material/biomeSplatUniforms';

type TslNode = any;

/** Play LOD layer cutout — shared by material.alphaTest and fragment early-discard. */
export const TERRAIN_LAYER_ALPHA_TEST = 0.42;

export function createTerrainClipmapTsl(uniforms: TerrainSplatUniforms) {
  const { uDetailPatchOrigin, uDetailRadiusM, uDetailDispFadeStartM, uLayerFadeBandM } =
    uniforms as any;

  const detailDiskDistanceM = Fn(([worldXZ]: TslNode[]) => length(worldXZ.sub(uDetailPatchOrigin)));

  /**
   * Shared radial weight for detail disp + layer handoff.
   * Full strength inside fadeStart; smoothstep to 0 at detailRadiusM.
   * fadeStart = max(detailDispFadeStartM, detailRadiusM - layerFadeBandM).
   */
  const detailDispRadialWeight = Fn(([worldXZ]: TslNode[]) => {
    const dist = detailDiskDistanceM(worldXZ);
    const fadeStart = max(uDetailDispFadeStartM, uDetailRadiusM.sub(uLayerFadeBandM));
    return float(1).sub(smoothstep(fadeStart, uDetailRadiusM, dist));
  });

  /** Fine layer — same curve as detail disp (option B). */
  const detailDiskOpacity = detailDispRadialWeight;

  /** Coarse layer — complementary (option A soft band via shared smoothstep). */
  const macroExteriorOpacity = Fn(([worldXZ]: TslNode[]) =>
    float(1).sub(detailDispRadialWeight(worldXZ)),
  );

  return {
    detailDiskDistanceM,
    detailDispRadialWeight,
    detailDiskOpacity,
    macroExteriorOpacity,
  };
}

export type TerrainClipmapTsl = ReturnType<typeof createTerrainClipmapTsl>;
