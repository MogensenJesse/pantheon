// src/rendering/clouds/cloudMeshMaterial.ts - TSL soft-sphere cloud particles (mesh cluster)

import type { DirectionalLight } from 'three';
import { Color, DataTexture, FloatType, FrontSide, RedFormat, type Texture, Vector3 } from 'three';
import {
  attribute,
  cameraPosition,
  clamp,
  Discard,
  dot,
  Fn,
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
import { WORLD } from '../../config/world';
import { terrainMapUv } from '../../map/mapUvTsl';
import { getValleyFogNightAreaNode, getValleyFogUniforms, mixTowardFog } from '../atmosphere';
import { computeEffectiveSunShadowFloor, createSunShadowNode } from '../sunShadow';
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
  /** 0–1 animated warp of the rounded edge. */
  uTurbulence: UniformNode;
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
    uMassNormalMix: uniform(defaults.massNormalMix),
    uBaseShade: uniform(defaults.baseShade),
    uSelfShadow: uniform(defaults.selfShadow),
    uSilverStrength: uniform(defaults.silverStrength),
    uSilverG: uniform(defaults.silverG),
    uCornerRadius: uniform(defaults.cornerRadius),
    uTurbulence: uniform(defaults.turbulence),
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
  uniforms.uMassNormalMix.value = settings.massNormalMix;
  uniforms.uBaseShade.value = settings.baseShade;
  uniforms.uSelfShadow.value = settings.selfShadow;
  uniforms.uSilverStrength.value = settings.silverStrength;
  uniforms.uSilverG.value = settings.silverG;
  uniforms.uCornerRadius.value = settings.cornerRadius;
  uniforms.uTurbulence.value = settings.turbulence;
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
  const uWispScaleB = uniforms.uWispScaleB as TslNode;
  const uWispSpeed = uniforms.uWispSpeed as TslNode;
  const uTerrainEnabled = uniforms.uTerrainInteractionEnabled as TslNode;
  const uHeightTex = uniforms.uHeightTex as TslNode;
  const uWorldSize = uniforms.uWorldSize as TslNode;
  const uHeightScale = uniforms.uHeightScale as TslNode;
  const uClearance = uniforms.uTerrainClearanceM as TslNode;
  const uFadeBelow = uniforms.uTerrainFadeBelowM as TslNode;
  const uDomainHalf = uniforms.uDomainHalf as TslNode;
  const uEdgeFadeM = uniforms.uEdgeFadeM as TslNode;
  const uCornerRadius = uniforms.uCornerRadius as TslNode;
  const uTurbulence = uniforms.uTurbulence as TslNode;

  const N = normalize(normalWorld);
  const viewDir = normalize(cameraPosition.sub(positionWorld));
  const nDotV = max(dot(N, viewDir), float(0));

  // Both samples are world-space so overlapping puffs share one cotton field.
  const coarse = triNoise3D(positionWorld.mul(uWispScaleA), uWispSpeed, uTime);
  const fine = triNoise3D(
    positionWorld.mul(uWispScaleB).add(vec3(19.2, 7.1, 3.4)),
    uWispSpeed,
    uTime,
  );

  const rim = float(1).sub(nDotV);
  // Coarse lumps shift the whole falloff, not just the rim, so the outline is not a circle.
  const lump = coarse.sub(0.5).mul(uWispStrength).mul(0.9);
  const nDotVSoft = max(nDotV.add(lump), float(0));

  const softPowAmt = uFacingPow.add(uRadialSoftness.mul(2.5));
  const softPow = pow(nDotVSoft, softPowAmt);
  // Fine fiber eats the fringe. The core stays filled so overlaps do not punch holes.
  const fiber = smoothstep(float(0.2), float(0.8), fine);
  const cotton = mix(float(1), fiber, uWispStrength.mul(rim.add(0.15)).mul(0.8));

  // The mesh clip is a polygon. Inset the smooth N·V contour so the visible edge
  // sits inside that polygon (a rounder limb, not holes at the vertices).
  // Turbulence shoves the contour so the outline drifts.
  const turb = triNoise3D(positionWorld.mul(float(0.12)), float(0.25), uTime).sub(0.5);
  const nDotVRound = max(nDotVSoft.add(turb.mul(uTurbulence).mul(0.55)), float(0));
  const inset = uCornerRadius.mul(0.5);
  const rounded = smoothstep(inset, inset.add(uEdgeSoftness), nDotVRound);
  const facing = softPow.mul(rounded).mul(cotton);

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
 * valley haze mix, mass-shaded wrap lighting, and sun shadow *receive*.
 *
 * depthWrite stays off (soft particles). Instance matrices are sorted back-to-front in
 * MeshCloudSystem so nearer puffs composite over farther ones without cutout banding.
 * Cast uses configureMeshShadowCast with the shared opaque depth material into the
 * dedicated soft cloud-cast map (CLOUD_SHADOW_LAYER — not the PCSS sun map).
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

  const uTime = uniform(0).onFrameUpdate((frame: { time: number }) => frame.time);
  const sunShadow = createSunShadowNode(sun);
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

  // Terrain / prop umbra on the directional sun term only (ambient stays).
  const sunVisRaw = (computeEffectiveSunShadowFloor as any)(sunShadow, uShadowFloor, uSunIntensity);
  const sunVis = mix(float(1), sunVisRaw, uReceiveShadows);

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

  const { facing, terrainMul, domainMul } = buildCloudFacingAlpha(uniforms, uTime);
  // Bank-shared condensation plane (aDeckClip.x = cluster deck world Y; y = enable).
  // Hard discard below the plane so per-puff soft under-hang cannot stack as tiered ribs.
  // Feather only a few meters AT/above the cut for soft rims. Cirrus: y=0 bypass.
  // Discard must run inside Fn assigned to opacityNode - a top-level Discard().toStack()
  // during material setup never enters the live fragment graph (pass 3 looked like a no-op).
  // Does not touch facingPow / rim / colors / wisp defaults.
  const aDeckClip = attribute('aDeckClip', 'vec2');
  const aboveDeck = positionWorld.y.sub(aDeckClip.x);
  const deckFeather = smoothstep(float(0), float(2.5), aboveDeck);
  const deckMul = mix(float(1), deckFeather, aDeckClip.y);
  let alpha = uOpacity.mul(facing).mul(terrainMul).mul(domainMul).mul(deckMul);

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

  material.colorNode = lit;
  // Hard kill below bank deck on the LIVE opacity path (same Fn stack as sparkle Discard).
  material.opacityNode = Fn(() => {
    Discard(aDeckClip.y.greaterThan(float(0.5)).and(aboveDeck.lessThan(float(0))));
    return alpha;
  })();

  return material;
}
