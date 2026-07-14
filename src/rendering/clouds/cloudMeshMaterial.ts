// src/rendering/clouds/cloudMeshMaterial.ts — TSL soft-sphere cloud particles (mesh cluster)
import {
  Color,
  DataTexture,
  FloatType,
  FrontSide,
  RedFormat,
  type Texture,
  Vector3,
} from 'three';
import {
  cameraPosition,
  dot,
  float,
  max,
  mix,
  normalWorld,
  normalize,
  positionWorld,
  pow,
  smoothstep,
  texture,
  uniform,
  vec2,
} from 'three/tsl';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import { terrainMapUv } from '../../map/mapUvTsl';
import { WORLD } from '../../world/WorldConfig';
import { readCloudSettings, type CloudSettings } from './cloudConfig';

type UniformNode = ReturnType<typeof uniform>;
type TslNode = any;

/** After water (`renderOrder` 1), before glow/props. */
export const CLOUD_MESH_RENDER_ORDER = 2;

const _placeholderHeight = new DataTexture(new Float32Array([0]), 1, 1, RedFormat, FloatType);
_placeholderHeight.needsUpdate = true;

export interface CloudMeshUniforms {
  uSunDir: { value: Vector3 };
  uSunColor: { value: Color };
  uAmbientColor: { value: Color };
  uBaseColor: { value: Color };
  uOpacity: UniformNode;
  uFacingPow: UniformNode;
  uEdgeSoftness: UniformNode;
  uTerrainInteractionEnabled: UniformNode;
  uHeightTex: ReturnType<typeof texture>;
  uWorldSize: UniformNode;
  uHeightScale: UniformNode;
  uTerrainClearanceM: UniformNode;
  uTerrainFadeBelowM: UniformNode;
}

export function createCloudMeshUniforms(): CloudMeshUniforms {
  const defaults = readCloudSettings();
  return {
    uSunDir: uniform(new Vector3(0.3, 0.8, 0.5).normalize()),
    uSunColor: uniform(new Color(0xfff8e7)),
    uAmbientColor: uniform(new Color(0xb0c4de)),
    uBaseColor: uniform(new Color(0xffffff)),
    uOpacity: uniform(defaults.opacity),
    uFacingPow: uniform(defaults.facingPow),
    uEdgeSoftness: uniform(defaults.edgeSoftness),
    uTerrainInteractionEnabled: uniform(defaults.terrainInteractionEnabled ? 1 : 0),
    uHeightTex: texture(_placeholderHeight),
    uWorldSize: uniform(WORLD.SIZE),
    uHeightScale: uniform(WORLD.HEIGHT_SCALE),
    uTerrainClearanceM: uniform(defaults.terrainClearanceM),
    uTerrainFadeBelowM: uniform(defaults.terrainFadeBelowM),
  };
}

export interface CloudMeshLighting {
  sunDir: Vector3;
  sunColor: Color;
  ambientColor: Color;
  baseColor?: Color;
  opacity?: number;
}

export function syncCloudMeshLighting(
  uniforms: CloudMeshUniforms,
  lighting: CloudMeshLighting,
): void {
  uniforms.uSunDir.value.copy(lighting.sunDir).normalize();
  uniforms.uSunColor.value.copy(lighting.sunColor);
  uniforms.uAmbientColor.value.copy(lighting.ambientColor);
  if (lighting.baseColor) uniforms.uBaseColor.value.copy(lighting.baseColor);
  if (lighting.opacity !== undefined) uniforms.uOpacity.value = lighting.opacity;
}

/** Live soft-rim + terrain soft-fade tunables from CloudSettings. */
export function syncCloudMeshTerrainUniforms(
  uniforms: CloudMeshUniforms,
  settings: CloudSettings,
): void {
  uniforms.uFacingPow.value = settings.facingPow;
  uniforms.uEdgeSoftness.value = settings.edgeSoftness;
  uniforms.uTerrainInteractionEnabled.value = settings.terrainInteractionEnabled ? 1 : 0;
  uniforms.uTerrainClearanceM.value = settings.terrainClearanceM;
  uniforms.uTerrainFadeBelowM.value = settings.terrainFadeBelowM;
}

