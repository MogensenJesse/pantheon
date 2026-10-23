// src/rendering/clouds/cloudMeshMaterial.ts - TSL soft-sphere cloud particles (mesh cluster)

import type { DirectionalLight } from 'three';
import {
  Color,
  DataTexture,
  FloatType,
  FrontSide,
  RedFormat,
  type Texture,
  Vector2,
  Vector3,
} from 'three';
import {
  attribute,
  cameraPosition,
  clamp,
  cos,
  dot,
  float,
  fract,
  max,
  mix,
  modelWorldMatrix,
  modelWorldMatrixInverse,
  normalize,
  normalWorld,
  positionGeometry,
  positionLocal,
  positionWorld,
  pow,
  sin,
  smoothstep,
  texture,
  triNoise3D,
  uniform,
  vec2,
  vec3,
  vec4,
} from 'three/tsl';
import { MeshBasicNodeMaterial, NodeMaterial } from 'three/webgpu';
import { WORLD } from '../../config/world';
import { headingToXZ } from '../../core/math/geom';
import { terrainGridUv } from '../../map/mapUvTsl';
import { getValleyFogNightAreaNode, getValleyFogUniforms, mixTowardFog } from '../atmosphere';
import {
  computeEffectiveSunShadowFloor,
  createFarSunShadowNode,
  farShadowEdgeWeight,
} from '../sunShadow';
import { type CloudSettings, readCloudSettings } from './cloudConfig';
import { getCloudLifeDebug } from './cloudDevState';

type UniformNode = ReturnType<typeof uniform>;
type TslNode = any;

/** After water (`renderOrder` 1), before glow/props. */
export const CLOUD_MESH_RENDER_ORDER = 2;

const _placeholderHeight = new DataTexture(new Float32Array([0]), 1, 1, RedFormat, FloatType);
_placeholderHeight.needsUpdate = true;

const _heading = { x: 0, z: 0 };

function windDirFromDeg(deg: number, out: Vector2): Vector2 {
  const { x, z } = headingToXZ(deg, _heading);
  return out.set(x, z);
}

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
  uWispStrength: UniformNode;
  uWispScaleA: UniformNode;
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
  /** Blend sphere normal → cluster mass normal (0–1). */
  uMassNormalMix: UniformNode;
  /** Darken flat cloud bases from aCloudMass.y (0–1). */
  uBaseShade: UniformNode;
  /** In-mass self-shadow power on sun term. */
  uSelfShadow: UniformNode;
  /** Henyey–Greenstein silver-lining strength. */
  uSilverStrength: UniformNode;
  /** HG anisotropy g (~0.6 forward scatter). */
  uSilverG: UniformNode;
  /** 0–1 fillet of the low-poly puff silhouette. */
  uCornerRadius: UniformNode;
  /** Shared shader clock. */
  uTime: UniformNode;
  /** Local-space puff shear. */
  uBoilAmount: UniformNode;
  uBoilSpeed: UniformNode;
  /** Extra height above the puff bottom. */
  uGrowAmount: UniformNode;
  uGrowSpeed: UniformNode;
  /** Instance yaw basis (sin, cos of wind direction). Matches the matrix write. */
  uWindDir: { value: Vector2 };
  /** 0 holds every cloud solid. */
  uLifeAmount: UniformNode;
  /** World-space frequency of the life noise. */
  uLifeNoiseFreq: UniformNode;
  /** Noise-space drift per second. */
  uLifeScroll: UniformNode;
  /** Horizontal extent (m) that fully follows the noise. */
  uLifeExtentLo: UniformNode;
  /** Horizontal extent (m) that stays solid. */
  uLifeExtentHi: UniformNode;
  /** 1 draws the fade multiplier instead of hiding clouds. */
  uLifeDebug: UniformNode;
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
    uWispStrength: uniform(defaults.wispStrength),
    uWispScaleA: uniform(defaults.wispScaleA),
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
    uMassNormalMix: uniform(defaults.massNormalMix),
    uBaseShade: uniform(defaults.baseShade),
    uSelfShadow: uniform(defaults.selfShadow),
    uSilverStrength: uniform(defaults.silverStrength),
    uSilverG: uniform(defaults.silverG),
    uCornerRadius: uniform(defaults.cornerRadius),
    uTime: uniform(0).onFrameUpdate((frame: { time: number }) => frame.time),
    uBoilAmount: uniform(defaults.boilAmount),
    uBoilSpeed: uniform(defaults.boilSpeed),
    uGrowAmount: uniform(defaults.growAmount),
    uGrowSpeed: uniform(defaults.growSpeed),
    uWindDir: uniform(windDirFromDeg(defaults.windDirectionDeg, new Vector2())),
    uLifeAmount: uniform(defaults.lifeAmount),
    uLifeNoiseFreq: uniform(defaults.lifeNoiseFreq),
    uLifeScroll: uniform(defaults.lifeScroll),
    uLifeExtentLo: uniform(defaults.lifeExtentLo),
    uLifeExtentHi: uniform(defaults.lifeExtentHi),
    uLifeDebug: uniform(0),
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

