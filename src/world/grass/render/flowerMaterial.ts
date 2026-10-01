// src/world/grass/render/flowerMaterial.ts — stateless camera-facing edelweiss SpriteNodeMaterial
import type { DataTexture, Texture } from 'three';
import { DoubleSide } from 'three';
import {
  cos,
  EPSILON,
  float,
  floor,
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
import { vegetationFollowSlot } from '../compute/shared/vegetationOffsetTsl';
import {
  createPropGrassInfluence,
  createSampleGrassData,
  createTransitionStrength,
  hashLatticeCell,
  vegetationClumpFromBaked,
} from '../compute/shared/vegetationVisibilityTsl';
import type { FlowerRingUniforms } from '../config/flowerUniforms';
import { grassSharedUniforms } from '../config/grassUniforms';
import { grassViewRayPull } from '../tsl/grassDepthBiasTsl';
import { applyGrassVegetationShading } from '../tsl/grassVegetationShadingTsl';
import type { TslNode } from '../tsl/tslNode';

/** Salt so the flower keep hash does not share its lattice pattern with grass. */
const FLOWER_KEEP_SALT = 11;

/**
 * Flowers are a small fixed field, so placement and culling run per instance in the vertex
 * stage (no compute, no indirect draw). Rejected flowers get zero scale and draw nothing.
 */
export function createFlowerMaterial(
  sprite: Texture,
  options: {
    sunShadow: ReceiverSunShadowNode;
    windAtlas: Texture;
    ringUniforms: FlowerRingUniforms;
    grassDataMap: DataTexture;
    propExclusionMap: DataTexture;
    sampleTerrainSurfaceY: (worldXZ: TslNode) => TslNode;
  },
): SpriteNodeMaterial {
  const flowerTuning = VISUAL.grass.flowers;
  const {
    uTime,
    uWindDirection,
    uWindStrength,
    uWindSpeed,
    uPlayerPosition,
    uWorldSize,
    uHeightScale,
    uSurfaceBias,
    uFy,
    uBiomeGrassThreshold,
    uBiomeGrassFadeWidth,
    uGrassTransitionMinScale,
    uClumpEdgeMinScale,
    uProjectedHeightMin,
    uProjectedHeightFull,
    uPropGrassCullThreshold,
    uFlowerGrassThreshold,
    uFlowerColor1,
    uFlowerColor2,
    uFlowerColorStrength,
    uFlowerMinScale,
    uFlowerMaxScale,
    uFlowerHeightOffset,
    uDepthPullM,
  } = grassSharedUniforms;

  const material = new SpriteNodeMaterial();
  material.precision = 'highp';
  material.side = DoubleSide;
  material.transparent = false;
  material.stencilWrite = false;
  material.forceSinglePass = true;
  material.alphaTest = flowerTuning.alphaTest;
  material.receivedShadowPositionNode = positionWorld;
  const petalNormalWorld = transformNormal(vec3(0, 0, 1));

  const { uTileSize, uFlowersPerSide, uOuterRadius } = options.ringUniforms;
  const spacing = uTileSize.div(uFlowersPerSide);
  const placed = vegetationFollowSlot({
    slotIndex: instanceIndex,
    perSide: uFlowersPerSide,
    spacing,
    tileSize: uTileSize,
    windTex: texture(options.windAtlas),
    playerX: uPlayerPosition.x,
    playerZ: uPlayerPosition.z,
  });
  const worldX = placed.offsetX.add(uPlayerPosition.x);
  const worldZ = placed.offsetZ.add(uPlayerPosition.z);

  const grassData = createSampleGrassData(
    texture(options.grassDataMap),
    uWorldSize,
    uHeightScale,
    uSurfaceBias,
    options.sampleTerrainSurfaceY,
  )(worldX, worldZ);
  const clump = vegetationClumpFromBaked(grassData.clump);
  const flowerBiome = createTransitionStrength(
    uFlowerGrassThreshold,
    uBiomeGrassFadeWidth,
  )(grassData.grassWeight);

  const range = placed.offsetX.mul(placed.offsetX).add(placed.offsetZ.mul(placed.offsetZ)).sqrt();
  const inRange = step(range, uOuterRadius);
  const screenKeep = smoothstep(
    uProjectedHeightMin,
    uProjectedHeightFull,
    uFy.mul(uFlowerMaxScale).div(range.max(EPSILON)),
  );
  const keepProbability = flowerBiome.mul(screenKeep).mul(clump.keepMask);
  const keepThreshold = hashLatticeCell(
    floor(worldX.div(spacing)),
    floor(worldZ.div(spacing)),
    float(FLOWER_KEEP_SALT),
  );
  const propOk = step(
    uPropGrassCullThreshold,
    createPropGrassInfluence(texture(options.propExclusionMap), uWorldSize)(worldX, worldZ),
  );
  const biomeOk = step(float(0.05), flowerBiome);
  const visible = inRange.mul(biomeOk).mul(propOk).mul(step(keepThreshold, keepProbability));

  // Heads ride the local grass-top height: lift scales with the same transition and clump
  // shrink the blades get, so flowers do not hover over bare or thin ground.
  const grassBiome = createTransitionStrength(
    uBiomeGrassThreshold,
    uBiomeGrassFadeWidth,
  )(grassData.grassWeight);
  const grassTopMul = mix(uGrassTransitionMinScale, float(1), grassBiome).mul(
    mix(uClumpEdgeMinScale, float(1), clump.heightMask),
  );

  const rand1 = hash(instanceIndex.add(9234));
  const rand2 = hash(instanceIndex.add(33.87));

  const timer = uTime.add(uWindSpeed.mul(2));
  const swayX = sin(timer.add(rand1.mul(100))).mul(0.25);
  const swayY = sin(timer.add(rand2.mul(50))).mul(0.06);
  const swayZ = cos(timer.mul(2).add(rand2.mul(33.76))).mul(0.15);
  const swayOffset = vec3(swayX, swayY, swayZ);

  const windPush = uWindDirection.mul(uWindStrength.mul(0.5));
  const offsetX = placed.offsetX.add(windPush.x);
  const offsetZ = placed.offsetZ.add(windPush.y);

  const scale = rand1.remap(0, 1, uFlowerMinScale, uFlowerMaxScale).mul(visible);
  const baseHeight = rand1.add(rand2).mul(0.08).add(0.02);
  const offsetY = grassData.yOffset.add(baseHeight).add(uFlowerHeightOffset.mul(grassTopMul));
  const basePosition = vec3(offsetX, offsetY, offsetZ);
  const depthPull = grassViewRayPull(vec3(worldX, offsetY, worldZ), uDepthPullM);

  material.positionNode = basePosition.add(swayOffset).add(depthPull);
  material.scaleNode = vec3(scale, scale, 1);

  const spriteTex = texture(sprite);
  const flower = spriteTex.sample(uv());
  const tint = mix(uFlowerColor1, uFlowerColor2, rand2);
  const sign = step(rand2, rand1).mul(2).sub(1);
  const color = mix(tint, flower.rgb, rand1.add(rand2.mul(sign)));
  const albedo = color.mul(uFlowerColorStrength);
  const thickness = smoothstep(0.2, 0.8, uv().y);
  material.colorNode = applyGrassVegetationShading({
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
  material.opacityNode = flower.a;

  return material;
}
