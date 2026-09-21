// src/world/grass/compute/shared/vegetationVisibilityTsl.ts — shared annulus, biome, and frustum cull
import {
  clamp,
  EPSILON,
  float,
  floor,
  max,
  min,
  mix,
  smoothstep,
  step,
  uint,
  vec2,
  vec3,
} from 'three/tsl';
import { worldXZToMapUv } from '../../../../map/mapUvTsl';
import { grassSharedUniforms } from '../../config/grassUniforms';
import { GRASS_CULL_REASON } from '../../tsl/grassCullDebugTsl';
import { grassFrustumVisibility } from '../../tsl/grassFrustumVisibilityTsl';
import type { TslNode } from '../../tsl/tslNode';

/** Manhattan distance (m) — instances inside this radius always draw (False Earth pattern). */
export const NEAR_CAMERA_ALWAYS_VISIBLE = 3;

/** Lattice shifted positive before the u32 cast — WGSL u32(f32) saturates negatives to 0. */
const HASH_CELL_OFFSET = 1 << 20;

export function hashLatticeCell(ix: TslNode, iz: TslNode, salt: TslNode): TslNode {
  const ux = ix.add(HASH_CELL_OFFSET).toUint();
  const uz = iz.add(HASH_CELL_OFFSET).toUint();
  // Integer mix (wrapping u32 mul) so adjacent rows/cols never alias like 6*12.9898 ~ 78.233 did.
  // Inline PCG (same as three/tsl `hash`) so the seed stays uint — Fn(hash) expects float and can
  // coerce large u32 mixes through f32, collapsing thresholds after r186.
  const seed = ux
    .mul(uint(73856093))
    .bitXor(uz.mul(uint(19349663)))
    .add(salt.toUint());
  const state = seed.mul(uint(747796405)).add(uint(2891336453));
  const word = state
    .shiftRight(state.shiftRight(uint(28)).add(uint(4)))
    .bitXor(state)
    .mul(uint(277803737));
  const result = word.shiftRight(uint(22)).bitXor(word);
  return result.toFloat().div(float(4294967296));
}

/** Soft annulus weight in [0,1]. Optional linear fade-in at inner + fade-out at outer. */
export function createInAnnulusMask(
  uInnerRadius: TslNode,
  uOuterRadius: TslNode,
  uFadeBandM: TslNode = float(0),
  uFadeInBandM: TslNode = float(0),
) {
  return (offsetX: TslNode, offsetZ: TslNode): TslNode => {
    const distSq = offsetX.mul(offsetX).add(offsetZ.mul(offsetZ));
    const dist = distSq.sqrt();
    const innerSq = uInnerRadius.mul(uInnerRadius);
    const outerSq = uOuterRadius.mul(uOuterRadius);
    const hard = step(innerSq, distSq).mul(float(1).sub(step(outerSq, distSq)));

    const hardInner = step(uInnerRadius, dist);
    const fadeIn = max(uFadeInBandM, float(1e-4));
    const softInner = clamp(dist.sub(uInnerRadius).div(fadeIn), float(0), float(1));
    const innerEdge = mix(hardInner, softInner, step(float(1e-4), uFadeInBandM));
    const innerFade = mix(float(1), innerEdge, step(float(1e-3), uInnerRadius));

    const fadeOut = max(uFadeBandM, float(1e-4));
    const softOuter = clamp(uOuterRadius.sub(dist).div(fadeOut), float(0), float(1));
    const hardOuter = float(1).sub(step(uOuterRadius, dist));
    const outerFade = mix(hardOuter, softOuter, step(float(1e-4), uFadeBandM));

    const soft = innerFade.mul(outerFade);
    const useSoft = step(float(1e-4), max(uFadeBandM, uFadeInBandM));
    return mix(hard, soft, useSoft);
  };
}

/**
 * Baked R is already a density (meadow 1, forest 0.5, …). A wide smoothstep
 * window (0.25-1.05) treated those mid values as edges and wiped keep.
 * Gate only the last sliver below threshold, then honor the baked weight.
 */