/** Live soft-rim, wisp, flatten, haze, shadow receive + terrain soft-fade + mass shading tunables. */
export function syncCloudMeshTerrainUniforms(
  uniforms: CloudMeshUniforms,
  settings: CloudSettings,
): void {
  uniforms.uFacingPow.value = settings.facingPow;
  uniforms.uEdgeSoftness.value = settings.edgeSoftness;
  uniforms.uWispStrength.value = settings.wispStrength;
  uniforms.uWispScaleA.value = settings.wispScaleA;
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
  uniforms.uMassNormalMix.value = settings.massNormalMix;
  uniforms.uBaseShade.value = settings.baseShade;
  uniforms.uSelfShadow.value = settings.selfShadow;
  uniforms.uSilverStrength.value = settings.silverStrength;
  uniforms.uSilverG.value = settings.silverG;
  uniforms.uCornerRadius.value = settings.cornerRadius;
  uniforms.uBoilAmount.value = settings.boilAmount;
  uniforms.uBoilSpeed.value = settings.boilSpeed;
  uniforms.uGrowAmount.value = settings.growAmount;
  uniforms.uGrowSpeed.value = settings.growSpeed;
  windDirFromDeg(settings.windDirectionDeg, uniforms.uWindDir.value);
  uniforms.uLifeAmount.value = settings.lifeAmount;
  uniforms.uLifeNoiseFreq.value = settings.lifeNoiseFreq;
  uniforms.uLifeScroll.value = settings.lifeScroll;
  uniforms.uLifeExtentLo.value = settings.lifeExtentLo;
  uniforms.uLifeExtentHi.value = settings.lifeExtentHi;
  uniforms.uLifeDebug.value = getCloudLifeDebug() ? 1 : 0;
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
  center: TslNode,
): { facing: TslNode; terrainMul: TslNode; domainMul: TslNode } {
  const uFacingPow = uniforms.uFacingPow as TslNode;
  const uEdgeSoftness = uniforms.uEdgeSoftness as TslNode;
  const uWispStrength = uniforms.uWispStrength as TslNode;
  const uWispScaleA = uniforms.uWispScaleA as TslNode;
  const uWispSpeed = uniforms.uWispSpeed as TslNode;
  const uTerrainEnabled = uniforms.uTerrainInteractionEnabled as TslNode;
  const uHeightTex = uniforms.uHeightTex as TslNode;
  const uWorldSize = uniforms.uWorldSize as TslNode;
  const uHeightScale = uniforms.uHeightScale as TslNode;
  const uClearance = uniforms.uTerrainClearanceM as TslNode;
  const uFadeBelow = uniforms.uTerrainFadeBelowM as TslNode;
  const uCornerRadius = uniforms.uCornerRadius as TslNode;

  // Direction from the puff center to the displaced fragment, so boil and the
  // deck clip don't leave the soft edge on the original sphere.
  const N = normalize(positionWorld.sub(center));
  const viewDir = normalize(cameraPosition.sub(positionWorld));
  const nDotV = max(dot(N, viewDir), float(0));

  // One world-space sample so overlapping puffs share the same lumps.
  const coarse = triNoise3D(positionWorld.mul(uWispScaleA), uWispSpeed, uTime);

  // Coarse lumps shift the whole falloff, so the outline is not a circle.
  const lump = coarse.sub(0.5).mul(uWispStrength).mul(0.9);
  const nDotVSoft = max(nDotV.add(lump), float(0));

  const softPow = pow(nDotVSoft, uFacingPow);

  // The mesh clip is a polygon. Inset the smooth N·V contour so the visible edge
  // sits inside that polygon (a rounder limb, not holes at the vertices).
  const inset = uCornerRadius.mul(0.5);
  const rounded = smoothstep(inset, inset.add(uEdgeSoftness), nDotVSoft);
  const facing = softPow.mul(rounded);

  const worldXZ = vec2(positionWorld.x, positionWorld.z);
  const terrainY = uHeightTex.sample(terrainGridUv(uWorldSize, worldXZ)).r.mul(uHeightScale);
  const heightAbove = positionWorld.y.sub(terrainY);
  const terrainFade = smoothstep(uFadeBelow.negate(), uClearance, heightAbove);
  const terrainMul = mix(float(1), terrainFade, uTerrainEnabled);

  return { facing, terrainMul, domainMul: domainFade(uniforms, positionWorld) };
}

