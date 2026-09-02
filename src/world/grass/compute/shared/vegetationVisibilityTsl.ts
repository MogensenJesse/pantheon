// src/world/grass/compute/shared/vegetationVisibilityTsl.ts — shared annulus, biome, and frustum cull
import {
  clamp,
  EPSILON,
  float,
  floor,
  hash,
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
import {
  grassFrustumBypassActive,
  grassFrustumVisibility,
} from '../../tsl/grassFrustumVisibilityTsl';
import type { TslNode } from '../../tsl/tslNode';

/** Manhattan distance (m) — instances inside this radius always draw (False Earth pattern). */
export const NEAR_CAMERA_ALWAYS_VISIBLE = 3;

/** Lattice shifted positive before the u32 cast — WGSL u32(f32) saturates negatives to 0. */
const HASH_CELL_OFFSET = 1 << 20;

function hashLatticeCell(ix: TslNode, iz: TslNode, salt: TslNode): TslNode {
  const ux = ix.add(HASH_CELL_OFFSET).toUint();
  const uz = iz.add(HASH_CELL_OFFSET).toUint();
  // Integer mix (wrapping u32 mul) so adjacent rows/cols never alias like 6*12.9898 ≈ 78.233 did.
  return hash(
    ux
      .mul(uint(73856093))
      .bitXor(uz.mul(uint(19349663)))
      .add(salt.toUint()),
  );
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
 * Baked G is already a density (meadow 1, forest 0.5, …). A wide smoothstep
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

/** Hermite-interpolated value noise in ~0…1. `invScale` is 1 / lattice size in meters. */
function vegetationValueNoise2(
  worldX: TslNode,
  worldZ: TslNode,
  invScale: TslNode,
  salt: TslNode,
): TslNode {
  const gx = worldX.mul(invScale);
  const gz = worldZ.mul(invScale);
  const x0 = floor(gx);
  const z0 = floor(gz);
  const fx = gx.sub(x0);
  const fz = gz.sub(z0);
  const ux = fx.mul(fx).mul(float(3).sub(fx.mul(2)));
  const uz = fz.mul(fz).mul(float(3).sub(fz.mul(2)));
  const n00 = hashLatticeCell(x0, z0, salt);
  const n10 = hashLatticeCell(x0.add(1), z0, salt);
  const n01 = hashLatticeCell(x0, z0.add(1), salt);
  const n11 = hashLatticeCell(x0.add(1), z0.add(1), salt);
  return mix(mix(n00, n10, ux), mix(n01, n11, ux), uz);
}

/**
 * World-stable clump masks in [0,1]. Strength 0 → both 1 (keep/scale unchanged).
 * `heightMask` fades blade scale at the fringe; `keepMask` boosts fringe density.
 */
export function vegetationClumpMask(
  worldX: TslNode,
  worldZ: TslNode,
): { heightMask: TslNode; keepMask: TslNode } {
  const { uClumpStrength, uClumpScaleM, uClumpCoverage, uClumpSoftness, uClumpEdgeDensityBoost } =
    grassSharedUniforms as any;
  const invScale = float(1).div(max(uClumpScaleM, float(1e-3)));
  const n0 = vegetationValueNoise2(worldX, worldZ, invScale, float(0));
  const n1 = vegetationValueNoise2(worldX, worldZ, invScale.mul(2), float(17.13));
  const noise = n0.mul(0.65).add(n1.mul(0.35));
  const lo = clamp(float(1).sub(uClumpCoverage).sub(uClumpSoftness), float(0), float(1));
  const hi = clamp(float(1).sub(uClumpCoverage).add(uClumpSoftness), float(0), float(1));
  const clump = smoothstep(lo, max(hi, lo.add(EPSILON)), noise);
  // 4x(1-x) peaks at 1 in the mid-fringe, 0 in the core and outside.
  const rim = clump.mul(float(1).sub(clump)).mul(float(4));
  const rimBoost = rim.mul(uClumpEdgeDensityBoost);
  const keepClump = clump.add(rimBoost.mul(float(1).sub(clump)));
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
  annulusWeight: TslNode;
  biomeStrength: TslNode;
  bladeHeight: TslNode;
  previousKeep: TslNode;
  cellSpacing: TslNode;
  clumpMask: TslNode;
}): TslNode {
  const { uFy, uCameraPosition, uProjectedHeightMin, uProjectedHeightFull, uStochasticHysteresis } =
    grassSharedUniforms as any;

  const worldPos = vec3(params.worldX, params.worldY, params.worldZ);
  const cameraDistance = worldPos.distance(uCameraPosition).max(EPSILON);
  const projectedBladeHeight = uFy.mul(params.bladeHeight).div(cameraDistance);
  const screenKeep = smoothstep(uProjectedHeightMin, uProjectedHeightFull, projectedBladeHeight);
  const keepProbability = params.annulusWeight
    .mul(params.biomeStrength)
    .mul(screenKeep)
    .mul(params.clumpMask);
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
  uSurfaceBias: TslNode | null = null,
  sampleTerrainSurfaceY: ((worldXZ: TslNode) => TslNode) | null = null,
  sampleTerrainSurfacePosition: ((worldXZ: TslNode) => TslNode) | null = null,
) {
  return (worldX: TslNode, worldZ: TslNode) => {
    const mapUv = worldXZToMapUv(worldX, worldZ, uWorldSize);
    const data = grassDataTex.sample(mapUv);
    const grassWeight = data.g;
    const worldXZ = vec2(worldX, worldZ);
    // Prefer full terrain surface Y (macro + detail disp) so packed height matches draw.
    let surfaceY: TslNode = data.r.mul(uHeightScale);
    let surfaceXZ: TslNode = worldXZ;
    if (sampleTerrainSurfacePosition) {
      const surfacePos = sampleTerrainSurfacePosition(worldXZ);
      surfaceY = surfacePos.y;
      surfaceXZ = surfacePos.xz;
    } else if (sampleTerrainSurfaceY) {
      surfaceY = sampleTerrainSurfaceY(worldXZ);
    }
    let yOffset: TslNode = surfaceY;
    if (uSurfaceBias) {
      yOffset = yOffset.add(uSurfaceBias);
    }
    const heightNorm = surfaceY.div(uHeightScale);
    return { heightNorm, grassWeight, yOffset, surfaceXZ };
  };
}

/** Cheap biome mask only — skip terrain displacement (flower cache-hit path). */
export function createSampleGrassWeight(grassDataTex: TslNode, uWorldSize: TslNode) {
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

export function createBuildVisibility({
  inAnnulusMask,
  transitionStrength,
  uPlayerPosition,
  frustumBoundsRadius = null,
  nearCameraDist = float(NEAR_CAMERA_ALWAYS_VISIBLE),
  propGrassInfluence = null,
  uPropGrassCullThreshold = null,
}: {
  inAnnulusMask: (offsetX: TslNode, offsetZ: TslNode) => TslNode;
  transitionStrength: (grassWeight: TslNode) => TslNode;
  uPlayerPosition: TslNode;
  frustumBoundsRadius?: TslNode | null;
  nearCameraDist?: TslNode;
  propGrassInfluence?: ((worldX: TslNode, worldZ: TslNode) => TslNode) | null;
  uPropGrassCullThreshold?: TslNode | null;
}) {
  const reasonOutside = float(GRASS_CULL_REASON.outsideAnnulus);
  const reasonBiome = float(GRASS_CULL_REASON.biomeFail);
  const reasonFrustumFail = float(GRASS_CULL_REASON.frustumFail);
  const reasonFrustumOk = float(GRASS_CULL_REASON.visibleFrustum);
  const reasonNear = float(GRASS_CULL_REASON.visibleNear);
  const reasonBypass = float(GRASS_CULL_REASON.visibleFrustumBypass);
  const reasonPropExclusion = float(GRASS_CULL_REASON.propExclusion);

  return (offsetX: TslNode, offsetZ: TslNode, yOffset: TslNode, grassWeight: TslNode) => {
    const worldX = offsetX.add(uPlayerPosition.x);
    const worldZ = offsetZ.add(uPlayerPosition.z);
    const worldPos = vec3(worldX, yOffset, worldZ);

    // Soft weight → binary membership for cull-debug reasons / biome gate
    const annulusWeight = inAnnulusMask(offsetX, offsetZ);
    const insideAnn = step(float(0.05), annulusWeight);
    const outsideAnn = float(1).sub(insideAnn);
    const strength = transitionStrength(grassWeight);
    const propInfluence = propGrassInfluence ? propGrassInfluence(worldX, worldZ) : float(1);
    const biomeOk = step(float(0.05), strength);
    const biomeFail = insideAnn.mul(float(1).sub(biomeOk));
    const frustumVis = grassFrustumVisibility(worldPos, frustumBoundsRadius);
    const frustumBypass = grassFrustumBypassActive();

    const manhattan = offsetX.abs().add(offsetZ.abs());
    const isCloseEnough = float(1).sub(step(nearCameraDist, manhattan));
    const biomeVis = insideAnn.mul(biomeOk);
    const nearPath = isCloseEnough.mul(biomeVis);
    const frustumPath = frustumVis.mul(biomeVis);
    const baseVisible = max(nearPath, frustumPath);
    const propOk =
      propGrassInfluence && uPropGrassCullThreshold
        ? step(uPropGrassCullThreshold, propInfluence)
        : float(1);
    const propFail = baseVisible.mul(float(1).sub(propOk));
    const visible = baseVisible.mul(propOk);
    const frustumFail = insideAnn.mul(biomeOk).mul(float(1).sub(max(nearPath, frustumVis)));

    const reasonFrustumVisible = mix(reasonFrustumOk, reasonBypass, frustumBypass);
    let reason: TslNode = mix(reasonOutside, reasonBiome, step(float(0.5), biomeFail));
    reason = mix(reason, reasonFrustumFail, step(float(0.5), frustumFail));
    reason = mix(reason, reasonPropExclusion, (step as any)(float(0.5), propFail));
    reason = mix(reason, reasonFrustumVisible, step(float(0.5), frustumPath));
    reason = mix(reason, reasonNear, (step as any)(float(0.5), nearPath));

    return { visible, reason, outsideAnn, propInfluence };
  };
}
