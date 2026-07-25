// src/world/grass/compute/shared/vegetationVisibilityTsl.ts — shared annulus, biome, and frustum cull
import { clamp, float, hash, instanceIndex, max, mix, smoothstep, step, vec2, vec3 } from 'three/tsl';
import { worldXZToMapUv } from '../../../../map/mapUvTsl';
import { GRASS_CULL_REASON } from '../../tsl/grassCullDebugTsl';
import {
  grassFrustumBypassActive,
  grassFrustumVisibility,
} from '../../tsl/grassFrustumVisibilityTsl';
import type { TslNode } from '../../tsl/tslNode';

/** Manhattan distance (m) — instances inside this radius always draw (False Earth pattern). */
export const NEAR_CAMERA_ALWAYS_VISIBLE = 3;

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

export function createTransitionStrength(threshold: TslNode, fadeWidth: TslNode) {
  return (grassWeight: TslNode): TslNode =>
    smoothstep(threshold, threshold.add(fadeWidth), grassWeight);
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
    const biomeOk = step(hash(instanceIndex), strength);
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
