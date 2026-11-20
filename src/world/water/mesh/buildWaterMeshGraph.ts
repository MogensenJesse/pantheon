// src/world/water/mesh/buildWaterMeshGraph.ts — shared uniforms + surface/material shell for water tiers
import type { DirectionalLight, Texture } from 'three';
import { type Color, DoubleSide, type Vector3 } from 'three';
import {
  add,
  cameraPosition,
  div,
  dot,
  Fn,
  float,
  frontFacing,
  length,
  max,
  modelWorldMatrix,
  normalize,
  positionGeometry,
  positionLocal,
  positionWorld,
  pow,
  reflect,
  select,
  smoothstep,
  sub,
  texture,
  time,
  uniform,
  varying,
  vec2,
  vec3,
  vec4,
} from 'three/tsl';
import {
  applySunShadowVisibility,
  createReceiverSunShadowNode,
} from '../../../rendering/sunShadow';
import { waterSunReceiverUniforms } from '../../../rendering/sunShadow/receiverUniforms';
import { underwaterCeilingColorTsl } from '../../../rendering/underwater/underwaterTsl';
import { underwaterUniforms } from '../../../rendering/underwater/underwaterUniforms';
import { createMacroHeightTsl } from '../../terrain/tsl/terrainMacroHeightTsl';
import type { PantheonWaterNodeMaterial } from '../material/PantheonWaterNodeMaterial';
import {
  createWaterShoreUniforms,
  type WaterShoreDepthInputs,
  type WaterShoreUniforms,
} from '../material/waterShoreUniforms';
import { waterWaveUniforms } from '../material/waterWaveUniforms';
import {
  waterDepthBelowSurface,
  waterDepthOpacityTsl,
  waterRefractionMaskTsl,
} from '../tsl/waterDepthTsl';
import { applyWaterEdgeFade, createWaterEdgeFadeUniforms } from '../tsl/waterEdgeFadeTsl';
import { applyWaterSurfaceFoamOpacityTsl, waterSurfaceFoamMaskTsl } from '../tsl/waterFoamTsl';
import { waterShoreFogBypassTsl } from '../tsl/waterFogBypassTsl';
import {
  viewportSharedTexture,
  waterRefractionOpacityCompensateTsl,
} from '../tsl/waterRefractionTsl';
import { waterRunUpTsl } from '../tsl/waterRunUpTsl';
import { createShorelineFieldTsl } from '../tsl/waterShorelineFieldTsl';
import { lakeMulTsl, lakeShareTsl, swellAtTsl, swellWhitecapTsl } from '../tsl/waterWavesTsl';

type TslNode = any;
type WaterUniform = any;

export interface WaterMeshSharedOptions {
  sun: DirectionalLight;
  waterNormals: Texture;
  waterRadius: number;
  shoreDepth?: WaterShoreDepthInputs;
  edgeFadeStartRatio: number;
  edgeFadeEndRatio: number;
  size: number;
  alpha: number;
  sunColor: Color;
  sunDirection: Vector3;
  waterColor: Color;
  distortionScale: number;
}

export interface WaterMeshSurfaceTuning {
  normalSampleCount: 2 | 4;
  specularStrength: number;
  /** Blinn specular exponent — lower = broader Firewatch-like glints. */
  specularPower: number;
  diffuseStrength: number;
  /** Cheap tier uses fresnel in colorNode; reflective skips the extra node. */
  includeFresnel: boolean;
  /** Reflective tier offsets shadow receive UV by surface distortion. */
  shadowReceiveDistortion: boolean;
}

export interface WaterMeshUniformHost {
  waterNormals: TslNode;
  alpha: WaterUniform;
  size: WaterUniform;
  sunColor: WaterUniform;
  sunDirection: WaterUniform;
  waterColor: WaterUniform;
  distortionScale: WaterUniform;
  shoreUniforms: WaterShoreUniforms | null;
}

export interface WaterMeshGraph extends WaterMeshUniformHost {
  material: PantheonWaterNodeMaterial;
  shore: WaterShoreUniforms | null;
  shoreDepth: TslNode | null;
  shoreDistM: TslNode | null;
  foamMask: TslNode | null;
  refractMask: TslNode | null;
  viewportScene: TslNode | null;
  /** Darkens a colour where the sun's shadow falls on the water (the receiver shadow, floor and sun intensity). */
  applyShadow: (color: TslNode) => TslNode;
  worldXZ: TslNode;
  surfaceNormal: TslNode;
  eyeDirection: TslNode;
  specularLight: TslNode;
  diffuseLight: TslNode;
  distance: TslNode;
  distortion: TslNode;
  fresnel: TslNode | null;
  /** The surface seen from below (back face): bright window, water-coloured ceiling. Tiers pick it with `underSurfaceColor`. */
  ceilingColor: TslNode;
}

