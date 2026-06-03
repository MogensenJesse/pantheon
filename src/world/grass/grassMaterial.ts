// @ts-nocheck — TSL node parameter typings incomplete in r184
// src/world/grass/grassMaterial.ts — SpriteNodeMaterial grass blades (Revo-inspired)
import type { DataTexture, Texture } from 'three';
import {
  EPSILON,
  INFINITY,
  PI2,
  float,
  hash,
  instanceIndex,
  length,
  mix,
  select,
  sin,
  smoothstep,
  step,
  texture,
  uint,
  uv,
  vec2,
  vec3,
} from 'three/tsl';
import { worldXZToMapUv } from '../../map/mapUvTsl';
import { SpriteNodeMaterial } from 'three/webgpu';
import type { GrassSsbo } from './grassSsbo';
import type { GrassSsboRemapBinding } from './grassSsboRemap';
import {
  unpackCurrentScale,
  unpackOffsetX,
  unpackOffsetZ,
  unpackTerrainY,
  unpackVisibility,
} from './grassSsboPack';
import { grassSharedUniforms } from './grassUniforms';
import { sampleGrassWindXZ } from './grassWindTsl';

export interface GrassMaterialMaps {
  biomeMap: DataTexture;
  pathMap: DataTexture;
}

export type GrassRingDebugTint = 'lod0' | 'lod1' | 'lod2';

const RING_DEBUG_COLORS: Record<GrassRingDebugTint, ReturnType<typeof vec3>> = {
  lod0: vec3(0.22, 0.9, 0.42),
  lod1: vec3(0.4, 0.62, 0.98),
  lod2: vec3(0.95, 0.72, 0.28),
};

