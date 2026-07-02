// @ts-nocheck — TSL node parameter typings incomplete in r184
// src/world/grass/compute/flowerSsbo.ts — GPU compute for flower instance state (vec4)
import type { DataTexture, Texture } from 'three';
import {
  Fn,
  float,
  floor,
  hash,
  If,
  instancedArray,
  instanceIndex,
  storage,
  texture,
  uniform,
  uint,
  vec3,
} from 'three/tsl';
import { type ComputeNode, IndirectStorageBufferAttribute } from 'three/webgpu';
import { FLOWER_CONFIG } from '../config/flowerConfig';
import { GRASS_MOVE_EPS_SQ } from '../config/grassConfig';
import { grassSharedUniforms } from '../config/grassUniforms';
import { packFlowerStateZ } from './flowerSsboPack';
import {
  createAppendCompact,
  createComputeCompactReset,
  createComputeInitIndirect,
  vegetationDrawIndirectStruct,
} from './shared/vegetationIndirectTsl';
import {
  createBuildVisibility,
  createInAnnulusMask,
  createSampleGrassData,
  createTransitionStrength,
} from './shared/vegetationVisibilityTsl';
import { vegetationMovedMask, wrapVegetationOffsetConditional } from './shared/vegetationWrapTsl';

/** Re-export for flower dev stats readback (same layout as grass indirect buffer). */
export { VEGETATION_INDIRECT_INSTANCE_COUNT_OFFSET as FLOWER_INDIRECT_INSTANCE_COUNT_OFFSET } from './shared/vegetationIndirectTsl';

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
  readonly instanceCount: number;

  constructor(
    grassDataMap: DataTexture,
    ringUniforms: FlowerRingUniforms,
    instanceCount: number,
    indexCount: number,
    windAtlas: Texture | null = null,
    sampleTerrainSurfaceY: unknown = null,
    sampleTerrainSurfacePosition: unknown = null,
  ) {
    this.instanceCount = instanceCount;
    this.buffer = instancedArray(instanceCount, 'vec4');
    this.visibleIndices = instancedArray(instanceCount, 'uint');
    this.drawIndirectAttr = new IndirectStorageBufferAttribute(new Uint32Array(5), 5);
    this.drawStorage = storage(this.drawIndirectAttr, vegetationDrawIndirectStruct, 1);

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
      uGrassCullDebug,
    } = grassSharedUniforms;

    const { uInnerRadius, uOuterRadius, uTileSize, uFlowersPerSide } = ringUniforms;

    const halfTile = uTileSize.mul(0.5);
    const spacing = uFlowerSpacing;
    const grassDataTex = texture(grassDataMap);
    const windTex = windAtlas ? texture(windAtlas) : null;
    const moveEpsSq = float(GRASS_MOVE_EPS_SQ);
    const heightMax = uHeightScale.add(uSurfaceBias);

    const inAnnulusMask = createInAnnulusMask(uInnerRadius, uOuterRadius);
    const transitionStrength = createTransitionStrength(
      uFlowerGrassThreshold,
      uBiomeGrassFadeWidth,
    );
    const sampleGrassData = createSampleGrassData(
      grassDataTex,
      uWorldSize,
      uHeightScale,
      uSurfaceBias,
      sampleTerrainSurfaceY,
      sampleTerrainSurfacePosition,
    );
    const buildVisibility = createBuildVisibility({
      inAnnulusMask,
      transitionStrength,
      uPlayerPosition,
      frustumBoundsRadius: uFlowerBoundsRadius,
    });
    const appendCompact = createAppendCompact(this.drawStorage, this.visibleIndices);
    const slotCount = uint(instanceCount);

    this.computeInit = Fn(() => {
      If(instanceIndex.lessThan(slotCount), () => {
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
      });
    })().compute(instanceCount, [FLOWER_CONFIG.WORKGROUP_SIZE]);

    this.computeInitIndirect = createComputeInitIndirect(this.drawStorage, indexCount);
    this.computeCompactReset = createComputeCompactReset(this.drawStorage);

    this.computeUpdateCompact = Fn(() => {
      If(instanceIndex.lessThan(slotCount), () => {
        const data = this.buffer.element(instanceIndex);
        const offsetX = data.x;
        const offsetZ = data.y;
        const moved = vegetationMovedMask(uPlayerDeltaXZ, moveEpsSq);
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

          const visibility = buildVisibility(
            wrapped.x,
            wrapped.z,
            grassData.yOffset,
            grassData.grassWeight,
          );
          const isVisible = visibility.visible;
          const debugOn = uGrassCullDebug.greaterThan(float(0.5));
          const visByte = debugOn.select(visibility.reason, isVisible);
          const drawInstance = debugOn.select(float(1), isVisible);

          data.x = wrapped.x;
          data.y = wrapped.z;
          data.z = packFlowerStateZ(grassData.yOffset, isVisible, heightMax);
          data.w = debugOn.select(visByte, float(0));
          appendCompact(drawInstance);
        }).Else(() => {
          const worldX = wrapped.x.add(uPlayerPosition.x);
          const worldZ = wrapped.z.add(uPlayerPosition.z);
          const grassData = sampleGrassData(worldX, worldZ);
          const visibility = buildVisibility(
            wrapped.x,
            wrapped.z,
            grassData.yOffset,
            grassData.grassWeight,
          );
          const debugOn = uGrassCullDebug.greaterThan(float(0.5));
          const drawInstance = debugOn.select(float(1), float(0));
          data.x = wrapped.x;
          data.y = wrapped.z;
          data.z = packFlowerStateZ(grassData.yOffset, float(0), heightMax);
          data.w = debugOn.select(visibility.reason, float(0));
          appendCompact(drawInstance);
        });
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

  dispose(): void {
    this.buffer.dispose();
    this.visibleIndices.dispose();
    this.drawIndirectAttr.dispose();
    this.computeInit.dispose();
    this.computeInitIndirect.dispose();
    this.computeCompactReset.dispose();
    this.computeUpdateCompact.dispose();
  }
}
