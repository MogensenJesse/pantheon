// @ts-nocheck — TSL node parameter typings incomplete in r184
// src/world/grass/flowers/flowerMaterial.ts — Revo-style edelweiss SpriteNodeMaterial
import type { DataTexture, Texture } from 'three';
import {
  cos,
  float,
  hash,
  INFINITY,
  instanceIndex,
  mix,
  positionWorld,
  sin,
  step,
  texture,
  uv,
  vec3,
} from 'three/tsl';
import { SpriteNodeMaterial } from 'three/webgpu';
import { worldXZToMapUv } from '../../../map/mapUvTsl';
import { applyGrassNightLighting } from '../grassNightLightingTsl';
import { applyGrassSunShadow } from '../grassShadowTsl';
import { type GrassSunShadowNode, grassSharedUniforms } from '../grassUniforms';
import { FLOWER_CONFIG } from './flowerConfig';
import type { FlowerSsbo } from './flowerSsbo';

export function createFlowerMaterial(
  ssbo: FlowerSsbo,
  sprite: Texture,
  grassDataMap: DataTexture,
  sunShadow: GrassSunShadowNode,
): SpriteNodeMaterial {
  const {
    uCameraForward,
    uTime,
    uWindDirection,
    uWindStrength,
    uWindSpeed,
    uFlowerColor1,
    uFlowerColor2,
    uFlowerColorStrength,
    uFlowerMinScale,
    uFlowerMaxScale,
    uFlowerHeightOffset,
    uDaylight,
    uNightSkyDaylight,
    uNightColorFloor,
    uShadowFloor,
    uSunIntensity,
    uLightRadius,
    uLightIntensity,
    uPlayerGlowMul,
    uWorldSize,
    uHeightScale,
    uSurfaceBias,
    uPlayerPosition,
  } = grassSharedUniforms;

  const { unpackVisibility } = ssbo.getMaterialNodes();
  const grassDataTex = texture(grassDataMap);

  const material = new SpriteNodeMaterial();
  material.precision = 'lowp';
  material.transparent = false;
  material.stencilWrite = false;
  material.forceSinglePass = true;
  material.alphaTest = FLOWER_CONFIG.ALPHA_TEST;
  material.fog = true;
  material.receivedShadowPositionNode = positionWorld;

  const data = ssbo.packedBuffer.element(instanceIndex);
  const isVisible = unpackVisibility(data.z);

  const rand1 = hash(instanceIndex.add(9234));
  const rand2 = hash(instanceIndex.add(33.87));

  const timer = uTime.add(uWindSpeed.mul(2));
  const swayX = sin(timer.add(rand1.mul(100))).mul(0.25);
  const swayY = sin(timer.add(rand2.mul(50))).mul(0.06);
  const swayZ = cos(timer.mul(2).add(rand2.mul(33.76))).mul(0.15);
  const swayOffset = vec3(swayX, swayY, swayZ);

  const offscreenOffset = uCameraForward.mul(INFINITY).mul(float(1).sub(isVisible));
  const windPush = uWindDirection.mul(uWindStrength.mul(0.5));
  const offsetX = data.x.add(windPush.x);
  const offsetZ = data.y.add(windPush.y);

  // Live terrain sample — avoids Y lag while SSBO wrap compute is async.
  const worldX = offsetX.add(uPlayerPosition.x);
  const worldZ = offsetZ.add(uPlayerPosition.z);
  const mapUv = worldXZToMapUv(worldX, worldZ, uWorldSize);
  const terrainY = grassDataTex.sample(mapUv).r.mul(uHeightScale).add(uSurfaceBias);

  const scale = rand1.remap(0, 1, uFlowerMinScale, uFlowerMaxScale);
  const baseHeight = rand1.add(rand2).mul(0.08).add(0.02);
  const offsetY = terrainY.add(baseHeight).sub(scale.mul(0.65)).add(uFlowerHeightOffset);
  const basePosition = vec3(offsetX, offsetY, offsetZ);

  material.positionNode = basePosition.add(swayOffset).add(offscreenOffset);
  material.scaleNode = vec3(scale, scale, 1);

  const spriteTex = texture(sprite);
  const flower = spriteTex.sample(uv());
  const tint = mix(uFlowerColor1, uFlowerColor2, rand2);
  const sign = step(rand2, rand1).mul(2).sub(1);
  const color = mix(tint, flower.rgb, rand1.add(rand2.mul(sign)));

  const albedo = color.mul(uFlowerColorStrength);
  const shaded = applyGrassSunShadow(albedo, sunShadow, uShadowFloor, uSunIntensity);
  material.colorNode = applyGrassNightLighting(shaded, {
    uDaylight,
    uNightSkyDaylight,
    uNightColorFloor,
    offsetX: data.x,
    offsetZ: data.y,
    uLightRadius,
    uLightIntensity,
    uPlayerGlowMul,
  });

  material.opacityNode = isVisible.mul(flower.a);

  return material;
}
