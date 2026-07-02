// src/world/water/tsl/waterDepthTsl.ts — terrain-height shore depth, Beer-Lambert opacity, shallow tint
import { Discard, exp, Fn, float, If, max, mix, smoothstep, sub } from 'three/tsl';
import { terrainMapUv } from '../../../map/mapUvTsl';
import { computeEffectiveSunShadowFloor } from '../../../rendering/sunShadow/sunShadowTsl';
import type { WaterShoreUniforms } from '../waterShoreUniforms';
import { waterWaveUniforms } from '../waterWaveUniforms';
import { waterCurrentHeightAtXzTsl } from './waterTideTsl';

type TslNode = any;

export interface WaterSunShadowOpts {
  sunShadow: TslNode;
  uShadowFloor: TslNode;
  uSunIntensity: TslNode;
}

/** Normalized sculpt height [0,1] at world XZ (same sampling as terrainMacroHeightTsl). */
function sampleTerrainNormY(worldXZ: TslNode, shore: WaterShoreUniforms): TslNode {
  return shore.uHeightTex.sample(terrainMapUv(shore.uWorldSize, worldXZ)).r;
}

/** World-space macro terrain Y from the height texture. */
function sampleTerrainWorldY(worldXZ: TslNode, shore: WaterShoreUniforms): TslNode {
  return sampleTerrainNormY(worldXZ, shore).mul(shore.uHeightScale);
}

/** 1 inside painted map square, 0 beyond — fades across mapBoundsFadeM inset from edge. */
function waterMapBoundsMaskTsl(worldXZ: TslNode, shore: WaterShoreUniforms): TslNode {
  const half = shore.uWorldSize.mul(0.5);
  const inside = half.sub(max(worldXZ.x.abs(), worldXZ.y.abs()));
  return smoothstep(float(0), shore.uMapBoundsFadeM, inside);
}

/** Terrain-sculpt depth only (no open-ocean override). */
function waterTerrainDepthBelowSurface(worldXZ: TslNode, shore: WaterShoreUniforms): TslNode {
  return waterCurrentHeightAtXzTsl(shore.uWaterY, waterWaveUniforms, worldXZ).sub(
    sampleTerrainWorldY(worldXZ, shore),
  );
}

/**
 * Water depth below surface — inside map uses terrain height; outside blends to openOceanDepthM
 * so clamped heightmap edges do not read as shallow refracting water over the mesh boundary.
 */
export function waterDepthBelowSurface(worldXZ: TslNode, shore: WaterShoreUniforms): TslNode {
  const terrainDepth = waterTerrainDepthBelowSurface(worldXZ, shore);
  const boundsMask = waterMapBoundsMaskTsl(worldXZ, shore);
  return mix(shore.uOpenOceanDepthM, terrainDepth, boundsMask);
}

function resolvedShoreDepth(worldXZ: TslNode, shore: WaterShoreUniforms, depth?: TslNode): TslNode {
  return depth ?? waterDepthBelowSurface(worldXZ, shore);
}

function waterLandMask(depth: TslNode, shore: WaterShoreUniforms): TslNode {
  return smoothstep(float(0), shore.uCoastFadeM, depth);
}

/** Skip dry-land fragments inside the ocean disc (opacity would be 0 anyway). */
export const applyWaterDryLandDiscardTsl = Fn(([worldXZ, shore]: TslNode[]) => {
  const boundsMask = waterMapBoundsMaskTsl(worldXZ, shore);
  const terrainDepth = waterTerrainDepthBelowSurface(worldXZ, shore);
  const landMask = waterLandMask(terrainDepth, shore);
  If(
    landMask
      .lessThan(float(0.001))
      .and(shore.uEnabled.greaterThan(0.5))
      .and(boundsMask.greaterThan(float(0.001))),
    () => {
      Discard();
    },
  );
});

/** Beer-Lambert absorption from precomputed shore depth (no height re-sample). */
export function waterBeerLambertAbsorptionFromDepthTsl(
  depth: TslNode,
  shore: WaterShoreUniforms,
): TslNode {
  return waterBeerLambertOpacity(max(depth, float(0)), shore);
}

/** Beer-Lambert absorption → surface opacity (0 shallow, →1 deep). */
export function waterBeerLambertAbsorptionTsl(
  worldXZ: TslNode,
  shore: WaterShoreUniforms,
  depth?: TslNode,
): TslNode {
  return waterBeerLambertAbsorptionFromDepthTsl(resolvedShoreDepth(worldXZ, shore, depth), shore);
}

function waterBeerLambertOpacity(depthClamped: TslNode, shore: WaterShoreUniforms): TslNode {
  return sub(float(1), exp(depthClamped.negate().mul(shore.uAbsorption)));
}

/** 1 at the surface, decays with depth — drives shallow teal scatter tint. */
function waterShallowTintFactor(depthClamped: TslNode, shore: WaterShoreUniforms): TslNode {
  return exp(depthClamped.negate().div(shore.uShallowDepthM));
}

/**
 * Refraction mask — exp depth falloff, independent of Beer-Lambert absorption.
 * Drives screen-space refraction color + opacity lock only.
 */
export function waterRefractionMaskTsl(
  worldXZ: TslNode,
  shore: WaterShoreUniforms,
  depth?: TslNode,
): TslNode {
  const d = resolvedShoreDepth(worldXZ, shore, depth);
  const depthClamped = max(d, float(0));
  const landMask = waterLandMask(d, shore);
  const shallow = exp(depthClamped.negate().div(shore.uRefractionDepthM));
  return landMask.mul(shallow).mul(shore.uEnabled);
}

/**
 * Shallow water stays transparent while applySunShadowVisibility darkens the surface;
 * boost opacity in shadow so submerged terrain does not show through.
 */
function waterShadowOpacityBoost(
  depthOpacity: TslNode,
  shore: WaterShoreUniforms,
  shadow: WaterSunShadowOpts,
): TslNode {
  const sunVis = computeEffectiveSunShadowFloor(
    shadow.sunShadow,
    shadow.uShadowFloor,
    shadow.uSunIntensity,
  );
  const shadowRange = sub(float(1), shadow.uShadowFloor).max(0.001);
  const shadowAmt = sub(float(1), sunVis).div(shadowRange).clamp(0, 1);
  const boosted = mix(depthOpacity, float(1), shadowAmt.mul(shore.uShadowOpacityBoost) as TslNode);
  return mix(depthOpacity, boosted, shore.uEnabled as TslNode);
}

/**
 * Multiply base alpha by coast land mask + depth absorption.
 * When uEnabled is 0, returns baseAlpha unchanged.
 */
export function waterDepthOpacityTsl(
  baseAlpha: TslNode,
  worldXZ: TslNode,
  shore: WaterShoreUniforms,
  shadow?: WaterSunShadowOpts,
  depth?: TslNode,
): TslNode {
  const d = resolvedShoreDepth(worldXZ, shore, depth);
  const depthClamped = max(d, float(0));
  const landMask = waterLandMask(d, shore);
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
  deepColor: TslNode,
  worldXZ: TslNode,
  shore: WaterShoreUniforms,
  depth?: TslNode,
): TslNode {
  const depthClamped = max(resolvedShoreDepth(worldXZ, shore, depth), float(0));
  const shallowT = waterShallowTintFactor(depthClamped, shore);
  const tinted = mix(deepColor, shore.uShallowColor, shallowT);
  return mix(deepColor, tinted, shore.uEnabled);
}
