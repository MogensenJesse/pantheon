// @ts-nocheck — TSL node parameter typings incomplete in r184
// src/world/grass/flowers/flowerSsbo.ts — GPU compute for flower instance state (vec4)
import type { DataTexture, Texture } from 'three';
import {
  Fn,
  float,
  floor,
  hash,
  instancedArray,
  instanceIndex,
  smoothstep,
  step,
  texture,
  uniform,
  vec3,
} from 'three/tsl';
import type { ComputeNode } from 'three/webgpu';
import { worldXZToMapUv } from '../../../map/mapUvTsl';
import { GRASS_MOVE_EPS_SQ } from '../grassComputeSchedule';
import { grassFrustumVisibility } from '../grassFrustumVisibilityTsl';
import { grassSharedUniforms } from '../grassUniforms';
import { wrapVegetationOffsetConditional } from '../vegetationWrapTsl';
import { FLOWER_CONFIG } from './flowerConfig';
import { packFlowerStateZ, unpackFlowerHeight, unpackFlowerVisibility } from './flowerSsboPack';

export interface FlowerRingUniforms {
  uFlowersPerSide: ReturnType<typeof uniform>;
  uInnerRadius: ReturnType<typeof uniform>;
  uOuterRadius: ReturnType<typeof uniform>;
  uTileSize: ReturnType<typeof uniform>;
}

export function createFlowerRingUniforms(layout: {
  flowersPerSide: number;
  innerRadius: number;
  outerRadius: number;
  tileSize: number;
}): FlowerRingUniforms {
  return {
    uFlowersPerSide: uniform(layout.flowersPerSide),
    uInnerRadius: uniform(layout.innerRadius),
    uOuterRadius: uniform(layout.outerRadius),
    uTileSize: uniform(layout.tileSize),
  };
}

export function applyFlowerRingUniforms(
  ringUniforms: FlowerRingUniforms,
  layout: {
    flowersPerSide: number;
    innerRadius: number;
    outerRadius: number;
    tileSize: number;
  },
): void {
  ringUniforms.uFlowersPerSide.value = layout.flowersPerSide;
  ringUniforms.uInnerRadius.value = layout.innerRadius;
  ringUniforms.uOuterRadius.value = layout.outerRadius;
  ringUniforms.uTileSize.value = layout.tileSize;
}

export class FlowerSsbo {
  private readonly buffer;

  readonly computeInit: ComputeNode;
  readonly computeUpdate: ComputeNode;
  readonly computeVisibility: ComputeNode;
  readonly instanceCount: number;