/**
 * Soft dissolve at the wind-wrap box so toroidal teleport isn't a hard pop.
 * Fade band: opacity 1 inside (half − edgeFade) → 0 at ±half.
 */
function domainFade(uniforms: CloudMeshUniforms, p: TslNode): TslNode {
  const uDomainHalf = uniforms.uDomainHalf as TslNode;
  const fadeW = max(uniforms.uEdgeFadeM as TslNode, float(0.001));
  const inner = uDomainHalf.sub(fadeW);
  const fadeX = smoothstep(uDomainHalf, inner, p.x.abs());
  const fadeZ = smoothstep(uDomainHalf, inner, p.z.abs());
  return fadeX.mul(fadeZ);
}

/**
 * Instanced unit-sphere material — soft-particle fade, fog-style wisps, world light scale,
 * valley haze mix, mass-shaded wrap lighting, and sun shadow *receive*.
 *
 * depthWrite stays off (soft particles). Instance matrices are sorted back-to-front in
 * MeshCloudSystem so nearer puffs composite over farther ones without cutout banding.
 * Cast uses {@link createCloudCasterMaterial} into the dedicated soft cloud-cast map
 * (CLOUD_SHADOW_LAYER — not the PCSS sun map).
 */
/**
 * Boil and grow on the unit sphere, then scale into the instanced puff.
 * positionLocal is already in meters (instance matrix applied), so a raw
 * 0.6 offset is 0.6 m and disappears on a puff tens of meters across.
 * Phase comes from aCloudMass, which stays with the puff when draw order changes.
 * The underside of the unit sphere stays planted. Lobes above it shear and rise.
 */
