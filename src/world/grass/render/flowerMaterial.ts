// src/world/grass/render/flowerMaterial.ts — camera-facing edelweiss SpriteNodeMaterial
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
  vec3,
} from 'three/tsl';
import { SpriteNodeMaterial } from 'three/webgpu';
import { VISUAL } from '../../../config/visualTuning';
import type { ReceiverSunShadowNode } from '../../../rendering/sunShadow';
import type { FlowerSsbo } from '../compute/flowerSsbo';
import { unpackFlowerDebugReason, unpackFlowerTerrainY } from '../compute/flowerSsboPack';
import { vegetationFollowSlot } from '../compute/shared/vegetationOffsetTsl';
import type { FlowerRingUniforms } from '../config/flowerUniforms';
import { grassSharedUniforms } from '../config/grassUniforms';
import { applyGrassCullDebugColor } from '../tsl/grassCullDebugTsl';
import { applyGrassTerrainDepthBias } from '../tsl/grassDepthBiasTsl';
import { applyGrassVegetationShading } from '../tsl/grassVegetationShadingTsl';

export function createFlowerMaterial(
  ssbo: FlowerSsbo,
  sprite: Texture,
  options: {
    sunShadow: ReceiverSunShadowNode;
    windAtlas: Texture;
    ringUniforms: FlowerRingUniforms;
  },
): SpriteNodeMaterial {
  const flowerTuning = VISUAL.grass.flowers;
  const {
    uTime,
    uWindDirection,
    uWindStrength,
    uWindSpeed,
    uPlayerPosition,
    uHeightScale,
    uSurfaceBias,
    uFlowerColor1,
    uFlowerColor2,
    uFlowerColorStrength,
    uFlowerMinScale,
    uFlowerMaxScale,
    uFlowerHeightOffset,
    uGrassCullDebug,
  } = grassSharedUniforms as any;

  const material = new SpriteNodeMaterial();
  material.precision = 'highp';
  material.side = DoubleSide;
  material.transparent = false;
  material.stencilWrite = false;
  material.forceSinglePass = true;
  material.alphaTest = flowerTuning.alphaTest;
  material.receivedShadowPositionNode = positionWorld;
  const petalNormalWorld = transformNormal(vec3(0, 0, 1));

  const sourceIndex = ssbo.visibleIndicesBuffer.element(instanceIndex) as any;
  const word = ssbo.packedBuffer.element(sourceIndex) as any;
  const { uTileSize, uFlowersPerSide } = options.ringUniforms as any;
  const placed = vegetationFollowSlot({
    slotIndex: sourceIndex,
    perSide: uFlowersPerSide,
    spacing: uTileSize.div(uFlowersPerSide),
    tileSize: uTileSize,
    windTex: texture(options.windAtlas),
    wrapNoiseChannel: (atlas) => atlas.r,
    playerX: uPlayerPosition.x,
    playerZ: uPlayerPosition.z,
  });

  const rand1 = hash(sourceIndex.add(9234));
  const rand2 = hash(sourceIndex.add(33.87));

  const timer = uTime.add(uWindSpeed.mul(2));
  const swayX = sin(timer.add(rand1.mul(100))).mul(0.25);
  const swayY = sin(timer.add(rand2.mul(50))).mul(0.06);
  const swayZ = cos(timer.mul(2).add(rand2.mul(33.76))).mul(0.15);
  const swayOffset = vec3(swayX, swayY, swayZ);

  const windPush = uWindDirection.mul(uWindStrength.mul(0.5));
  const offsetX = placed.offsetX.add(windPush.x);
  const offsetZ = placed.offsetZ.add(windPush.y);

  const scale = rand1.remap(0, 1, uFlowerMinScale, uFlowerMaxScale);
  const baseHeight = rand1.add(rand2).mul(0.08).add(0.02);
  const offsetY = unpackFlowerTerrainY(word, uHeightScale, uSurfaceBias)
    .add(baseHeight)
    .add(uFlowerHeightOffset);
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
  const lit = applyGrassVegetationShading({
    albedo,
    wrapNormal: normalWorld,
    bladeNormalWorld: petalNormalWorld,
    thickness,
    sunShadow: options.sunShadow,
    backlightMode: 'full',
    backlightFacingMul: float(0.55),
    nightMode: 'player-glow',
    offsetX,
    offsetZ,
  });
  if (import.meta.env.DEV) {
    material.colorNode = applyGrassCullDebugColor(
      lit,
      unpackFlowerDebugReason(word),
      uGrassCullDebug,
    );
  } else {
    material.colorNode = lit;
  }
  material.opacityNode = flower.a;

  applyGrassTerrainDepthBias(material);

  return material;
}