/** Bind macro height texture after terrain build (same pattern as prop ground contact). */
export function bindCloudMeshHeightTexture(
  uniforms: CloudMeshUniforms,
  heightMap: Texture,
  worldSize: number,
  heightScale: number,
): void {
  uniforms.uHeightTex.value = heightMap;
  uniforms.uWorldSize.value = worldSize;
  uniforms.uHeightScale.value = heightScale;
}

/**
 * Instanced unit-sphere material — wrap diffuse, mild SSS, soft-particle rim alpha,
 * optional terrain soft-fade via macro height map.
 */
export function createCloudMeshMaterial(
  uniforms: CloudMeshUniforms = createCloudMeshUniforms(),
): MeshBasicNodeMaterial {
  const uSunDir = uniforms.uSunDir as TslNode;
  const uSunColor = uniforms.uSunColor as TslNode;
  const uAmbientColor = uniforms.uAmbientColor as TslNode;
  const uBaseColor = uniforms.uBaseColor as TslNode;
  const uOpacity = uniforms.uOpacity as TslNode;
  const uFacingPow = uniforms.uFacingPow as TslNode;
  const uEdgeSoftness = uniforms.uEdgeSoftness as TslNode;
  const uTerrainEnabled = uniforms.uTerrainInteractionEnabled as TslNode;
  const uHeightTex = uniforms.uHeightTex as TslNode;
  const uWorldSize = uniforms.uWorldSize as TslNode;
  const uHeightScale = uniforms.uHeightScale as TslNode;
  const uClearance = uniforms.uTerrainClearanceM as TslNode;
  const uFadeBelow = uniforms.uTerrainFadeBelowM as TslNode;

  const material = new MeshBasicNodeMaterial({
    transparent: true,
    depthWrite: false,
  });
  material.fog = false;
  // Front faces only — DoubleSide hardens silhouettes through translucent backs.
  material.side = FrontSide;
  material.forceSinglePass = true;
  material.precision = 'mediump';

  const N = normalize(normalWorld);
  const L = normalize(uSunDir);
  const viewDir = normalize(cameraPosition.sub(positionWorld));

  const diff = dot(N, L).mul(0.5).add(0.5);
  const sss = pow(max(dot(N.negate(), L), float(0)), float(2)).mul(0.4);
  const topBias = smoothstep(float(-0.2), float(0.5), N.y).mul(0.3);
  const baseDarken = smoothstep(float(0.3), float(-0.3), N.y).mul(0.3);

  const sunLit = uSunColor.mul(diff).add(uAmbientColor.mul(0.4)).add(uSunColor.mul(sss));
  let lit = uBaseColor.mul(sunLit).add(uSunColor.mul(topBias));
  lit = lit.mul(float(1).sub(baseDarken));

  // Soft-particle rim: N·V falloff + smoothstep band so silhouettes dissolve.
  const nDotV = max(dot(N, viewDir), float(0));
  const softPow = pow(nDotV, uFacingPow);
  const softEdge = smoothstep(float(0), uEdgeSoftness, nDotV);
  const facing = softPow.mul(softEdge);

  const worldXZ = vec2(positionWorld.x, positionWorld.z);
  const terrainY = uHeightTex.sample(terrainMapUv(uWorldSize, worldXZ)).r.mul(uHeightScale);
  const heightAbove = positionWorld.y.sub(terrainY);
  const terrainFade = smoothstep(uFadeBelow.negate(), uClearance, heightAbove);
  const terrainMul = mix(float(1), terrainFade, uTerrainEnabled);
  const alpha = uOpacity.mul(facing).mul(terrainMul);

  material.colorNode = lit;
  material.opacityNode = alpha;

  return material;
}
