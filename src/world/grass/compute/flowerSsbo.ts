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
  texture,
  vec3,
} from 'three/tsl';
import { type ComputeNode, IndirectStorageBufferAttribute } from 'three/webgpu';
import { FLOWER_CONFIG } from '../config/flowerConfig';
import type { FlowerRingUniforms } from '../config/flowerUniforms';
import { GRASS_MOVE_EPS_SQ } from '../config/grassConfig';
import { grassSharedUniforms } from '../config/grassUniforms';
import type { TslNode } from '../tsl/tslNode';
import { packFlowerStateZ } from './flowerSsboPack';
import { resetIndirectInstanceCountAtKernelStart } from './shared/vegetationIndirectTsl';
import {
  createVegetationIndirectResources,
  createVegetationVisibilityContext,
} from './shared/vegetationSsboResources';
import { vegetationMovedMask, wrapVegetationOffsetConditional } from './shared/vegetationWrapTsl';

/** Re-export for flower dev stats readback (same layout as grass indirect buffer). */
export { VEGETATION_INDIRECT_INSTANCE_COUNT_OFFSET as FLOWER_INDIRECT_INSTANCE_COUNT_OFFSET } from './shared/vegetationIndirectTsl';

export type { FlowerRingUniforms } from '../config/flowerUniforms';
export {
  applyFlowerRingUniforms,
  createFlowerRingUniforms,
} from '../config/flowerUniforms';

export class FlowerSsbo {
  private readonly buffer: TslNode;
  private readonly visibleIndices: TslNode;
  private readonly drawIndirectAttr: IndirectStorageBufferAttribute;
  private readonly drawStorage: TslNode;

  readonly computeInit: ComputeNode;
  readonly computeInitIndirect: ComputeNode;
  readonly computeUpdateCompact: ComputeNode;
  readonly instanceCount: number;

  constructor(
    grassDataMap: DataTexture,
    ringUniforms: FlowerRingUniforms,
    instanceCount: number,
    indexCount: number,
    windAtlas: Texture | null = null,
    sampleTerrainSurfaceY: ((worldXZ: TslNode) => TslNode) | null = null,
    sampleTerrainSurfacePosition: ((worldXZ: TslNode) => TslNode) | null = null,
  ) {
    this.instanceCount = instanceCount;
    this.buffer = instancedArray(instanceCount, 'vec4');
    const indirect = createVegetationIndirectResources(instanceCount, indexCount);
    this.visibleIndices = indirect.visibleIndices;
    this.drawIndirectAttr = indirect.drawIndirectAttr;
    this.drawStorage = indirect.drawStorage;
    const appendCompact = indirect.appendCompact;
    const slotCount = indirect.slotCount;

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
    } = grassSharedUniforms as any;

    const { uInnerRadius, uOuterRadius, uTileSize, uFlowersPerSide } = ringUniforms as any;

    const halfTile = uTileSize.mul(0.5);
    const spacing = uFlowerSpacing;
    const windTex = windAtlas ? texture(windAtlas) : null;
    const moveEpsSq = float(GRASS_MOVE_EPS_SQ);
    const heightMax = uHeightScale.add(uSurfaceBias);

    const { inAnnulusMask, sampleGrassData, buildVisibility } = createVegetationVisibilityContext({
      grassDataMap,
      uInnerRadius,
      uOuterRadius,
      uWorldSize,
      uHeightScale,
      uSurfaceBias,
      grassThreshold: uFlowerGrassThreshold,
      fadeWidth: uBiomeGrassFadeWidth,
      uPlayerPosition,
      frustumBoundsRadius: uFlowerBoundsRadius,
      sampleTerrainSurfaceY,
      sampleTerrainSurfacePosition,
    });

    this.computeInit = Fn(() => {
      If(instanceIndex.lessThan(slotCount), () => {
        const data = this.buffer.element(instanceIndex) as any;

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
          const tileUv = (vec3 as any)(offsetX, 0, offsetZ).add(halfTile).div(uTileSize).abs().fract().xy;
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

    this.computeInitIndirect = indirect.computeInitIndirect;

    this.computeUpdateCompact = Fn(() => {
      resetIndirectInstanceCountAtKernelStart(this.drawStorage);

      If(instanceIndex.lessThan(slotCount), () => {
        const data = this.buffer.element(instanceIndex) as any;
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
          const debugOn = uGrassCullDebug.greaterThan(float(0.5));
          If(debugOn, () => {
            const worldX = wrapped.x.add(uPlayerPosition.x);
            const worldZ = wrapped.z.add(uPlayerPosition.z);
            const grassData = sampleGrassData(worldX, worldZ);
            const visibility = buildVisibility(
              wrapped.x,
              wrapped.z,
              grassData.yOffset,
              grassData.grassWeight,
            );
            const drawInstance = debugOn.select(float(1), float(0));
            data.x = wrapped.x;
            data.y = wrapped.z;
            data.z = packFlowerStateZ(grassData.yOffset, float(0), heightMax);
            data.w = debugOn.select(visibility.reason, float(0));
            appendCompact(drawInstance);
          }).Else(() => {
            data.x = wrapped.x;
            data.y = wrapped.z;
          });
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
    this.computeUpdateCompact.dispose();
  }
}