export function createTransitionStrength(threshold: TslNode, fadeWidth: TslNode) {
  return (grassWeight: TslNode): TslNode => {
    const gateFade = min(max(fadeWidth, EPSILON), float(0.15));
    const gate = smoothstep(threshold, threshold.add(gateFade), grassWeight);
    return grassWeight.mul(gate);
  };
}

/**
 * Apply live clump strength / fringe density to a world-stable 0–1 clump baked
 * into grass-data G (coverage + softness already applied on the CPU).
 */
export function vegetationClumpFromBaked(clump: TslNode): {
  heightMask: TslNode;
  keepMask: TslNode;
} {
  const { uClumpStrength, uClumpEdgeDensityBoost } = grassSharedUniforms as any;
  const rim = clump.mul(float(1).sub(clump)).mul(float(4));
  const keepClump = clump.add(rim.mul(uClumpEdgeDensityBoost).mul(float(1).sub(clump)));
  return {
    heightMask: mix(float(1), clump, uClumpStrength),
    keepMask: mix(float(1), keepClump, uClumpStrength),
  };
}

/**
 * One keep test (Revo-style): annulus × biome × screen-projected height, with
 * world-stable hash + hysteresis. `previousKeep` is last frame's drawn bit,
 * zeroed when this instance wrapped to a new world cell.
 */
export function vegetationStochasticKeep(params: {
  worldX: TslNode;
  worldZ: TslNode;
  worldY: TslNode;
  offsetX: TslNode;
  offsetZ: TslNode;
  annulusWeight: TslNode;
  biomeStrength: TslNode;
  bladeHeight: TslNode;
  previousKeep: TslNode;
  cellSpacing: TslNode;
  clumpMask: TslNode;
}): TslNode {
  const { uFy, uProjectedHeightMin, uProjectedHeightFull, uStochasticHysteresis } =
    grassSharedUniforms as any;

  // r186: range must be wrapped XZ length — world−camera/player via Vector3 .x/.z
  // zeroed screen keep. Binary annulus/biome gates; clump still omitted.
  void params.worldY;
  void params.clumpMask;
  const annulusOk = step(float(0.05), params.annulusWeight);
  const biomeOk = step(float(0.05), params.biomeStrength);
  const range = params.offsetX
    .mul(params.offsetX)
    .add(params.offsetZ.mul(params.offsetZ))
    .sqrt()
    .max(EPSILON);
  const projectedBladeHeight = uFy.mul(params.bladeHeight).div(range);
  const screenKeep = smoothstep(uProjectedHeightMin, uProjectedHeightFull, projectedBladeHeight);
  const keepProbability = annulusOk.mul(biomeOk).mul(screenKeep);
  const cellX = floor(params.worldX.div(params.cellSpacing));
  const cellZ = floor(params.worldZ.div(params.cellSpacing));
  const randomThreshold = hashLatticeCell(cellX, cellZ, float(0));
  const enterThreshold = clamp(randomThreshold.add(uStochasticHysteresis), float(0), float(1));
  const stayThreshold = clamp(randomThreshold.sub(uStochasticHysteresis), EPSILON, float(1));
  const enterKeep = step(enterThreshold, keepProbability);
  const stayKeep = step(stayThreshold, keepProbability);
  return mix(enterKeep, stayKeep, params.previousKeep);
}

/** Overlay keep-fail on the frustum/biome reason when cull-debug is on. */
export function vegetationKeepFailReason(
  visible: TslNode,
  keep: TslNode,
  reason: TslNode,
): TslNode {
  const keepFail = visible.mul(float(1).sub(keep));
  return mix(reason, float(GRASS_CULL_REASON.keepFail), step(float(0.5), keepFail));
}

export function createSampleGrassData(
  grassDataTex: TslNode,
  uWorldSize: TslNode,
  uHeightScale: TslNode,
  uSurfaceBias: TslNode,
  sampleTerrainSurfaceY: (worldXZ: TslNode) => TslNode,
) {
  return (worldX: TslNode, worldZ: TslNode) => {
    const mapUv = worldXZToMapUv(worldX, worldZ, uWorldSize);
    const data = grassDataTex.sample(mapUv);
    const worldXZ = vec2(worldX, worldZ);
    const surfaceY = sampleTerrainSurfaceY(worldXZ);
    return {
      heightNorm: surfaceY.div(uHeightScale),
      grassWeight: data.r,
      yOffset: surfaceY.add(uSurfaceBias),
      clump: data.g,
    };
  };
}

