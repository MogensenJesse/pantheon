// @ts-nocheck — TSL node parameter typings incomplete in r184
// src/world/grass/vegetationVisibilityTsl.ts — shared annulus, biome, and frustum cull
import { float, hash, instanceIndex, max, smoothstep, step, vec3 } from 'three/tsl';
import { worldXZToMapUv } from '../../../../map/mapUvTsl';
import { grassFrustumVisibility } from '../../tsl/grassFrustumVisibilityTsl';

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

export function createSampleGrassData(grassDataTex, uWorldSize, uHeightScale, uSurfaceBias = null) {
  return (worldX, worldZ) => {
    const mapUv = worldXZToMapUv(worldX, worldZ, uWorldSize);
    const data = grassDataTex.sample(mapUv);
    const heightNorm = data.r;
    const grassWeight = data.g;
    let yOffset = heightNorm.mul(uHeightScale);
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
}) {
  return (offsetX, offsetZ, yOffset, grassWeight) => {
    const worldX = offsetX.add(uPlayerPosition.x);
    const worldZ = offsetZ.add(uPlayerPosition.z);
    const worldPos = vec3(worldX, yOffset, worldZ);

    const inAnnulus = inAnnulusMask(offsetX, offsetZ);
    const strength = transitionStrength(grassWeight);
    const allowed = step(hash(instanceIndex), strength);
    const frustumVis = grassFrustumVisibility(worldPos, frustumBoundsRadius);

    const manhattan = offsetX.abs().add(offsetZ.abs());
    const isCloseEnough = float(1).sub(step(nearCameraDist, manhattan));
    const biomeVis = inAnnulus.mul(allowed);
    const normalVis = frustumVis.mul(biomeVis);
    const nearVis = isCloseEnough.mul(biomeVis);

    return max(nearVis, normalVis);
  };
}