function cloudLifePosition(
  uniforms: CloudMeshUniforms,
  aDeckClip: TslNode,
  aCloudMass: TslNode,
): { position: TslNode; center: TslNode } {
  const uTime = uniforms.uTime as TslNode;
  const uBoilAmount = uniforms.uBoilAmount as TslNode;
  const uBoilSpeed = uniforms.uBoilSpeed as TslNode;
  const uGrowAmount = uniforms.uGrowAmount as TslNode;
  const uGrowSpeed = uniforms.uGrowSpeed as TslNode;
  const uWindDir = uniforms.uWindDir as TslNode;
  const unit = positionGeometry;
  const phase = fract(
    sin(aCloudMass.x.mul(12.9898).add(aCloudMass.y.mul(78.233)).add(aCloudMass.z.mul(37.719))).mul(
      43758.5453,
    ),
  );
  const boilT = uTime.mul(uBoilSpeed).add(phase.mul(6.283185));
  const liftMask = smoothstep(float(-1), float(-0.2), unit.y);
  const boil = uBoilAmount.mul(liftMask);
  const along = sin(boilT).mul(cos(boilT.mul(0.73).add(phase)));
  const cross = cos(boilT.mul(1.37).add(phase.mul(2.1)));
  const grow = float(1).add(uGrowAmount.mul(sin(uTime.mul(uGrowSpeed).add(phase.mul(6.283185)))));
  const sheared = unit
    .add(vec3(1, 0, 0).mul(along.mul(boil)))
    .add(vec3(0, 0, 1).mul(cross.mul(boil)));
  const yDelta = sheared.y.add(float(1)).mul(grow.sub(float(1)));
  const deformed = sheared.add(vec3(0, 1, 0).mul(yDelta));
  const delta = deformed.sub(unit);
  const scale = attribute('aPuffScale', 'vec3');
  const windX = uWindDir.x;
  const windZ = uWindDir.y;
  const crossX = windZ.negate();
  const crossZ = windX;
  const alongM = delta.x.mul(scale.x);
  const crossM = delta.z.mul(scale.z);
  const meshDelta = vec3(1, 0, 0)
    .mul(windX.mul(alongM).add(crossX.mul(crossM)))
    .add(vec3(0, 1, 0).mul(delta.y.mul(scale.y)))
    .add(vec3(0, 0, 1).mul(windZ.mul(alongM).add(windX.mul(crossM))));
  const placed = positionLocal.add(meshDelta);
  const world = modelWorldMatrix.mul(vec4(placed, float(1))).xyz;
  const cappedY = mix(world.y, max(world.y, aDeckClip.x), aDeckClip.y);
  const spun = vec3(
    windX.mul(scale.x).mul(unit.x).add(crossX.mul(scale.z).mul(unit.z)),
    scale.y.mul(unit.y),
    windZ.mul(scale.x).mul(unit.x).add(crossZ.mul(scale.z).mul(unit.z)),
  );
  const center = modelWorldMatrix
    .mul(vec4(positionLocal.sub(spun), float(1)))
    .xyz.toVarying('vCloudPuffCenter');
  return {
    position: modelWorldMatrixInverse.mul(vec4(vec3(world.x, cappedY, world.z), float(1))).xyz,
    center,
  };
}

/**
 * Soften the flattened underside rim. The cap center stays; the 10-gon shell
 * (facet chord ≈ 0.95 of the circle) fades out before the triangle ends.
 */
function cloudDeckShellFade(center: TslNode, aDeckClip: TslNode): TslNode {
  const scale = attribute('aPuffScale', 'vec3');
  const sy = max(scale.y, float(0.001));
  const planeUnitY = aDeckClip.x.sub(center.y).div(sy);
  const depth = planeUnitY.sub(positionGeometry.y);
  const onCap = smoothstep(float(-0.02), float(0.08), depth);
  const r2 = max(float(1).sub(planeUnitY.mul(planeUnitY)), float(0.04));
  const radial = positionGeometry.x
    .mul(positionGeometry.x)
    .add(positionGeometry.z.mul(positionGeometry.z));
  const rim = radial.div(r2);
  const rimFade = float(1).sub(smoothstep(float(0.75), float(0.92), rim));
  return mix(float(1), rimFade, onCap.mul(aDeckClip.y));
}

/** Smooth 2D field. Sines have no cell boundaries, so a cloud cannot step when it crosses one. */
function lifeWave(p: TslNode): TslNode {
  const px = p.x as TslNode;
  const py = p.y as TslNode;
  const a = sin(px.mul(6.283185)).mul(0.5).add(0.5);
  const b = sin(py.mul(6.283185).add(1.7)).mul(0.5).add(0.5);
  const c = sin(px.mul(1.7).add(py.mul(2.3).add(0.6)))
    .mul(0.5)
    .add(0.5);
  return a.mul(0.5).add(b.mul(0.3)).add(c.mul(0.2));
}

/**
 * Opacity multiplier shared by every vertex of a puff.
 * Samples noise at the cloud anchor so every puff in that cloud shares one gate.
 * Extents past uLifeExtentHi stay solid.
 */