export function createGrassMaterial(
  ssbo: GrassSsbo,
  maps: GrassMaterialMaps,
  options?: {
    debugRingTint?: GrassRingDebugTint;
    windAtlas?: Texture | null;
    ssboRemap?: GrassSsboRemapBinding | null;
    compactionEnabled?: boolean;
  },
): SpriteNodeMaterial {
  const {
    uBaseBending,
    uCameraForward,
    uTime,
    uWindDirection,
    uWindSpeed,
    uAoRadiusSquared,
    uAoRimSmoothness,
    uAoScale,
    uColorMixFactor,
    uColorVariationStrength,
    uBaseColor,
    uTipColor,
    uBaseShadeHeight,
    uBaseWindShade,
    uSunIntensity,
    uPlayerGlowMul,
    uPlayerPosition,
    uWorldSize,
    uHeightScale,
    uSurfaceBias,
    uBladeMinScale,
    uBladeMaxScale,
    uBiomeGrassThreshold,
    uForestDensity,
    uHillsDensity,
    uShoreDensity,
    uDebugMaskViz,
  } = grassSharedUniforms;

  const biomeTex = texture(maps.biomeMap);
  const pathTex = texture(maps.pathMap);

  const material = new SpriteNodeMaterial();
  material.precision = 'lowp';
  material.transparent = false;
  material.stencilWrite = false;
  material.forceSinglePass = true;

  const useCompaction = options?.compactionEnabled && options?.ssboRemap;
  const ssboSlot = useCompaction ? uint(options.ssboRemap!.slotNode) : instanceIndex;
  const packed = ssbo.packedBuffer.element(ssboSlot);
  const scaleSpan = uBladeMaxScale.sub(uBladeMinScale);
  const offsetX = unpackOffsetX(packed.x);
  const offsetZ = unpackOffsetZ(packed.y);
  const scaleY = unpackCurrentScale(packed.w, uBladeMinScale, scaleSpan);
  const isVisible = unpackVisibility(packed.w);
  const positionNoise = hash(ssboSlot.add(196.4356));

  material.opacityNode = useCompaction ? float(1) : isVisible;

  const scaleX = positionNoise.remap(0, 1, 0.5, 1.5);
  const bladeScale = vec3(scaleX, scaleY, 1);
  material.scaleNode = useCompaction ? bladeScale : mix(vec3(0), bladeScale, isVisible);

  const h = uv().y;
  const bendProfile = h.mul(h).mul(uBaseBending);
  const instanceNoise = positionNoise.sub(0.5).mul(0.25);
  const baseBending = instanceNoise.mul(bendProfile);
  material.rotationNode = vec3(baseBending, 0, 0);

  const offscreenOffset = useCompaction
    ? vec3(0)
    : uCameraForward.mul(INFINITY).mul(float(1).sub(isVisible));
  const terrainY = unpackTerrainY(packed.z, uHeightScale, uSurfaceBias);
  const bladePosition = vec3(offsetX, terrainY, offsetZ);
  const worldX = offsetX.add(uPlayerPosition.x);
  const worldZ = offsetZ.add(uPlayerPosition.z);
  const windXZ = sampleGrassWindXZ(worldX, worldZ, options?.windAtlas ?? null);

  const randomPhase = positionNoise.mul(PI2);
  const swayAmount = sin(uTime.mul(5).add(randomPhase)).mul(0.15);
  const swayFactor = uv().y.mul(length(windXZ));
  const swayOffset = swayAmount.mul(swayFactor);

  const dirXZ = uWindDirection;
  const perp = vec2(dirXZ.y.negate(), dirXZ.x);
  const phase = hash(ssboSlot).mul(PI2);
  const flutter = sin(uTime.mul(uWindSpeed.mul(1.7)).add(phase.mul(1.3))).mul(0.06).mul(bendProfile);
  const flutterOffset = vec3(perp.x, 0, perp.y).mul(flutter);

  const windY = float(1).sub(h.mul(h)).mul(0.25);
  const windOffset = vec3(windXZ.x, windY, windXZ.y).mul(bendProfile);

  material.positionNode = bladePosition
    .add(offscreenOffset)
    .add(swayOffset)
    .add(flutterOffset)
    .add(windOffset);

  const aoEnabled = step(EPSILON, uAoScale);
  const r2 = offsetX.mul(offsetX).add(offsetZ.mul(offsetZ));
  const near = float(1).sub(smoothstep(0, uAoRadiusSquared, r2));
  const edge = uv().x.mul(2).sub(1).abs();
  const rim = smoothstep(uAoRimSmoothness.negate(), uAoRimSmoothness, edge);
  const hWeight = float(1).sub(smoothstep(0.1, 0.85, h));
  const aoStrength = uAoScale.mul(0.25);
  const aoShaded = float(1).sub(aoStrength.mul(near.mul(rim).mul(hWeight)));
  const ao = mix(float(1), aoShaded, aoEnabled);

  const colorProfile = h.mul(uColorMixFactor);
  const jitter = smoothstep(0, uColorVariationStrength, positionNoise);
  const baseColorJittered = uBaseColor.mul(jitter);
  const baseToTip = mix(baseColorJittered, uTipColor, colorProfile);

  const baseMask = float(1).sub(smoothstep(0, uBaseShadeHeight, h));
  const windAo = mix(float(1), float(1).sub(uBaseWindShade), baseMask.mul(smoothstep(0, 1, swayFactor)));

  const nightMul = mix(float(0.45), float(1), uSunIntensity.clamp());
  const glowBoost = float(1).add(uPlayerGlowMul.mul(0.35));
  const shaded = baseToTip.mul(windAo).mul(ao).mul(nightMul).mul(glowBoost);

  const debugEnabled = step(float(0.5), uDebugMaskViz);
  const debugUv = worldXZToMapUv(worldX, worldZ, uWorldSize);
  const debugBiome = biomeTex.sample(debugUv);
  const debugWeight = debugBiome.x
    .mul(uForestDensity)
    .add(debugBiome.y.mul(uHillsDensity))
    .add(debugBiome.z.mul(uShoreDensity));
  const debugOnBiome = step(uBiomeGrassThreshold, debugWeight);
  const debugOffPath = step(pathTex.sample(debugUv).r, float(0.5));
  const debugAllowed = debugOnBiome.mul(debugOffPath);
  const debugColor = mix(vec3(0.45, 0.08, 0.06), vec3(0.08, 0.5, 0.12), debugAllowed);

  const ringTint = options?.debugRingTint ? RING_DEBUG_COLORS[options.debugRingTint] : null;

  material.colorNode = select(
    debugEnabled.greaterThan(0),
    debugColor,
    ringTint !== null ? ringTint : shaded,
  );

  material.polygonOffset = true;
  material.polygonOffsetFactor = -1;
  material.polygonOffsetUnits = -1;

  return material;
}
