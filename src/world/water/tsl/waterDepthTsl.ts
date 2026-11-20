// src/world/water/tsl/waterDepthTsl.ts — terrain-height shore depth, Beer-Lambert opacity, shallow tint
import { Discard, exp, Fn, float, If, max, mix, smoothstep, sub } from 'three/tsl';
import { computeEffectiveSunShadowFloor } from '../../../rendering/sunShadow/sunShadowTsl';
import type { WaterShoreUniforms } from '../material/waterShoreUniforms';

type TslNode = any;

export interface WaterSunShadowOpts {
  sunShadow: TslNode;
  uShadowFloor: TslNode;
  uSunIntensity: TslNode;
}

/** 1 inside painted map square, 0 beyond — fades across mapBoundsFadeM inset from edge. */
function waterMapBoundsMaskTsl(worldXZ: TslNode, shore: WaterShoreUniforms): TslNode {
  const half = shore.uWorldSize.mul(0.5);
  const inside = half.sub(max(worldXZ.x.abs(), worldXZ.y.abs()));
  return smoothstep(float(0), shore.uMapBoundsFadeM, inside);
}

/**
 * Water depth below surface — inside map uses the terrain height (`sampleWorldY`, the visible chiseled mesh); outside
 * blends to openOceanDepthM so clamped heightmap edges do not read as shallow refracting water over the mesh boundary.
 */
export function waterDepthBelowSurface(
  worldXZ: TslNode,
  shore: WaterShoreUniforms,
  sampleWorldY: (worldXZ: TslNode) => TslNode,
): TslNode {
  const terrainDepth = shore.uWaterY.sub(sampleWorldY(worldXZ));
  const boundsMask = waterMapBoundsMaskTsl(worldXZ, shore);
  return mix(shore.uOpenOceanDepthM, terrainDepth, boundsMask);
}

function waterLandMask(shoreDistM: TslNode, shore: WaterShoreUniforms): TslNode {
  return smoothstep(float(0), shore.uCoastFadeM, shoreDistM);
}

/** Skip dry-land fragments inside the ocean disc (opacity would be 0 anyway). */
export const applyWaterDryLandDiscardTsl = Fn(([worldXZ, shore, shoreDistM]: TslNode[]) => {
  const boundsMask = waterMapBoundsMaskTsl(worldXZ, shore);
  const landMask = waterLandMask(shoreDistM, shore);
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
  shore: WaterShoreUniforms,
  depth: TslNode,
  shoreDistM: TslNode,
): TslNode {
  const depthClamped = max(depth, float(0));
  const landMask = waterLandMask(shoreDistM, shore);
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
  landMask: TslNode,
): TslNode {
  const sunVis = computeEffectiveSunShadowFloor(
    shadow.sunShadow,
    shadow.uShadowFloor,
    shadow.uSunIntensity,
  );
  const shadowRange = sub(float(1), shadow.uShadowFloor).max(0.001);
  const shadowAmt = sub(float(1), sunVis).div(shadowRange).clamp(0, 1);
  // Not over the edge: the boost must never make the water visible where the coast mask says there is none.
  const boosted = mix(
    depthOpacity,
    float(1),
    shadowAmt.mul(shore.uShadowOpacityBoost).mul(landMask) as TslNode,
  );
  return mix(depthOpacity, boosted, shore.uEnabled as TslNode);
}

/**
 * Multiply base alpha by coast land mask + depth absorption.
 * When uEnabled is 0, returns baseAlpha unchanged.
 */
export function waterDepthOpacityTsl(
  baseAlpha: TslNode,
  shore: WaterShoreUniforms,
  shadow: WaterSunShadowOpts,
  depth: TslNode,
  shoreDistM: TslNode,
): TslNode {
  const depthClamped = max(depth, float(0));
  const landMask = waterLandMask(shoreDistM, shore);
  const absorbed = waterBeerLambertOpacity(depthClamped, shore);
  const depthOpacity = baseAlpha.mul(mix(float(1), landMask.mul(absorbed), shore.uEnabled));
  return waterShadowOpacityBoost(depthOpacity, shore, shadow, landMask);
}

/**
 * Lerp deep water color toward shallow teal by underwater depth.
 * When uEnabled is 0, returns deepColor unchanged.
 */
export function waterDepthScatterTintTsl(
  deepColor: TslNode,
  shore: WaterShoreUniforms,
  depth: TslNode,
): TslNode {
  const depthClamped = max(depth, float(0));
  const shallowT = waterShallowTintFactor(depthClamped, shore);
  const tinted = mix(deepColor, shore.uShallowColor, shallowT);
  return mix(deepColor, tinted, shore.uEnabled);
}
