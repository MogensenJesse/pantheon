// @ts-nocheck — TSL node parameter typings incomplete in r184
// src/world/water/tsl/waterDepthTsl.ts — terrain-height shore depth, Beer-Lambert opacity, shallow tint
import { Discard, exp, float, Fn, If, max, mix, smoothstep, sub } from 'three/tsl';
import type { Node } from 'three/webgpu';
import { terrainMapUv } from '../../../map/mapUvTsl';
import { computeEffectiveSunShadowFloor } from '../../../rendering/sunShadow/sunShadowTsl';
import type { WaterShoreUniforms } from '../waterShoreUniforms';

export interface WaterSunShadowOpts {
  sunShadow: Node;
  uShadowFloor: Node;
  uSunIntensity: Node;
}

/** Normalized sculpt height [0,1] at world XZ (same sampling as terrainMacroHeightTsl). */
function sampleTerrainNormY(worldXZ: Node, shore: WaterShoreUniforms): Node {
  return shore.uHeightTex.sample(terrainMapUv(shore.uWorldSize, worldXZ)).r;
}

/** World-space macro terrain Y from the height texture. */
function sampleTerrainWorldY(worldXZ: Node, shore: WaterShoreUniforms): Node {
  return sampleTerrainNormY(worldXZ, shore).mul(shore.uHeightScale);
}

/** Water depth below surface (positive underwater); terrainY from macro height map only. */
function waterDepthBelowSurface(worldXZ: Node, shore: WaterShoreUniforms): Node {
  return shore.uWaterY.sub(sampleTerrainWorldY(worldXZ, shore));
}

/** 0 on dry land (depth <= 0), ramps to 1 underwater across coastFadeM. */
export function waterCoastLandMaskTsl(depth: Node, shore: WaterShoreUniforms): Node {
  return smoothstep(float(0), shore.uCoastFadeM, depth);
}

function waterLandMask(depth: Node, shore: WaterShoreUniforms): Node {
  return waterCoastLandMaskTsl(depth, shore);
}

/** Skip dry-land fragments inside the ocean disc (opacity would be 0 anyway). */
export const applyWaterDryLandDiscardTsl = Fn(([worldXZ, shore]) => {
  const depth = waterDepthBelowSurface(worldXZ, shore);
  const landMask = waterCoastLandMaskTsl(depth, shore);
  If(landMask.lessThan(float(0.001)).and(shore.uEnabled.greaterThan(0.5)), () => {
    Discard();
  });
});

/** Beer-Lambert absorption → surface opacity (0 shallow, →1 deep). */
export function waterBeerLambertAbsorptionTsl(worldXZ: Node, shore: WaterShoreUniforms): Node {
  const depthClamped = max(waterDepthBelowSurface(worldXZ, shore), float(0));
  return waterBeerLambertOpacity(depthClamped, shore);
}

function waterBeerLambertOpacity(depthClamped: Node, shore: WaterShoreUniforms): Node {
  return sub(float(1), exp(depthClamped.negate().mul(shore.uAbsorption)));
}

/** 1 at the surface, decays with depth — drives shallow teal scatter tint. */
function waterShallowTintFactor(depthClamped: Node, shore: WaterShoreUniforms): Node {
  return exp(depthClamped.negate().div(shore.uShallowDepthM));
}

/**
 * Refraction mask — exp depth falloff, independent of Beer-Lambert absorption.
 * Drives screen-space refraction color + opacity lock only.
 */
export function waterRefractionMaskTsl(worldXZ: Node, shore: WaterShoreUniforms): Node {
  const depth = waterDepthBelowSurface(worldXZ, shore);
  const depthClamped = max(depth, float(0));
  const landMask = waterLandMask(depth, shore);
  const shallow = exp(depthClamped.negate().div(shore.uRefractionDepthM));
  return landMask.mul(shallow).mul(shore.uEnabled);
}

/**
 * Shallow water stays transparent while applySunShadowVisibility darkens the surface;
 * boost opacity in shadow so submerged terrain does not show through.
 */
function waterShadowOpacityBoost(
  depthOpacity: Node,
  shore: WaterShoreUniforms,
  shadow: WaterSunShadowOpts,
): Node {
  const sunVis = computeEffectiveSunShadowFloor(
    shadow.sunShadow,
    shadow.uShadowFloor,
    shadow.uSunIntensity,
  );
  const shadowRange = sub(float(1), shadow.uShadowFloor).max(0.001);
  const shadowAmt = sub(float(1), sunVis).div(shadowRange).clamp(0, 1);
  const boosted = mix(depthOpacity, float(1), shadowAmt.mul(shore.uShadowOpacityBoost));
  return mix(depthOpacity, boosted, shore.uEnabled);
}

/**
 * Multiply base alpha by coast land mask + depth absorption.
 * When uEnabled is 0, returns baseAlpha unchanged.
 */
export function waterDepthOpacityTsl(
  baseAlpha: Node,
  worldXZ: Node,
  shore: WaterShoreUniforms,
  shadow?: WaterSunShadowOpts,
): Node {
  const depth = waterDepthBelowSurface(worldXZ, shore);
  const depthClamped = max(depth, float(0));
  const landMask = waterLandMask(depth, shore);
  const absorbed = waterBeerLambertOpacity(depthClamped, shore);
  const depthOpacity = baseAlpha.mul(mix(float(1), landMask.mul(absorbed), shore.uEnabled));
  if (!shadow) {
    return depthOpacity;
  }
  return waterShadowOpacityBoost(depthOpacity, shore, shadow);
}

/**
 * Lerp deep water color toward shallow teal by underwater depth.
 * When uEnabled is 0, returns deepColor unchanged.
 */
export function waterDepthScatterTintTsl(
  deepColor: Node,
  worldXZ: Node,
  shore: WaterShoreUniforms,
): Node {
  const depthClamped = max(waterDepthBelowSurface(worldXZ, shore), float(0));
  const shallowT = waterShallowTintFactor(depthClamped, shore);
  const tinted = mix(deepColor, shore.uShallowColor, shallowT);
  return mix(deepColor, tinted, shore.uEnabled);
}
