// src/world/water/mesh/buildWaterMeshGraph.ts — shared uniforms + surface/material shell for water tiers
import type { DirectionalLight, Texture } from 'three';
import { Color, Vector3 } from 'three';
import {
  add,
  cameraPosition,
  div,
  dot,
  Fn,
  float,
  length,
  max,
  normalize,
  positionLocal,
  positionWorld,
  pow,
  reflect,
  sub,
  texture,
  time,
  uniform,
  vec2,
  vec3,
} from 'three/tsl';
import { applySunShadowVisibility, createReceiverSunShadowNode } from '../../../rendering/sunShadow';
import { macroSurfaceWorldXZ } from '../../terrain/tsl/biomeAtlasUv';
import type { PantheonWaterNodeMaterial } from '../material/PantheonWaterNodeMaterial';
import {
  waterDepthBelowSurface,
  waterDepthOpacityTsl,
  waterRefractionMaskTsl,
} from '../tsl/waterDepthTsl';
import { waterShoreFogBypassTsl } from '../tsl/waterFogBypassTsl';
import {
  viewportSharedTexture,
  waterRefractionOpacityCompensateTsl,
} from '../tsl/waterRefractionTsl';
import { waterSurfaceYOffsetTsl } from '../tsl/waterTideTsl';
import { applyWaterEdgeFade, createWaterEdgeFadeUniforms } from '../tsl/waterEdgeFadeTsl';
import { waterShadowUniforms } from '../material/waterShadowUniforms';
import {
  createWaterShoreUniforms,
  type WaterShoreDepthInputs,
  type WaterShoreUniforms,
} from '../material/waterShoreUniforms';
import { waterWaveUniforms } from '../material/waterWaveUniforms';

type TslNode = any;
type WaterUniform = any;

export interface WaterMeshSharedOptions {
  sun: DirectionalLight;
  waterNormals: Texture;
  waterRadius: number;
  shoreDepth?: WaterShoreDepthInputs;
  edgeFadeStartRatio?: number;
  edgeFadeEndRatio?: number;
  size?: number;
  alpha?: number;
  sunColor?: Color;
  sunDirection?: Vector3;
  waterColor?: Color;
  distortionScale?: number;
}

export interface WaterMeshSurfaceTuning {
  normalSampleCount: 2 | 4;
  specularStrength: number;
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
  uSunIntensity: (typeof waterShadowUniforms)['uSunIntensity'];
  uShadowFloor: (typeof waterShadowUniforms)['uShadowFloor'];
  shoreUniforms: WaterShoreUniforms | null;
}

export interface WaterMeshGraph extends WaterMeshUniformHost {
  material: PantheonWaterNodeMaterial;
  shore: WaterShoreUniforms | null;
  shoreDepth: TslNode | null;
  refractMask: TslNode | null;
  viewportScene: TslNode | null;
  sunShadow: TslNode;
  sunShadowOpts: {
    sunShadow: TslNode;
    uShadowFloor: (typeof waterShadowUniforms)['uShadowFloor'];
    uSunIntensity: (typeof waterShadowUniforms)['uSunIntensity'];
  };
  edgeAlpha: TslNode;
  worldXZ: TslNode;
  surfaceNormal: TslNode;
  eyeDirection: TslNode;
  specularLight: TslNode;
  diffuseLight: TslNode;
  distance: TslNode;
  distortion: TslNode;
  fresnel: TslNode | null;
}

function createWaterNormalNoiseFn(waterNormals: TslNode, sampleCount: 2 | 4) {
  if (sampleCount === 4) {
    return Fn(([uv]: TslNode[]) => {
      const offset = time;
      const uv0 = add(div(uv, 103), vec2(div(offset, 17), div(offset, 29))).toVar();
      const uv1 = div(uv, 107)
        .sub(vec2(div(offset, -19), div(offset, 31)))
        .toVar();
      const uv2 = add(div(uv, vec2(8907, 9803)), vec2(div(offset, 101), div(offset, 97))).toVar();
      const uv3 = sub(div(uv, vec2(1091, 1027)), vec2(div(offset, 109), div(offset, -113))).toVar();
      const sample0 = waterNormals.sample(uv0);
      const sample1 = waterNormals.sample(uv1);
      const sample2 = waterNormals.sample(uv2);
      const sample3 = waterNormals.sample(uv3);
      const noise = sample0.add(sample1).add(sample2).add(sample3);
      return noise.mul(0.5).sub(1);
    });
  }

  return Fn(([uv]: TslNode[]) => {
    const offset = time;
    const uv0 = add(div(uv, 103), vec2(div(offset, 17), div(offset, 29))).toVar();
    const uv1 = div(uv, 107)
      .sub(vec2(div(offset, -19), div(offset, 31)))
      .toVar();
    const sample0 = waterNormals.sample(uv0);
    const sample1 = waterNormals.sample(uv1);
    const noise = sample0.add(sample1);
    return noise.mul(0.5).sub(1);
  });
}

