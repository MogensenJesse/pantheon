// @ts-nocheck — TSL node parameter typings incomplete in r184
// src/world/grass/render/flowerMaterial.ts — Revo-style edelweiss SpriteNodeMaterial
import type { Texture } from 'three';
import { DoubleSide } from 'three';
import {
  cos,
  float,
  hash,
  instanceIndex,
  mix,
  normalWorld,
  positionWorld,
  sin,
  smoothstep,
  step,
  texture,
  transformNormal,
  uv,
  vec2,
  vec3,
} from 'three/tsl';
import { SpriteNodeMaterial } from 'three/webgpu';
import { VISUAL } from '../../../config/visualTuning';
import { computeEffectiveSunShadowFloor, type SunShadowNode } from '../../../rendering/sunShadow';
import {
  applyFoliageBacklight,
  applyFoliageWrapHemisphere,
  computeBacklightShadowLift,
  computeBacklightShadowMul,
  computeFoliageFacing,
} from '../../../rendering/tsl/foliageWrapHemisphereTsl';
import type { FlowerSsbo } from '../compute/flowerSsbo';
import { unpackFlowerHeight } from '../compute/flowerSsboPack';
import { grassSharedUniforms } from '../config/grassUniforms';
import { applyGrassCullDebugColor } from '../tsl/grassCullDebugTsl';
import { applyGrassTerrainDepthBias } from '../tsl/grassDepthBiasTsl';
import { applyGrassNightLighting } from '../tsl/grassNightLightingTsl';

export function createFlowerMaterial(
  ssbo: FlowerSsbo,
  sprite: Texture,
  options: {
    sunShadow: SunShadowNode;
    sampleTerrainSurfacePosition?: unknown | null;
  },
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
    uSunDirection,
    uBacklightPunchThrough,
    uLightRadius,
    uLightIntensity,
    uPlayerGlowMul,
    uHeightScale,
    uSurfaceBias,
    uPlayerPosition,
    uGrassCullDebug,
  } = grassSharedUniforms;

  const heightMax = uHeightScale.add(uSurfaceBias);

  const material = new SpriteNodeMaterial();
  material.precision = 'mediump';
  material.side = DoubleSide;
  material.transparent = false;
  material.stencilWrite = false;
  material.forceSinglePass = true;
  material.alphaTest = flowerTuning.alphaTest;
  material.receivedShadowPositionNode = positionWorld;
  const petalNormalWorld = transformNormal(vec3(0, 0, 1));

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
  let offsetX = data.x.add(windPush.x);
  let offsetZ = data.y.add(windPush.y);
  const worldX = data.x.add(uPlayerPosition.x);
  const worldZ = data.y.add(uPlayerPosition.z);
  const sampleTerrainSurfacePosition = options?.sampleTerrainSurfacePosition ?? null;
  if (sampleTerrainSurfacePosition) {
    const surfacePos = sampleTerrainSurfacePosition(vec2(worldX, worldZ));
    offsetX = surfacePos.x.sub(uPlayerPosition.x).add(windPush.x);
    offsetZ = surfacePos.z.sub(uPlayerPosition.z).add(windPush.y);
  }

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
  const thickness = smoothstep(0.2, 0.8, uv().y);
  const shaped = applyFoliageWrapHemisphere(
    albedo,
    normalWorld,
    uSunDirection,
    grassSharedUniforms.uWrapStrength,
    grassSharedUniforms.uHemisphereStrength,
    grassSharedUniforms.uSkyTint,
    grassSharedUniforms.uGroundTint,
    float(1),
  );
  const facing = computeFoliageFacing(
    petalNormalWorld,
    thickness,
    uSunDirection,
    float(1),
    float(0.55),
  );
  const backlight = applyFoliageBacklight(
    albedo,
    facing,
    grassSharedUniforms.uSunColor,
    uSunIntensity,
    grassSharedUniforms.uBacklightStrength,
    grassSharedUniforms.uBacklightTint,
  );
  const shadowMul = computeEffectiveSunShadowFloor(options.sunShadow, uShadowFloor, uSunIntensity);
  const shadowLift = computeBacklightShadowLift(facing, shadowMul, uBacklightPunchThrough);
  const backlightShadow = computeBacklightShadowMul(shadowMul, uBacklightPunchThrough);
  const shaded = shaped.mul(shadowLift).add(backlight.mul(backlightShadow));
  const lit = applyGrassNightLighting(shaded, {
    uDaylight,
    uNightSkyDaylight,
    uNightColorFloor,
    offsetX,
    offsetZ,
    uLightRadius,
    uLightIntensity,
    uPlayerGlowMul,
  });
  material.colorNode = applyGrassCullDebugColor(lit, data.w, uGrassCullDebug);
  material.opacityNode = flower.a;

  applyGrassTerrainDepthBias(material);

  return material;
}