function cloudLifeFade(uniforms: CloudMeshUniforms, aCloudMass: TslNode): TslNode {
  const uTime = uniforms.uTime as TslNode;
  const uLifeAmount = uniforms.uLifeAmount as TslNode;
  const uLifeNoiseFreq = uniforms.uLifeNoiseFreq as TslNode;
  const uLifeScroll = uniforms.uLifeScroll as TslNode;
  const uLifeExtentLo = uniforms.uLifeExtentLo as TslNode;
  const uLifeExtentHi = uniforms.uLifeExtentHi as TslNode;
  const origin = attribute('aPuffOrigin', 'vec2');
  const scroll = uTime.mul(uLifeScroll);
  const sample = origin.mul(uLifeNoiseFreq).add(
    vec2(1, 0)
      .mul(scroll)
      .add(vec2(0, 1).mul(scroll.mul(0.37))),
  );
  const wave = lifeWave(sample);
  const gate = wave.mul(wave).mul(float(3).sub(wave.mul(2)));
  const extentHi = max(uLifeExtentHi, uLifeExtentLo.add(float(1)));
  const fadeResponse = float(1).sub(smoothstep(uLifeExtentLo, extentHi, aCloudMass.w));
  return mix(float(1), gate, fadeResponse.mul(uLifeAmount)).toVarying('vCloudLifeFade');
}

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
  const uMassNormalMix = uniforms.uMassNormalMix as TslNode;
  const uBaseShade = uniforms.uBaseShade as TslNode;
  const uSelfShadow = uniforms.uSelfShadow as TslNode;
  const uSilverStrength = uniforms.uSilverStrength as TslNode;
  const uSilverG = uniforms.uSilverG as TslNode;

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

  const uTime = uniforms.uTime as TslNode;
  const sunShadow = createFarSunShadowNode(sun);
  // Lift sample along +Y so soft spheres pick up terrain umbra without as much self-acne.
  material.receivedShadowPositionNode = positionWorld.add(vec3(0, uShadowSampleLiftM, 0));

  const N = normalize(normalWorld);
  const aCloudMass = attribute('aCloudMass', 'vec4');
  // Tiny +Y bias so normalize stays stable if a proxy sits at mass center.
  const massN = normalize(aCloudMass.xyz.add(vec3(0, 0.0001, 0)));
  const N2 = normalize(mix(N, massN, uMassNormalMix));
  const L = normalize(uSunDir);
  const viewDir = normalize(cameraPosition.sub(positionWorld));

  // Wrap / facing / rim driven by blended mass normal so the cluster reads as one lit mass.
  const wrap = dot(N2, L).mul(0.5).add(0.5);
  const dir = pow(wrap, float(1.35));
  const sunFacing = max(dot(N2, L), float(0));
  const sss = pow(max(dot(N2.negate(), L), float(0)), float(2)).mul(0.35);
  const topBias = smoothstep(float(-0.2), float(0.5), N2.y).mul(0.22);
  // Height gradient from mass Y: dark flat bases, bright tops (replaces per-sphere N.y darken).
  const baseDarken = smoothstep(float(0.35), float(-0.45), aCloudMass.y).mul(uBaseShade);
  // Soft rim when the sun grazes the silhouette (classic low-sun cloud edge light).
  const nDotV = max(dot(N, viewDir), float(0));
  const rim = pow(float(1).sub(nDotV), float(2.2)).mul(sunFacing.add(0.15)).mul(0.55);

  // Cheap in-mass self-shadow on the sun term.
  const selfShadow = pow(clamp(dot(massN, L).mul(0.5).add(0.5), float(0), float(1)), uSelfShadow);

  // Silver lining: HG phase on view↔−sun × rim × sun (golden-hour backlit edges).
  const mu = clamp(dot(viewDir, L.negate()), float(-1), float(1));
  const g = uSilverG;
  const g2 = g.mul(g);
  const hgDenom = pow(float(1).add(g2).sub(float(2).mul(g).mul(mu)), float(1.5));
  const hg = float(1)
    .sub(g2)
    .div(max(hgDenom, float(0.001)));
  const silver = uSunColor.mul(hg).mul(float(1).sub(nDotV)).mul(uSilverStrength);

  // Terrain / prop umbra on the directional sun term only (ambient stays). The far map is a
  // ±200 m light-view square: fade it out at the edge so the square is not a line across the sky.
  const sunVisRaw = (computeEffectiveSunShadowFloor as any)(sunShadow, uShadowFloor, uSunIntensity);
  const sunVis = mix(float(1), sunVisRaw, uReceiveShadows.mul(float(1).sub(farShadowEdgeWeight())));

  const sunTerm = uSunColor
    .mul(dir.add(sunFacing.mul(0.4)))
    .add(uSunColor.mul(sss))
    .add(uSunColor.mul(rim))
    .add(uSunColor.mul(topBias))
    .add(silver)
    .mul(sunVis)
    .mul(selfShadow);
  // Hemisphere ambient: sky ambient on top, darker bounce underneath the mass.
  const hemi = massN.y.mul(0.5).add(0.5);
  const ambTerm = mix(uAmbientColor.mul(0.14), uAmbientColor.mul(0.42), hemi);
  const sunLit = sunTerm.add(ambTerm);
  let lit = uBaseColor.mul(sunLit);
  lit = lit.mul(float(1).sub(baseDarken));
  // Flatten only lightly — keep enough N·L so sun-side vs shade stays visible.
  const flatLit = uBaseColor.mul(uAmbientColor.add(uSunColor.mul(0.45).mul(sunVis)));
  lit = mix(lit, flatLit, uLightFlatten);
  // Mild world cohesion — main dawn dimming is ambient vs boosted sun catch.
  lit = lit.mul(uLightScale);

  const uLifeDebug = uniforms.uLifeDebug as TslNode;
  const aDeckClip = attribute('aDeckClip', 'vec2');
  const posed = cloudLifePosition(uniforms, aDeckClip, aCloudMass);
  material.positionNode = posed.position;
  const { facing, terrainMul, domainMul } = buildCloudFacingAlpha(uniforms, uTime, posed.center);
  const lifeFade = cloudLifeFade(uniforms, aCloudMass);
  let alpha = uOpacity
    .mul(facing)
    .mul(terrainMul)
    .mul(domainMul)
    .mul(cloudDeckShellFade(posed.center, aDeckClip))
    .mul(mix(lifeFade, float(1), uLifeDebug));

  // Night valley term only - clouds stay off scene.fogNode so noon aerial cannot dissolve them.
  const fogArea = getValleyFogNightAreaNode();
  const fogU = getValleyFogUniforms();
  if (!fogArea || !fogU) {
    throw new Error('createCloudMeshMaterial requires initValleyFog first (night valley haze).');
  }
  const hazeAmt = fogArea.mul(uHazeMix) as TslNode;
  const fogColor = (fogU as TslNode).uFogColor as TslNode;
  lit = mixTowardFog(lit, fogColor, hazeAmt);
  alpha = alpha.mul(float(1).sub(hazeAmt.mul(0.45)));
  // White is present, red would be gone. Debug keeps the puff drawn either way.
  const debugColor = mix(vec3(0.86, 0.12, 0.16), vec3(0.9, 0.96, 1), lifeFade);
  lit = mix(lit, debugColor, uLifeDebug);

  material.colorNode = lit;
  material.opacityNode = alpha;

  return material;
}

/**
 * Shadow-pass material for the cloud-cast map. Same puff silhouette as the visible cloud (boil,
 * grow, flat deck base) and no shadow where the cloud has faded out (life noise, wrap edge).
 * Puff centres sit at or above the terrain, so the terrain fade is left out: it would cost a
 * height-texture fetch per shadow fragment. The N·V rim term is left out too: it would shrink the
 * silhouette to the dense core.
 */
export function createCloudCasterMaterial(uniforms: CloudMeshUniforms): NodeMaterial {
  const aCloudMass = attribute('aCloudMass', 'vec4');
  const aDeckClip = attribute('aDeckClip', 'vec2');
  const posed = cloudLifePosition(uniforms, aDeckClip, aCloudMass);

  const material = new NodeMaterial();
  material.name = 'cloud-shadow-cast';
  material.fog = false;
  material.forceSinglePass = true;
  material.transparent = false;
  material.depthWrite = true;
  material.positionNode = posed.position;
  material.opacityNode = cloudLifeFade(uniforms, aCloudMass).mul(
    domainFade(uniforms, posed.center),
  );
  material.alphaTest = 0.5;
  return material;
}