/** Assigns mesh fields consumed by syncPantheonWater and the TSL graph. */
export function initWaterMeshUniforms(
  host: WaterMeshUniformHost,
  options: WaterMeshSharedOptions,
): void {
  host.waterNormals = texture(options.waterNormals);
  host.alpha = uniform(options.alpha ?? 1);
  host.size = uniform(options.size ?? 1);
  host.sunColor = uniform(options.sunColor?.clone() ?? new Color(0xffffff));
  host.sunDirection = uniform(options.sunDirection?.clone() ?? new Vector3(0.70707, 0.70707, 0));
  host.waterColor = uniform(options.waterColor?.clone() ?? new Color(0x7f7f7f));
  host.distortionScale = uniform(options.distortionScale ?? 20);
  host.uSunIntensity = waterShadowUniforms.uSunIntensity;
  host.uShadowFloor = waterShadowUniforms.uShadowFloor;
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
  const { uShadowFloor, uSunIntensity } = waterShadowUniforms;

  const edgeFade = createWaterEdgeFadeUniforms(
    options.waterRadius,
    options.edgeFadeStartRatio ?? 0.72,
    options.edgeFadeEndRatio ?? 1,
  );
  const shore = options.shoreDepth ? createWaterShoreUniforms(options.shoreDepth) : null;
  host.shoreUniforms = shore;
  const viewportScene = shore ? viewportSharedTexture() : null;

  const getNoise = createWaterNormalNoiseFn(host.waterNormals, tuning.normalSampleCount);
  const noise = getNoise(positionWorld.xz.mul(host.size));
  const surfaceNormal = normalize(noise.xzy.mul(1.5, 1.0, 1.5));
  const worldToEye = cameraPosition.sub(positionWorld);
  const eyeDirection = normalize(worldToEye);
  const reflection = normalize(reflect(host.sunDirection.negate(), surfaceNormal));
  const direction = max(0.0, dot(eyeDirection, reflection));
  const specularLight = pow(direction, 100).mul(host.sunColor).mul(tuning.specularStrength);
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
  material.positionNode = positionLocal.add(
    vec3(0, 0, waterSurfaceYOffsetTsl(macroSurfaceWorldXZ(), waterWaveUniforms)),
  );
  const edgeAlpha = applyWaterEdgeFade(host.alpha, edgeFade);
  const sunShadowOpts = { sunShadow, uShadowFloor, uSunIntensity };
  const worldXZ = positionWorld.xz;
  const shoreDepth = shore ? waterDepthBelowSurface(worldXZ, shore) : null;
  const refractMask =
    shore && shoreDepth ? waterRefractionMaskTsl(worldXZ, shore, shoreDepth) : null;
  if (shore && refractMask) {
    material.fogBypassNode = waterShoreFogBypassTsl(refractMask, shore);
  }
  material.opacityNode =
    shore && shoreDepth
      ? waterRefractionOpacityCompensateTsl(
          waterDepthOpacityTsl(edgeAlpha, worldXZ, shore, sunShadowOpts, shoreDepth),
          refractMask,
          shore,
        )
      : edgeAlpha;
  material.receivedShadowPositionNode = tuning.shadowReceiveDistortion
    ? positionWorld.add(distortion)
    : positionWorld;

  return {
    ...host,
    material,
    shore,
    shoreDepth,
    refractMask,
    viewportScene,
    sunShadow,
    sunShadowOpts,
    edgeAlpha,
    worldXZ,
    surfaceNormal,
    eyeDirection,
    specularLight,
    diffuseLight,
    distance,
    distortion,
    fresnel,
  };
}

export { applySunShadowVisibility };
