// src/rendering/clouds/cloudMeshMaterial.ts — TSL soft-sphere cloud particles (mesh cluster)

import type { DirectionalLight } from 'three';
import { Color, DataTexture, FloatType, FrontSide, RedFormat, type Texture, Vector3 } from 'three';
import {
  cameraPosition,
  densityFogFactor,
  dot,
  float,
  max,
  mix,
  normalize,
  normalWorld,
  positionWorld,
  pow,
  smoothstep,
  texture,
  triNoise3D,
  uniform,
  vec2,
  vec3,
} from 'three/tsl';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import { terrainMapUv } from '../../map/mapUvTsl';
import { WORLD } from '../../world/WorldConfig';
import { getValleyFogAreaNode, getValleyFogUniforms } from '../atmosphere/valleyFog';
import {
  computeEffectiveSunShadowFloor,
  createSunShadowNode,
  FORCE_MAX_SHADOW_SOFTNESS,
} from '../sunShadow';
import { type CloudSettings, readCloudSettings } from './cloudConfig';

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
  uLightScale: UniformNode;
  uHazeMix: UniformNode;
  uSunIntensity: UniformNode;
  uShadowFloor: UniformNode;
  uReceiveShadows: UniformNode;
  uShadowSampleLiftM: UniformNode;
  uFacingPow: UniformNode;
  uEdgeSoftness: UniformNode;
  uRadialSoftness: UniformNode;
  uWispStrength: UniformNode;
  uWispScaleA: UniformNode;
  uWispScaleB: UniformNode;
  uWispSpeed: UniformNode;
  uLightFlatten: UniformNode;
  uTerrainInteractionEnabled: UniformNode;
  uHeightTex: ReturnType<typeof texture>;
  uWorldSize: UniformNode;
  uHeightScale: UniformNode;
  uTerrainClearanceM: UniformNode;
  uTerrainFadeBelowM: UniformNode;
  /** Half of wind-wrap domain (spread * 0.5). */
  uDomainHalf: UniformNode;
  /** Soft fade band at domain edges (m). */
  uEdgeFadeM: UniformNode;
}

export function createCloudMeshUniforms(): CloudMeshUniforms {
  const defaults = readCloudSettings();
  return {
    uSunDir: uniform(new Vector3(0.3, 0.8, 0.5).normalize()),
    uSunColor: uniform(new Color(0xfff8e7)),
    uAmbientColor: uniform(new Color(0xb0c4de)),
    uBaseColor: uniform(new Color(0xffffff)),
    uOpacity: uniform(defaults.opacity),
    uLightScale: uniform(1),
    uHazeMix: uniform(defaults.hazeMix),
    uSunIntensity: uniform(0),
    uShadowFloor: uniform(defaults.shadowFloor),
    uReceiveShadows: uniform(defaults.receiveShadows ? 1 : 0),
    uShadowSampleLiftM: uniform(defaults.shadowSampleLiftM),
    uFacingPow: uniform(defaults.facingPow),
    uEdgeSoftness: uniform(defaults.edgeSoftness),
    uRadialSoftness: uniform(defaults.radialSoftness),
    uWispStrength: uniform(defaults.wispStrength),
    uWispScaleA: uniform(defaults.wispScaleA),
    uWispScaleB: uniform(defaults.wispScaleB),
    uWispSpeed: uniform(defaults.wispSpeed),
    uLightFlatten: uniform(defaults.lightFlatten),
    uTerrainInteractionEnabled: uniform(defaults.terrainInteractionEnabled ? 1 : 0),
    uHeightTex: texture(_placeholderHeight),
    uWorldSize: uniform(WORLD.SIZE),
    uHeightScale: uniform(WORLD.HEIGHT_SCALE),
    uTerrainClearanceM: uniform(defaults.terrainClearanceM),
    uTerrainFadeBelowM: uniform(defaults.terrainFadeBelowM),
    uDomainHalf: uniform(defaults.spread * 0.5),
    uEdgeFadeM: uniform(defaults.edgeFadeM),
  };
}

export interface CloudMeshLighting {
  sunDir: Vector3;
  sunColor: Color;
  ambientColor: Color;
  baseColor?: Color;
  opacity?: number;
  lightScale?: number;
  sunIntensity?: number;
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
  if (lighting.lightScale !== undefined) uniforms.uLightScale.value = lighting.lightScale;
  if (lighting.sunIntensity !== undefined) uniforms.uSunIntensity.value = lighting.sunIntensity;
}

