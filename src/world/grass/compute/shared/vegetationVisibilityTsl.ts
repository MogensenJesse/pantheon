// src/world/grass/compute/shared/vegetationVisibilityTsl.ts — shared annulus, biome, and frustum cull
import { float, hash, instanceIndex, max, mix, smoothstep, step, vec3 } from 'three/tsl';
import { worldXZToMapUv } from '../../../../map/mapUvTsl';
import { GRASS_CULL_REASON } from '../../tsl/grassCullDebugTsl';
import {
  grassFrustumBypassActive,
  grassFrustumVisibility,
} from '../../tsl/grassFrustumVisibilityTsl';
import type { TslNode } from '../../tsl/tslNode';

/** Manhattan distance (m) — instances inside this radius always draw (False Earth pattern). */
export const NEAR_CAMERA_ALWAYS_VISIBLE = 3;

export function createInAnnulusMask(uInnerRadius: TslNode, uOuterRadius: TslNode) {
  return (offsetX: TslNode, offsetZ: TslNode): TslNode => {
    const distSq = offsetX.mul(offsetX).add(offsetZ.mul(offsetZ));
    const innerSq = uInnerRadius.mul(uInnerRadius);
    const outerSq = uOuterRadius.mul(uOuterRadius);
    return step(innerSq, distSq).mul(float(1).sub(step(outerSq, distSq)));
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
) {
  return (worldX: TslNode, worldZ: TslNode) => {
    const mapUv = worldXZToMapUv(worldX, worldZ, uWorldSize);
    const data = grassDataTex.sample(mapUv);
    const grassWeight = data.g;
    const heightNorm = data.r;
    let yOffset: TslNode = heightNorm.mul(uHeightScale);
    if (uSurfaceBias) {
      yOffset = yOffset.add(uSurfaceBias);
    }
    return { heightNorm, grassWeight, yOffset };
  };
}

export function createBuildVisibility({
  inAnnulusMask,
  transitionStrength,
  uPlayerPosition,
  frustumBoundsRadius = null,
  nearCameraDist = float(NEAR_CAMERA_ALWAYS_VISIBLE),
}: {
  inAnnulusMask: (offsetX: TslNode, offsetZ: TslNode) => TslNode;
  transitionStrength: (grassWeight: TslNode) => TslNode;
  uPlayerPosition: TslNode;
  frustumBoundsRadius?: TslNode | null;
  nearCameraDist?: TslNode;
}) {
  const reasonOutside = float(GRASS_CULL_REASON.outsideAnnulus);
  const reasonBiome = float(GRASS_CULL_REASON.biomeFail);
  const reasonFrustumFail = float(GRASS_CULL_REASON.frustumFail);
  const reasonFrustumOk = float(GRASS_CULL_REASON.visibleFrustum);
  const reasonNear = float(GRASS_CULL_REASON.visibleNear);
  const reasonBypass = float(GRASS_CULL_REASON.visibleFrustumBypass);

  return (offsetX: TslNode, offsetZ: TslNode, yOffset: TslNode, grassWeight: TslNode) => {
    const worldX = offsetX.add(uPlayerPosition.x);
    const worldZ = offsetZ.add(uPlayerPosition.z);
    const worldPos = vec3(worldX, yOffset, worldZ);

    const insideAnn = inAnnulusMask(offsetX, offsetZ);
    const outsideAnn = float(1).sub(insideAnn);
    const strength = transitionStrength(grassWeight);
    const biomeOk = step(hash(instanceIndex), strength);
    const biomeFail = insideAnn.mul(float(1).sub(biomeOk));
    const frustumVis = grassFrustumVisibility(worldPos, frustumBoundsRadius);
    const frustumBypass = grassFrustumBypassActive();

    const manhattan = offsetX.abs().add(offsetZ.abs());
    const isCloseEnough = float(1).sub(step(nearCameraDist, manhattan));
    const biomeVis = insideAnn.mul(biomeOk);
    const nearPath = isCloseEnough.mul(biomeVis);
    const frustumPath = frustumVis.mul(biomeVis);
    const visible = max(nearPath, frustumPath);
    const frustumFail = insideAnn.mul(biomeOk).mul(float(1).sub(max(nearPath, frustumVis)));

    const reasonFrustumVisible = mix(reasonFrustumOk, reasonBypass, frustumBypass);
    let reason: TslNode = mix(reasonOutside, reasonBiome, step(float(0.5), biomeFail));
    reason = mix(reason, reasonFrustumFail, step(float(0.5), frustumFail));
    reason = mix(reason, reasonFrustumVisible, step(float(0.5), frustumPath));
    reason = mix(reason, reasonNear, (step as any)(float(0.5), nearPath));

    return { visible, reason, outsideAnn };
  };
}