function createWaterNormalNoiseFn(waterNormals: TslNode, sampleCount: 2 | 4) {
  return Fn(([uv]: TslNode[]) => {
    const offset = time;
    const uv0 = add(div(uv, 103), vec2(div(offset, 17), div(offset, 29))).toVar();
    const uv1 = div(uv, 107)
      .sub(vec2(div(offset, -19), div(offset, 31)))
      .toVar();
    let noise = waterNormals.sample(uv0).add(waterNormals.sample(uv1));
    if (sampleCount === 4) {
      const uv2 = add(div(uv, vec2(8907, 9803)), vec2(div(offset, 101), div(offset, 97))).toVar();
      const uv3 = sub(div(uv, vec2(1091, 1027)), vec2(div(offset, 109), div(offset, -113))).toVar();
      noise = noise.add(waterNormals.sample(uv2)).add(waterNormals.sample(uv3));
    }
    return noise.mul(0.5).sub(1);
  });
}

/** Assigns mesh fields consumed by syncPantheonWater and the TSL graph. */
export function initWaterMeshUniforms(
  host: WaterMeshUniformHost,
  options: WaterMeshSharedOptions,
): void {
  host.waterNormals = texture(options.waterNormals);
  host.alpha = uniform(options.alpha);
  host.size = uniform(options.size);
  host.sunColor = uniform(options.sunColor.clone());
  host.sunDirection = uniform(options.sunDirection.clone());
  host.waterColor = uniform(options.waterColor.clone());
  host.distortionScale = uniform(options.distortionScale);
}

/**
 * Shared water surface + material shell (position, opacity, fog bypass, shadows).
 * Tier classes attach reflector and colorNode only.
 */
