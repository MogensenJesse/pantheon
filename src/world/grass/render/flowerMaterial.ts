// @ts-nocheck — TSL node parameter typings incomplete in r184
// src/world/grass/render/flowerMaterial.ts — Revo-style edelweiss SpriteNodeMaterial
import type { Texture } from 'three';
import { DoubleSide } from 'three';
import {
  cos,
  hash,
  instanceIndex,
  mix,
  normalWorld,
  positionWorld,
  sin,
  step,
  texture,
  uv,
  vec3,
} from 'three/tsl';
import { SpriteNodeMaterial } from 'three/webgpu';
import { VISUAL } from '../../../config/visualTuning';
import { applySunShadowVisibility, type SunShadowNode } from '../../../rendering/sunShadow';
import { applyFoliageWrapHemisphere } from '../../../rendering/tsl/foliageWrapHemisphereTsl';
import type { FlowerSsbo } from '../compute/flowerSsbo';
import { unpackFlowerHeight } from '../compute/flowerSsboPack';
import { grassSharedUniforms } from '../config/grassUniforms';
import { applyGrassNightLighting } from '../tsl/grassNightLightingTsl';

export function createFlowerMaterial(
  ssbo: FlowerSsbo,
  sprite: Texture,
  options: { sunShadow: SunShadowNode },
): SpriteNodeMaterial {
  const flowerTuning = VISUAL.grass.flowers;
  const {
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
    uHeightScale,
    uSurfaceBias,
  } = grassSharedUniforms;

  const heightMax = uHeightScale.add(uSurfaceBias);

  const material = new SpriteNodeMaterial();
  material.precision = 'lowp';
  material.side = DoubleSide;
  material.transparent = false;
  material.stencilWrite = false;
  material.forceSinglePass = true;
  material.alphaTest = flowerTuning.alphaTest;
  material.fog = false;
  material.receivedShadowPositionNode = positionWorld;

  const sourceIndex = ssbo.visibleIndicesBuffer.element(instanceIndex);
  const data = ssbo.packedBuffer.element(sourceIndex);

  const rand1 = hash(sourceIndex.add(9234));
  const rand2 = hash(sourceIndex.add(33.87));

  const timer = uTime.add(uWindSpeed.mul(2));
  const swayX = sin(timer.add(rand1.mul(100))).mul(0.25);
  const swayY = sin(timer.add(rand2.mul(50))).mul(0.06);
  const swayZ = cos(timer.mul(2).add(rand2.mul(33.76))).mul(0.15);
  const swayOffset = vec3(swayX, swayY, swayZ);

  const windPush = uWindDirection.mul(uWindStrength.mul(0.5));
  const offsetX = data.x.add(windPush.x);
  const offsetZ = data.y.add(windPush.y);

  const terrainY = unpackFlowerHeight(data.z, heightMax);

  const scale = rand1.remap(0, 1, uFlowerMinScale, uFlowerMaxScale);
  const baseHeight = rand1.add(rand2).mul(0.08).add(0.02);
  const offsetY = terrainY.add(baseHeight).sub(scale.mul(0.65)).add(uFlowerHeightOffset);
  const basePosition = vec3(offsetX, offsetY, offsetZ);

  material.positionNode = basePosition.add(swayOffset);
  material.scaleNode = vec3(scale, scale, 1);

  const spriteTex = texture(sprite);
  const flower = spriteTex.sample(uv());
  const tint = mix(uFlowerColor1, uFlowerColor2, rand2);
  const sign = step(rand2, rand1).mul(2).sub(1);
  const color = mix(tint, flower.rgb, rand1.add(rand2.mul(sign)));
  const albedo = color.mul(uFlowerColorStrength);
  const shaped = applyFoliageWrapHemisphere(albedo, normalWorld, grassSharedUniforms, 1);
  const shaded = applySunShadowVisibility(shaped, options.sunShadow, uShadowFloor, uSunIntensity);
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
  material.opacityNode = flower.a;

  return material;
}