  constructor(
    grassDataMap: DataTexture,
    ringUniforms: FlowerRingUniforms,
    instanceCount: number,
    windAtlas: Texture | null = null,
  ) {
    this.instanceCount = instanceCount;
    this.buffer = instancedArray(instanceCount, 'vec4');

    const {
      uWorldSize,
      uHeightScale,
      uPlayerDeltaXZ,
      uPlayerPosition,
      uFlowerGrassThreshold,
      uBiomeGrassFadeWidth,
      uFlowerBoundsRadius,
      uSurfaceBias,
      uFlowerSpacing,
    } = grassSharedUniforms;

    const { uInnerRadius, uOuterRadius, uTileSize, uFlowersPerSide } = ringUniforms;

    const halfTile = uTileSize.mul(0.5);
    const spacing = uFlowerSpacing;
    const grassDataTex = texture(grassDataMap);
    const windTex = windAtlas ? texture(windAtlas) : null;
    const moveEpsSq = float(GRASS_MOVE_EPS_SQ);
    const heightMax = uHeightScale.add(uSurfaceBias);

    const transitionStrength = (grassWeight) =>
      smoothstep(
        uFlowerGrassThreshold,
        uFlowerGrassThreshold.add(uBiomeGrassFadeWidth),
        grassWeight,
      );

    const sampleGrassData = (worldX, worldZ) => {
      const mapUv = worldXZToMapUv(worldX, worldZ, uWorldSize);
      const data = grassDataTex.sample(mapUv);
      const heightNorm = data.r;
      const grassWeight = data.g;
      const yOffset = heightNorm.mul(uHeightScale).add(uSurfaceBias);
      return { grassWeight, yOffset };
    };

    const buildVisibility = (offsetX, offsetZ, yOffset, grassWeight) => {
      const worldX = offsetX.add(uPlayerPosition.x);
      const worldZ = offsetZ.add(uPlayerPosition.z);
      const worldPos = vec3(worldX, yOffset, worldZ);

      const distSq = offsetX.mul(offsetX).add(offsetZ.mul(offsetZ));
      const innerSq = uInnerRadius.mul(uInnerRadius);
      const outerSq = uOuterRadius.mul(uOuterRadius);
      const inAnnulus = step(innerSq, distSq).mul(float(1).sub(step(outerSq, distSq)));

      const strength = transitionStrength(grassWeight);
      const thin = step(hash(instanceIndex), strength);
      const allowed = thin;

      const frustumVis = grassFrustumVisibility(worldPos, uFlowerBoundsRadius);

      return frustumVis.mul(inAnnulus).mul(allowed);
    };

    this.computeInit = Fn(() => {
      const data = this.buffer.element(instanceIndex);

      const row = floor(float(instanceIndex).div(uFlowersPerSide));
      const col = float(instanceIndex).mod(uFlowersPerSide);
      const randX = hash(instanceIndex.add(4321));
      const randZ = hash(instanceIndex.add(1234));
      let offsetX = col
        .mul(spacing)
        .sub(halfTile)
        .add(randX.mul(spacing.mul(0.5)));
      let offsetZ = row
        .mul(spacing)
        .sub(halfTile)
        .add(randZ.mul(spacing.mul(0.5)));

      if (windTex) {
        const tileUv = vec3(offsetX, 0, offsetZ).add(halfTile).div(uTileSize).abs().fract().xy;
        const atlas = windTex.sample(tileUv);
        const wrapNoise = atlas.r.sub(0.5);
        offsetX = offsetX.add(wrapNoise.mul(17).fract());
        offsetZ = offsetZ.add(wrapNoise.mul(13).fract());
      }

      data.x = offsetX;
      data.y = offsetZ;
      data.z = float(0);
      data.w = float(0);
    })().compute(instanceCount, [FLOWER_CONFIG.WORKGROUP_SIZE]);

    const applyVisibilityPass = (offsetX, offsetZ) => {
      const worldX = offsetX.add(uPlayerPosition.x);
      const worldZ = offsetZ.add(uPlayerPosition.z);
      const grassData = sampleGrassData(worldX, worldZ);
      const isVisible = buildVisibility(offsetX, offsetZ, grassData.yOffset, grassData.grassWeight);
      return { isVisible, yOffset: grassData.yOffset };
    };

    this.computeVisibility = Fn(() => {
      const data = this.buffer.element(instanceIndex);
      const offsetX = data.x;
      const offsetZ = data.y;
      const { isVisible, yOffset } = applyVisibilityPass(offsetX, offsetZ);
      data.z = packFlowerStateZ(yOffset, isVisible, heightMax);
    })().compute(instanceCount, [FLOWER_CONFIG.WORKGROUP_SIZE]);

    this.computeUpdate = Fn(() => {
      const data = this.buffer.element(instanceIndex);
      const offsetX = data.x;
      const offsetZ = data.y;

      const deltaSq = uPlayerDeltaXZ.x
        .mul(uPlayerDeltaXZ.x)
        .add(uPlayerDeltaXZ.y.mul(uPlayerDeltaXZ.y));
      const moved = step(moveEpsSq, deltaSq);

      const wrapped = wrapVegetationOffsetConditional(
        offsetX,
        offsetZ,
        uPlayerDeltaXZ.x,
        uPlayerDeltaXZ.y,
        uTileSize,
        moved,
      );

      const worldX = wrapped.x.add(uPlayerPosition.x);
      const worldZ = wrapped.z.add(uPlayerPosition.z);
      const grassData = sampleGrassData(worldX, worldZ);

      const isVisible = buildVisibility(
        wrapped.x,
        wrapped.z,
        grassData.yOffset,
        grassData.grassWeight,
      );

      data.x = wrapped.x;
      data.y = wrapped.z;
      data.z = packFlowerStateZ(grassData.yOffset, isVisible, heightMax);
    })().compute(instanceCount, [FLOWER_CONFIG.WORKGROUP_SIZE]);
  }

  get packedBuffer() {
    return this.buffer;
  }

  getMaterialNodes() {
    const heightMax = grassSharedUniforms.uHeightScale.add(grassSharedUniforms.uSurfaceBias);
    return {
      unpackHeight: (z) => unpackFlowerHeight(z, heightMax),
      unpackVisibility: (z) => unpackFlowerVisibility(z),
    };
  }
}