export function buildWaterMeshGraph(
  host: WaterMeshUniformHost,
  material: PantheonWaterNodeMaterial,
  options: WaterMeshSharedOptions,
  tuning: WaterMeshSurfaceTuning,
): WaterMeshGraph {
  const sunShadow = createReceiverSunShadowNode(options.sun);
  const { uShadowFloor, uSunIntensity } = waterSunReceiverUniforms;

  const edgeFade = createWaterEdgeFadeUniforms(
    options.waterRadius,
    options.edgeFadeStartRatio,
    options.edgeFadeEndRatio,
  );
  const shore = options.shoreDepth ? createWaterShoreUniforms(options.shoreDepth) : null;
  host.shoreUniforms = shore;
  // Also read by the surface seen from below, so it exists with or without shore depth.
  const viewportScene = viewportSharedTexture();

  const getNoise = createWaterNormalNoiseFn(host.waterNormals, tuning.normalSampleCount);
  const noise = getNoise(positionWorld.xz.mul(host.size));
  // The swell: Gerstner waves moving the vertices (the mesh follows the camera, so its centre is the camera and
  // `radiusM` is the distance to it). Open sea (no shore depth) is deep water everywhere.
  // Its depth is the visible terrain's (chiseled), the same the shore foam, the wet sand and the caustics read.
  const macroHeight = shore ? createMacroHeightTsl(shore) : null;
  const meshWorldXZ = modelWorldMatrix.mul(vec4(positionGeometry, 1)).xz;
  const meshDepth =
    shore && macroHeight
      ? waterDepthBelowSurface(meshWorldXZ, shore, (xz) => macroHeight.chiseledWorldYAtWorldXZ(xz))
      : float(1000);
  const swell = swellAtTsl(meshWorldXZ, length(positionGeometry.xy), meshDepth);
  // The swash lifts and lowers the sea at the shore (the vertices; the fragment evaluates the same offset exactly).
  const meshRunUp = shore ? waterRunUpTsl(meshWorldXZ, meshDepth) : float(0);
  // slope, crest and the swell's height above the mean level (w): the fragment reads the surface it is on from it
  const swellVary = varying(vec4(swell.slope.x, swell.slope.y, swell.crest, swell.displacement.y));
  // enclosed water (lakes) has weaker fine ripples: a flatter surface that mirrors the sky more clearly
  const rippleMul = lakeMulTsl(lakeShareTsl(positionWorld.xz), waterWaveUniforms.uLakeRippleShare);
  const rippleNormal = noise.xzy.mul(1.5, 1.0, 1.5);
  const surfaceNormal = normalize(
    vec3(
      rippleNormal.x.mul(rippleMul).sub(swellVary.x),
      rippleNormal.y,
      rippleNormal.z.mul(rippleMul).sub(swellVary.y),
    ),
  );
  const worldToEye = cameraPosition.sub(positionWorld);
  const eyeDirection = normalize(worldToEye);
  const reflection = normalize(reflect(host.sunDirection.negate(), surfaceNormal));
  const direction = max(0.0, dot(eyeDirection, reflection));
  const specularLight = pow(direction, tuning.specularPower)
    .mul(host.sunColor)
    .mul(tuning.specularStrength);
  const diffuseLight = max(dot(host.sunDirection, surfaceNormal), 0.0)
    .mul(host.sunColor)
    .mul(tuning.diffuseStrength);
  const distance = length(worldToEye);
  const distortion = (surfaceNormal as TslNode).xz
    .mul(float(0.001).add(float(1.0).div(distance)))
    .mul(host.distortionScale);
  const fresnel = tuning.includeFresnel
    ? pow(float(1.0).sub(max(0.0, dot(surfaceNormal, eyeDirection))), 3.0)
    : null;

  material.transparent = true;
  // The mesh is rotated -PI/2 on X: world Y is local Z and world Z is local -Y.
  // Over the shallows the geometry rides a little above the exact surface the fragment works out (invisible there: its
  // opacity is 0 on land), so the visible waterline is the fragment's world-anchored edge and not the cut of the camera-
  // following grid through the terrain, which wobbles as the grid slides.
  const meshEdgeLift = shore
    ? waterWaveUniforms.uShoreEdgeLiftM.mul(
        float(1).sub(smoothstep(float(0.5), float(1.5), meshDepth)),
      )
    : float(0);
  material.positionNode = positionLocal.add(
    vec3(
      swell.displacement.x,
      swell.displacement.z.negate(),
      swell.displacement.y.add(meshRunUp).add(meshEdgeLift),
    ),
  );
  const edgeAlpha = applyWaterEdgeFade(host.alpha, edgeFade);
  const sunShadowOpts = { sunShadow, uShadowFloor, uSunIntensity };
  const worldXZ = positionWorld.xz;
  const shoreline = macroHeight
    ? createShorelineFieldTsl({
        sampleWorldY: (xz) => macroHeight.chiseledWorldYAtWorldXZ(xz),
        sampleSlope: (xz) =>
          macroHeight.macroSlopeAtWorldXZ(xz, waterWaveUniforms.uShoreSlopeStepM),
      })
    : null;
  // Everything at the waterline is measured against the surface the mesh really has here: the mean level plus the swell
  // plus the swash. The terrain's wet sand and caustics evaluate the same swash (waterRunUpTsl) from the same depth.
  const meanDepth =
    shore && macroHeight
      ? waterDepthBelowSurface(worldXZ, shore, (xz) => macroHeight.chiseledWorldYAtWorldXZ(xz))
      : null;
  const surfaceOffset = meanDepth
    ? swellVary.w.add(waterRunUpTsl(worldXZ, meanDepth))
    : swellVary.w;
  const shoreDistM = shoreline ? shoreline.shoreDistanceAtM(worldXZ, surfaceOffset) : null;
  const shoreDepth = meanDepth ? meanDepth.add(surfaceOffset) : null;
  const shoreFoam =
    shore && shoreDistM ? waterSurfaceFoamMaskTsl(worldXZ, waterWaveUniforms, shoreDistM) : null;
  const whitecaps = swellWhitecapTsl(swellVary.z, noise);
  const foamMask = shoreFoam ? max(shoreFoam, whitecaps) : whitecaps;
  const refractMask =
    shore && shoreDepth ? waterRefractionMaskTsl(shore, shoreDepth, shoreDistM) : null;
  // Seen from below the surface is a back face: opaque, a refracted view of the world above, no valley fog (the volume's own fog is in its colour).
  // Off with the volume (the map editor never syncs it), the back face then stays invisible as it was when culled.
  material.side = DoubleSide;
  const shoreBypass = shore && refractMask ? waterShoreFogBypassTsl(refractMask, shore) : float(0);
  material.fogBypassNode = select(frontFacing, shoreBypass, float(1));
  const depthOpacity =
    shore && shoreDepth
      ? waterRefractionOpacityCompensateTsl(
          waterDepthOpacityTsl(edgeAlpha, shore, sunShadowOpts, shoreDepth, shoreDistM),
          refractMask,
          shore,
        )
      : edgeAlpha;
  const frontOpacity = foamMask
    ? applyWaterSurfaceFoamOpacityTsl(depthOpacity, foamMask)
    : depthOpacity;
  material.opacityNode = select(
    frontFacing,
    frontOpacity,
    edgeAlpha.mul(underwaterUniforms.uEnabled),
  );
  material.receivedShadowPositionNode = tuning.shadowReceiveDistortion
    ? positionWorld.add(distortion)
    : positionWorld;

  return {
    ...host,
    material,
    shore,
    shoreDepth,
    shoreDistM,
    foamMask,
    refractMask,
    viewportScene,
    applyShadow: (color) => applySunShadowVisibility(color, sunShadow, uShadowFloor, uSunIntensity),
    worldXZ,
    surfaceNormal,
    eyeDirection,
    specularLight,
    diffuseLight,
    distance,
    distortion,
    fresnel,
    ceilingColor: underwaterCeilingColorTsl(eyeDirection.negate(), surfaceNormal, viewportScene),
  };
}

/** The surface colour for a fragment: `frontColor` seen from above, the ceiling from below. */
export function underSurfaceColor(graph: WaterMeshGraph, frontColor: TslNode): TslNode {
  return select(frontFacing, frontColor, graph.ceilingColor);
}