/** Baked clump 0–1 — cheap path when terrain Y is already cached. */
export function createSampleGrassClump(grassDataTex: TslNode, uWorldSize: TslNode) {
  return (worldX: TslNode, worldZ: TslNode): TslNode => {
    const mapUv = worldXZToMapUv(worldX, worldZ, uWorldSize);
    return grassDataTex.sample(mapUv).g;
  };
}

export function createPropGrassInfluence(propInfluenceTex: TslNode, uWorldSize: TslNode) {
  return (worldX: TslNode, worldZ: TslNode): TslNode => {
    const uv = worldXZToMapUv(worldX, worldZ, uWorldSize);
    return propInfluenceTex.sample(uv).r;
  };
}

export interface VegetationVisibilitySample {
  offsetX: TslNode;
  offsetZ: TslNode;
  worldX: TslNode;
  worldZ: TslNode;
  yOffset: TslNode;
  grassWeight: TslNode;
  annulusWeight: TslNode;
  biomeStrength: TslNode;
}

export function createBuildVisibility({
  frustumBoundsRadius = null,
  nearCameraDist = float(NEAR_CAMERA_ALWAYS_VISIBLE),
  propGrassInfluence,
  uPropGrassCullThreshold,
}: {
  frustumBoundsRadius?: TslNode | null;
  nearCameraDist?: TslNode;
  propGrassInfluence: (worldX: TslNode, worldZ: TslNode) => TslNode;
  uPropGrassCullThreshold: TslNode;
}) {
  return (sample: VegetationVisibilitySample) => {
    const worldPos = vec3(sample.worldX, sample.yOffset, sample.worldZ);
    const insideAnn = step(float(0.05), sample.annulusWeight);
    const biomeOk = step(float(0.05), sample.biomeStrength);
    const frustumVis = grassFrustumVisibility(worldPos, frustumBoundsRadius);

    const manhattan = sample.offsetX.abs().add(sample.offsetZ.abs());
    const isCloseEnough = float(1).sub(step(nearCameraDist, manhattan));
    const biomeVis = insideAnn.mul(biomeOk);
    const nearPath = isCloseEnough.mul(biomeVis);
    const frustumPath = frustumVis.mul(biomeVis);
    const baseVisible = max(nearPath, frustumPath);
    const propOk = step(uPropGrassCullThreshold, propGrassInfluence(sample.worldX, sample.worldZ));
    const visible = baseVisible.mul(propOk);

    if (!import.meta.env.DEV) {
      return { visible, reason: float(0) };
    }

    const reasonOutside = float(GRASS_CULL_REASON.outsideAnnulus);
    const reasonBiome = float(GRASS_CULL_REASON.biomeFail);
    const reasonFrustumFail = float(GRASS_CULL_REASON.frustumFail);
    const reasonFrustumOk = float(GRASS_CULL_REASON.visibleFrustum);
    const reasonNear = float(GRASS_CULL_REASON.visibleNear);
    const reasonPropExclusion = float(GRASS_CULL_REASON.propExclusion);
    const biomeFail = insideAnn.mul(float(1).sub(biomeOk));
    const propFail = baseVisible.mul(float(1).sub(propOk));
    const frustumFail = insideAnn.mul(biomeOk).mul(float(1).sub(max(nearPath, frustumVis)));
    let reason: TslNode = mix(reasonOutside, reasonBiome, step(float(0.5), biomeFail));
    reason = mix(reason, reasonFrustumFail, step(float(0.5), frustumFail));
    reason = mix(reason, reasonPropExclusion, (step as any)(float(0.5), propFail));
    reason = mix(reason, reasonFrustumOk, step(float(0.5), frustumPath));
    reason = mix(reason, reasonNear, (step as any)(float(0.5), nearPath));
    return { visible, reason };
  };
}
