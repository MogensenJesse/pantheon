// @ts-nocheck — TSL node parameter typings incomplete in r184
// src/world/grass/compute/shared/vegetationVisibilityTsl.ts — shared annulus, biome, and frustum cull
import { float, hash, instanceIndex, max, mix, smoothstep, step, vec2, vec3 } from 'three/tsl';
import { worldXZToMapUv } from '../../../../map/mapUvTsl';
import { GRASS_CULL_REASON } from '../../tsl/grassCullDebugTsl';
import {
  grassFrustumBypassActive,
  grassFrustumVisibility,
} from '../../tsl/grassFrustumVisibilityTsl';

/** Manhattan distance (m) — instances inside this radius always draw (False Earth pattern). */
export const NEAR_CAMERA_ALWAYS_VISIBLE = 3;

export function createInAnnulusMask(uInnerRadius, uOuterRadius) {
  return (offsetX, offsetZ) => {
    const distSq = offsetX.mul(offsetX).add(offsetZ.mul(offsetZ));
    const innerSq = uInnerRadius.mul(uInnerRadius);
    const outerSq = uOuterRadius.mul(uOuterRadius);
    return step(innerSq, distSq).mul(float(1).sub(step(outerSq, distSq)));
  };
}

export function createTransitionStrength(threshold, fadeWidth) {
  return (grassWeight) => smoothstep(threshold, threshold.add(fadeWidth), grassWeight);
}

export function createSampleGrassData(
  grassDataTex,
  uWorldSize,
  uHeightScale,
  uSurfaceBias = null,
  sampleTerrainSurfaceY = null,
  sampleTerrainSurfacePosition = null,
) {
  return (worldX, worldZ) => {
    const mapUv = worldXZToMapUv(worldX, worldZ, uWorldSize);
    const data = grassDataTex.sample(mapUv);
    const grassWeight = data.g;
    const worldXZ = vec2(worldX, worldZ);
    let macroY = data.r.mul(uHeightScale);
    let surfaceXZ = worldXZ;
    if (sampleTerrainSurfacePosition) {
      const surfacePos = sampleTerrainSurfacePosition(worldXZ);
      macroY = surfacePos.y;
      surfaceXZ = surfacePos.xz;
    } else if (sampleTerrainSurfaceY) {
      macroY = sampleTerrainSurfaceY(worldXZ);
    }
    let yOffset = macroY;
    if (uSurfaceBias) {
      yOffset = yOffset.add(uSurfaceBias);
    }
    const heightNorm = macroY.div(uHeightScale);
    return { heightNorm, grassWeight, yOffset, surfaceXZ };
  };
}

export function createBuildVisibility({
  inAnnulusMask,
  transitionStrength,
  uPlayerPosition,
  frustumBoundsRadius = null,
  nearCameraDist = float(NEAR_CAMERA_ALWAYS_VISIBLE),
}) {
  const reasonOutside = float(GRASS_CULL_REASON.outsideAnnulus);
  const reasonBiome = float(GRASS_CULL_REASON.biomeFail);
  const reasonFrustumFail = float(GRASS_CULL_REASON.frustumFail);
  const reasonFrustumOk = float(GRASS_CULL_REASON.visibleFrustum);
  const reasonNear = float(GRASS_CULL_REASON.visibleNear);
  const reasonBypass = float(GRASS_CULL_REASON.visibleFrustumBypass);

  return (offsetX, offsetZ, yOffset, grassWeight) => {
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
    let reason = mix(reasonOutside, reasonBiome, step(float(0.5), biomeFail));
    reason = mix(reason, reasonFrustumFail, step(float(0.5), frustumFail));
    reason = mix(reason, reasonFrustumVisible, step(float(0.5), frustumPath));
    reason = mix(reason, reasonNear, step(float(0.5), nearPath));

    return { visible, reason, outsideAnn };
  };
}