/** Live soft-rim, wisp, flatten, haze, shadow receive + terrain soft-fade tunables. */
export function syncCloudMeshTerrainUniforms(
  uniforms: CloudMeshUniforms,
  settings: CloudSettings,
): void {
  uniforms.uFacingPow.value = settings.facingPow;
  uniforms.uEdgeSoftness.value = settings.edgeSoftness;
  uniforms.uRadialSoftness.value = settings.radialSoftness;
  uniforms.uWispStrength.value = settings.wispStrength;
  uniforms.uWispScaleA.value = settings.wispScaleA;
  uniforms.uWispScaleB.value = settings.wispScaleB;
  uniforms.uWispSpeed.value = settings.wispSpeed;
  uniforms.uLightFlatten.value = settings.lightFlatten;
  uniforms.uHazeMix.value = settings.hazeMix;
  uniforms.uShadowFloor.value = settings.shadowFloor;
  uniforms.uReceiveShadows.value = settings.receiveShadows ? 1 : 0;
  uniforms.uShadowSampleLiftM.value = settings.shadowSampleLiftM;
  uniforms.uTerrainInteractionEnabled.value = settings.terrainInteractionEnabled ? 1 : 0;
  uniforms.uTerrainClearanceM.value = settings.terrainClearanceM;
  uniforms.uTerrainFadeBelowM.value = settings.terrainFadeBelowM;
  uniforms.uDomainHalf.value = settings.spread * 0.5;
  uniforms.uEdgeFadeM.value = settings.edgeFadeM;
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
 * Soft-particle alpha shared by color opacity (facing + terrain + domain fade).
 * N·V falloff dissolves silhouette edges; keep it pure (no core floor) so top-down
 * views don't read as stacked opaque discs after back-to-front sort.
 */
function buildCloudFacingAlpha(
  uniforms: CloudMeshUniforms,
  uTime: TslNode,
): { facing: TslNode; terrainMul: TslNode; domainMul: TslNode } {
  const uFacingPow = uniforms.uFacingPow as TslNode;
  const uEdgeSoftness = uniforms.uEdgeSoftness as TslNode;
  const uRadialSoftness = uniforms.uRadialSoftness as TslNode;
  const uWispStrength = uniforms.uWispStrength as TslNode;
  const uWispScaleA = uniforms.uWispScaleA as TslNode;
  const uWispSpeed = uniforms.uWispSpeed as TslNode;
  const uTerrainEnabled = uniforms.uTerrainInteractionEnabled as TslNode;
  const uHeightTex = uniforms.uHeightTex as TslNode;
  const uWorldSize = uniforms.uWorldSize as TslNode;
  const uHeightScale = uniforms.uHeightScale as TslNode;
  const uClearance = uniforms.uTerrainClearanceM as TslNode;
  const uFadeBelow = uniforms.uTerrainFadeBelowM as TslNode;
  const uDomainHalf = uniforms.uDomainHalf as TslNode;
  const uEdgeFadeM = uniforms.uEdgeFadeM as TslNode;

  const N = normalize(normalWorld);
  const viewDir = normalize(cameraPosition.sub(positionWorld));
  const nDotV = max(dot(N, viewDir), float(0));

  const wispNoise = triNoise3D(positionWorld.mul(uWispScaleA), uWispSpeed, uTime);

  const rim = float(1).sub(nDotV);
  // Gentle rim-only wisp — keep carve soft so noise doesn't hard-clip the sphere mesh.
  const wispOffset = wispNoise.sub(0.5).mul(uWispStrength).mul(0.4).mul(rim.add(0.2));
  const nDotVSoft = max(nDotV.add(wispOffset), float(0));

  const softPowAmt = uFacingPow.add(uRadialSoftness.mul(2.5));
  const softPow = pow(nDotVSoft, softPowAmt);
  const softEdge = smoothstep(float(0), uEdgeSoftness, nDotVSoft);
  const wispRimCarve = mix(
    float(1),
    smoothstep(float(0.05), float(0.9), wispNoise),
    uWispStrength.mul(rim).mul(0.7),
  );
  // Soft dissolve only — denser cores come from overlapping sorted particles, not a floor.
  const facing = softPow.mul(softEdge).mul(wispRimCarve);

  const worldXZ = vec2(positionWorld.x, positionWorld.z);
  const terrainY = uHeightTex.sample(terrainMapUv(uWorldSize, worldXZ)).r.mul(uHeightScale);
  const heightAbove = positionWorld.y.sub(terrainY);
  const terrainFade = smoothstep(uFadeBelow.negate(), uClearance, heightAbove);
  const terrainMul = mix(float(1), terrainFade, uTerrainEnabled);

  // Soft dissolve at the wind-wrap box so toroidal teleport isn't a hard pop.
  // fade band: opacity 1 inside (half − edgeFade) → 0 at ±half.
  const fadeW = max(uEdgeFadeM, float(0.001));
  const inner = uDomainHalf.sub(fadeW);
  const fadeX = smoothstep(uDomainHalf, inner, positionWorld.x.abs());
  const fadeZ = smoothstep(uDomainHalf, inner, positionWorld.z.abs());
  const domainMul = fadeX.mul(fadeZ);

  return { facing, terrainMul, domainMul };
}

/**
 * Instanced unit-sphere material — soft-particle fade, fog-style wisps, world light scale,
 * valley haze mix, flattened wrap lighting, and sun shadow *receive*.
 *
 * depthWrite stays off (soft particles). Instance matrices are sorted back-to-front in
 * MeshCloudSystem so nearer puffs composite over farther ones without cutout banding.
 * Cast uses configureMeshShadowCast with the shared opaque depth material (same as props).
 */
export function createCloudMeshMaterial(
  sun: DirectionalLight,
  uniforms: CloudMeshUniforms = createCloudMeshUniforms(),
): MeshBasicNodeMaterial {
  const uSunDir = uniforms.uSunDir as TslNode;
  const uSunColor = uniforms.uSunColor as TslNode;
  const uAmbientColor = uniforms.uAmbientColor as TslNode;
  const uBaseColor = uniforms.uBaseColor as TslNode;
  const uOpacity = uniforms.uOpacity as TslNode;
  const uLightScale = uniforms.uLightScale as TslNode;
  const uHazeMix = uniforms.uHazeMix as TslNode;
  const uLightFlatten = uniforms.uLightFlatten as TslNode;
  const uSunIntensity = uniforms.uSunIntensity as TslNode;
  const uShadowFloor = uniforms.uShadowFloor as TslNode;
  const uReceiveShadows = uniforms.uReceiveShadows as TslNode;
  const uShadowSampleLiftM = uniforms.uShadowSampleLiftM as TslNode;

  const material = new MeshBasicNodeMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
  });
  // Manual haze below — full scene fog over-dissolves mid-altitude puffs.
  material.fog = false;
  material.side = FrontSide;
  material.forceSinglePass = true;
  material.precision = 'mediump';
  // Particle-on-particle umbra is near-contact; force PCSS to softMax so self-shadow stays soft.
  material.userData[FORCE_MAX_SHADOW_SOFTNESS] = true;

  const uTime = uniform(0).onFrameUpdate((frame: { time: number }) => frame.time);
  const sunShadow = createSunShadowNode(sun);
  // Lift sample along +Y so soft spheres pick up terrain umbra without as much self-acne.
  material.receivedShadowPositionNode = positionWorld.add(vec3(0, uShadowSampleLiftM, 0));

  const N = normalize(normalWorld);
  const L = normalize(uSunDir);
  const viewDir = normalize(cameraPosition.sub(positionWorld));

  // Wrap lighting with extra contrast so the sun-facing hemisphere reads clearly.
  const wrap = dot(N, L).mul(0.5).add(0.5);
  const dir = pow(wrap, float(1.35));
  const sunFacing = max(dot(N, L), float(0));
  const sss = pow(max(dot(N.negate(), L), float(0)), float(2)).mul(0.35);
  const topBias = smoothstep(float(-0.2), float(0.5), N.y).mul(0.22);
  const baseDarken = smoothstep(float(0.3), float(-0.3), N.y).mul(0.22);
  // Soft rim when the sun grazes the silhouette (classic low-sun cloud edge light).
  const nDotV = max(dot(N, viewDir), float(0));
  const rim = pow(float(1).sub(nDotV), float(2.2)).mul(sunFacing.add(0.15)).mul(0.55);

  // Terrain / prop umbra on the directional sun term only (ambient stays).
  const sunVisRaw = (computeEffectiveSunShadowFloor as any)(sunShadow, uShadowFloor, uSunIntensity);
  const sunVis = mix(float(1), sunVisRaw, uReceiveShadows);

  const sunTerm = uSunColor
    .mul(dir.add(sunFacing.mul(0.4)))
    .add(uSunColor.mul(sss))
    .add(uSunColor.mul(rim))
    .add(uSunColor.mul(topBias))
    .mul(sunVis);
  const ambTerm = uAmbientColor.mul(0.35);
  const sunLit = sunTerm.add(ambTerm);
  let lit = uBaseColor.mul(sunLit);
  lit = lit.mul(float(1).sub(baseDarken));
  // Flatten only lightly — keep enough N·L so sun-side vs shade stays visible.
  const flatLit = uBaseColor.mul(uAmbientColor.add(uSunColor.mul(0.45).mul(sunVis)));
  lit = mix(lit, flatLit, uLightFlatten);
  // Mild world cohesion — main dawn dimming is ambient vs boosted sun catch.
  lit = lit.mul(uLightScale);

  const { facing, terrainMul, domainMul } = buildCloudFacingAlpha(uniforms, uTime);
  let alpha = uOpacity.mul(facing).mul(terrainMul).mul(domainMul);

  // Valley haze — mix toward fog tint + slight alpha dissolve (honors uFogMaster / disable haze).
  const fogArea = getValleyFogAreaNode();
  const fogU = getValleyFogUniforms();
  if (fogArea && fogU) {
    const hazeAmt = fogArea.mul(uHazeMix) as TslNode;
    const fogColor = (fogU as TslNode).uFogColor as TslNode;
    lit = hazeAmt.mix(lit, fogColor);
    alpha = alpha.mul(float(1).sub(hazeAmt.mul(0.45)));
  } else {
    // Fallback distance dissolve if fog not yet initialized (should be rare).
    const distHaze = densityFogFactor(float(0.0008)).mul(uHazeMix);
    alpha = alpha.mul(float(1).sub(distHaze.mul(0.35)));
  }

  material.colorNode = lit;
  material.opacityNode = alpha;

  return material;
}
