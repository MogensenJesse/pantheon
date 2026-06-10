// @ts-nocheck — TSL node parameter typings incomplete in r184
// src/world/grass/flowers/flowerSsbo.ts — GPU compute for flower instance state (vec4)
import type { DataTexture, Texture } from 'three';
import {
  atomicAdd,
  atomicStore,
  Fn,
  float,
  floor,
  hash,
  If,
  instancedArray,
  instanceIndex,
  max,
  smoothstep,
  step,
  storage,
  struct,
  texture,
  uniform,
  uint,
  vec3,
} from 'three/tsl';
import { IndirectStorageBufferAttribute, type ComputeNode } from 'three/webgpu';
import { worldXZToMapUv } from '../../../map/mapUvTsl';
import { GRASS_MOVE_EPS_SQ } from '../grassComputeSchedule';
import { grassFrustumVisibility } from '../grassFrustumVisibilityTsl';
import { grassSharedUniforms } from '../grassUniforms';
import { wrapVegetationOffsetConditional } from '../vegetationWrapTsl';
import { FLOWER_CONFIG } from './flowerConfig';
import { packFlowerStateZ, unpackFlowerHeight, unpackFlowerVisibility } from './flowerSsboPack';

/** Re-export for flower dev stats readback (same layout as grass indirect buffer). */
export { GRASS_INDIRECT_INSTANCE_COUNT_OFFSET as FLOWER_INDIRECT_INSTANCE_COUNT_OFFSET } from '../grassSsbo';

const NEAR_CAMERA_ALWAYS_VISIBLE = 3;

const drawIndirectStruct = struct(
  {
    vertexCount: 'uint',
    instanceCount: { type: 'uint', atomic: true },
    firstVertex: 'uint',
    firstInstance: 'uint',
    offset: 'uint',
  },
  'FlowerDrawIndirect',
);

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
  private readonly visibleIndices;
  private readonly drawIndirectAttr;
  private readonly drawStorage;

  readonly computeInit: ComputeNode;
  readonly computeInitIndirect: ComputeNode;
  readonly computeCompactReset: ComputeNode;
  readonly computeUpdateCompact: ComputeNode;
  readonly computeVisibilityCompact: ComputeNode;
  readonly instanceCount: number;

  constructor(
    grassDataMap: DataTexture,
    ringUniforms: FlowerRingUniforms,
    instanceCount: number,
    indexCount: number,
    windAtlas: Texture | null = null,
  ) {
    this.instanceCount = instanceCount;
    this.buffer = instancedArray(instanceCount, 'vec4');
    this.visibleIndices = instancedArray(instanceCount, 'uint');
    this.drawIndirectAttr = new IndirectStorageBufferAttribute(new Uint32Array(5), 5);
    this.drawStorage = storage(this.drawIndirectAttr, drawIndirectStruct, 1);

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
    const nearCameraDist = float(NEAR_CAMERA_ALWAYS_VISIBLE);

    const transitionStrength = (grassWeight) =>
      smoothstep(
        uFlowerGrassThreshold,
        uFlowerGrassThreshold.add(uBiomeGrassFadeWidth),
        grassWeight,
      );

    const inAnnulusMask = (offsetX, offsetZ) => {
      const distSq = offsetX.mul(offsetX).add(offsetZ.mul(offsetZ));
      const innerSq = uInnerRadius.mul(uInnerRadius);
      const outerSq = uOuterRadius.mul(uOuterRadius);
      return step(innerSq, distSq).mul(float(1).sub(step(outerSq, distSq)));
    };

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

      const inAnnulus = inAnnulusMask(offsetX, offsetZ);

      const strength = transitionStrength(grassWeight);
      const thin = step(hash(instanceIndex), strength);
      const allowed = thin;

      const frustumVis = grassFrustumVisibility(worldPos, uFlowerBoundsRadius);

      const manhattan = offsetX.abs().add(offsetZ.abs());
      const isCloseEnough = float(1).sub(step(nearCameraDist, manhattan));
      const biomeVis = inAnnulus.mul(allowed);
      const normalVis = frustumVis.mul(biomeVis);
      const nearVis = isCloseEnough.mul(biomeVis);

      return max(nearVis, normalVis);
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

    this.computeInitIndirect = Fn(() => {
      this.drawStorage.get('vertexCount').assign(uint(indexCount));
      atomicStore(this.drawStorage.get('instanceCount'), uint(0));
      this.drawStorage.get('firstVertex').assign(uint(0));
      this.drawStorage.get('firstInstance').assign(uint(0));
      this.drawStorage.get('offset').assign(uint(0));
    })().compute(1);

    this.computeCompactReset = Fn(() => {
      atomicStore(this.drawStorage.get('instanceCount'), uint(0));
    })().compute(1);

    const appendCompact = (isVisible) => {
      If(isVisible.greaterThan(float(0)), () => {
        const dst = atomicAdd(this.drawStorage.get('instanceCount'), uint(1));
        this.visibleIndices.element(dst).assign(instanceIndex);
      });
    };

    const applyVisibilityPass = (offsetX, offsetZ) => {
      const worldX = offsetX.add(uPlayerPosition.x);
      const worldZ = offsetZ.add(uPlayerPosition.z);
      const grassData = sampleGrassData(worldX, worldZ);
      const isVisible = buildVisibility(offsetX, offsetZ, grassData.yOffset, grassData.grassWeight);
      return { isVisible, yOffset: grassData.yOffset };
    };

    this.computeVisibilityCompact = Fn(() => {
      const data = this.buffer.element(instanceIndex);
      const offsetX = data.x;
      const offsetZ = data.y;
      const { isVisible, yOffset } = applyVisibilityPass(offsetX, offsetZ);
      data.z = packFlowerStateZ(yOffset, isVisible, heightMax);
      appendCompact(isVisible);
    })().compute(instanceCount, [FLOWER_CONFIG.WORKGROUP_SIZE]);

    this.computeUpdateCompact = Fn(() => {
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

      const inAnnulus = inAnnulusMask(wrapped.x, wrapped.z);

      If(inAnnulus.greaterThan(float(0)), () => {
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
        appendCompact(isVisible);
      }).Else(() => {
        data.x = wrapped.x;
        data.y = wrapped.z;
        data.z = packFlowerStateZ(float(0), float(0), heightMax);
        appendCompact(float(0));
      });
    })().compute(instanceCount, [FLOWER_CONFIG.WORKGROUP_SIZE]);
  }

  get packedBuffer() {
    return this.buffer;
  }

  get visibleIndicesBuffer() {
    return this.visibleIndices;
  }

  get indirectBuffer() {
    return this.drawIndirectAttr;
  }

  getMaterialNodes() {
    const heightMax = grassSharedUniforms.uHeightScale.add(grassSharedUniforms.uSurfaceBias);
    return {
      unpackHeight: (z) => unpackFlowerHeight(z, heightMax),
      unpackVisibility: (z) => unpackFlowerVisibility(z),
    };
  }
}
