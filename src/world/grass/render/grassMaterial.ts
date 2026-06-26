// @ts-nocheck — TSL node parameter typings incomplete in r184
// src/world/grass/grassMaterial.ts — SpriteNodeMaterial grass blades (Revo-inspired)
import type { Texture } from 'three';
import {
  float,
  hash,
  instanceIndex,
  length,
  mix,
  normalize,
  normalWorld,
  PI2,
  positionWorld,
  sin,
  smoothstep,
  uv,
  vec2,
  vec3,
} from 'three/tsl';
import { SpriteNodeMaterial } from 'three/webgpu';
import { applySunShadowVisibility, type SunShadowNode } from '../../../rendering/sunShadow';
import { applyFoliageWrapHemisphere } from '../../../rendering/tsl/foliageWrapHemisphereTsl';
import type { GrassSsbo } from '../compute/grassSsbo';
import {
  unpackCurrentScale,
  unpackOffsetX,
  unpackOffsetZ,
  unpackTerrainY,
} from '../compute/grassSsboPack';
import { grassSharedUniforms } from '../config/grassUniforms';
import { applyGrassNightLighting } from '../tsl/grassNightLightingTsl';
import { sampleGrassWindXZ } from '../tsl/grassWindTsl';

export function createGrassMaterial(
  ssbo: GrassSsbo,
  options: {
    sunShadow: SunShadowNode;
    windAtlas?: Texture | null;
  },
): SpriteNodeMaterial {
  const {
    uBaseBending,
    uTime,
    uWindDirection,
    uWindSpeed,
    uColorMixFactor,
    uColorVariationStrength,
    uBaseColor,
    uTipColor,
    uBaseShadeHeight,
    uBaseWindShade,
    uDaylight,
    uNightSkyDaylight,
    uNightColorFloor,
    uShadowFloor,
    uSunIntensity,
    uLightRadius,
    uLightIntensity,
    uPlayerGlowMul,
    uPlayerPosition,
    uHeightScale,
    uSurfaceBias,
    uBladeMinScale,
    uBladeMaxScale,
  } = grassSharedUniforms;

  const material = new SpriteNodeMaterial();
  material.precision = 'lowp';
  material.transparent = false;
  material.stencilWrite = false;
  material.forceSinglePass = true;
  material.fog = false;
  material.receivedShadowPositionNode = positionWorld;
  material.normalNode = normalize(vec3(uv().x.sub(0.5).mul(0.8), float(0.85), float(0.15)));

  const sourceIndex = ssbo.visibleIndicesBuffer.element(instanceIndex);
  const packed = ssbo.packedBuffer.element(sourceIndex);
  const scaleSpan = uBladeMaxScale.sub(uBladeMinScale);
  const offsetX = unpackOffsetX(packed.x);
  const offsetZ = unpackOffsetZ(packed.y);
  const scaleY = unpackCurrentScale(packed.w, uBladeMinScale, scaleSpan);
  const positionNoise = hash(sourceIndex.add(196.4356));

  material.opacityNode = float(1);

  const scaleX = positionNoise.remap(0, 1, 0.5, 1.5);
  material.scaleNode = vec3(scaleX, scaleY, 1);

  const h = uv().y;
  const bendProfile = h.mul(h).mul(uBaseBending);
  const instanceNoise = positionNoise.sub(0.5).mul(0.25);
  const baseBending = instanceNoise.mul(bendProfile);
  material.rotationNode = vec3(baseBending, 0, 0);

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
  const phase = positionNoise.mul(PI2);
  const flutter = sin(uTime.mul(uWindSpeed.mul(1.7)).add(phase.mul(1.3)))
    .mul(0.06)
    .mul(bendProfile);
  const flutterOffset = vec3(perp.x, 0, perp.y).mul(flutter);

  const windY = float(1).sub(h.mul(h)).mul(0.25);
  const windOffset = vec3(windXZ.x, windY, windXZ.y).mul(bendProfile);

  material.positionNode = bladePosition.add(swayOffset).add(flutterOffset).add(windOffset);

  const colorProfile = h.mul(uColorMixFactor);
  const jitter = smoothstep(0, uColorVariationStrength, positionNoise);
  const baseColorJittered = uBaseColor.mul(jitter);
  const baseToTip = mix(baseColorJittered, uTipColor, colorProfile);

  const baseMask = float(1).sub(smoothstep(0, uBaseShadeHeight, h));
  const windAo = mix(
    float(1),
    float(1).sub(uBaseWindShade),
    baseMask.mul(smoothstep(0, 1, swayFactor)),
  );

  const albedo = baseToTip.mul(windAo);
  const shaped = applyFoliageWrapHemisphere(albedo, normalWorld, grassSharedUniforms, 1);
  const shaded = applySunShadowVisibility(shaped, options.sunShadow, uShadowFloor, uSunIntensity);
  material.colorNode = applyGrassNightLighting(shaded, {
    uDaylight,
    uNightSkyDaylight,
    uNightColorFloor,
    offsetX,
    offsetZ,
    uLightRadius,
    uLightIntensity,
    uPlayerGlowMul,
  });

  material.polygonOffset = true;
  material.polygonOffsetFactor = -1;
  material.polygonOffsetUnits = -1;

  return material;
}
