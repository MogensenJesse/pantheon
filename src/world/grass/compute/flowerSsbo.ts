// src/world/grass/compute/flowerSsbo.ts — GPU compute for flower instance state (vec4)
import type { DataTexture, Texture } from 'three';
import { Fn, float, If, instancedArray, instanceIndex, texture } from 'three/tsl';
import type { ComputeNode, IndirectStorageBufferAttribute } from 'three/webgpu';
import { FLOWER_CONFIG } from '../config/flowerConfig';
import type { FlowerRingUniforms } from '../config/flowerUniforms';
import { GRASS_MOVE_EPS_SQ } from '../config/grassConfig';
import { grassSharedUniforms } from '../config/grassUniforms';
import type { TslNode } from '../tsl/tslNode';
import { packFlowerStateW, unpackFlowerVisibility } from './flowerSsboPack';
import { vegetationCompactKeep, vegetationJitteredGridOffset } from './shared/vegetationCompactTsl';
import { resetIndirectInstanceCountAtKernelStart } from './shared/vegetationIndirectTsl';
import {
  createVegetationIndirectResources,
  createVegetationVisibilityContext,
} from './shared/vegetationSsboResources';
import { vegetationWrapSlot } from './shared/vegetationWrapTsl';

/** Re-export for flower dev stats readback (same layout as grass indirect buffer). */
export { VEGETATION_INDIRECT_INSTANCE_COUNT_OFFSET as FLOWER_INDIRECT_INSTANCE_COUNT_OFFSET } from './shared/vegetationIndirectTsl';

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
    propExclusionMap: DataTexture | null = null,
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
      uFlowerMaxScale,
    } = grassSharedUniforms as any;

    const { uInnerRadius, uOuterRadius, uTileSize, uFlowersPerSide, uFadeBandM, uFadeInBandM } =
      ringUniforms as any;

    const halfTile = uTileSize.mul(0.5);
    const spacing = uTileSize.div(uFlowersPerSide);
    const windTex = windAtlas ? texture(windAtlas) : null;
    const moveEpsSq = float(GRASS_MOVE_EPS_SQ);

    const { inAnnulusMask, transitionStrength, sampleGrassData, buildVisibility } =
      createVegetationVisibilityContext({
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
        uRingFadeBandM: uFadeBandM,
        uRingFadeInBandM: uFadeInBandM,
        sampleTerrainSurfaceY,
        sampleTerrainSurfacePosition,
        propExclusionMap,
      });

    this.computeInit = Fn(() => {
      If(instanceIndex.lessThan(slotCount), () => {
        const data = this.buffer.element(instanceIndex) as any;
        const placed = vegetationJitteredGridOffset({
          perSide: uFlowersPerSide,
          spacing,
          halfTile,
          tileSize: uTileSize,
          windTex,
          wrapNoiseChannel: (atlas) => atlas.r,
        });
        const offsetX = placed.offsetX;
        const offsetZ = placed.offsetZ;

        const worldX = offsetX.add(uPlayerPosition.x);
        const worldZ = offsetZ.add(uPlayerPosition.z);
        const grassData = sampleGrassData(worldX, worldZ);

        data.x = offsetX;
        data.y = offsetZ;
        data.z = grassData.yOffset;
        data.w = packFlowerStateW(float(0), float(0));
      });
    })().compute(instanceCount, [FLOWER_CONFIG.WORKGROUP_SIZE]);

    this.computeInitIndirect = indirect.computeInitIndirect;

    this.computeUpdateCompact = Fn(() => {
      resetIndirectInstanceCountAtKernelStart(this.drawStorage);

      If(instanceIndex.lessThan(slotCount), () => {
        const data = this.buffer.element(instanceIndex) as any;
        const offsetX = data.x;
        const offsetZ = data.y;
        const { wrapped, isWrapped } = vegetationWrapSlot(
          offsetX,
          offsetZ,
          uPlayerDeltaXZ,
          uTileSize,
          moveEpsSq,
        );

        const inAnnulus = inAnnulusMask(wrapped.x, wrapped.z);

        If(inAnnulus.greaterThan(float(0.05)), () => {
          const worldX = wrapped.x.add(uPlayerPosition.x);
          const worldZ = wrapped.z.add(uPlayerPosition.z);
          const grassData = sampleGrassData(worldX, worldZ);
          const yOffset = grassData.yOffset;
          const grassWeight = grassData.grassWeight;
          const wasVisible = unpackFlowerVisibility(data.w);
          const previousKeep = wasVisible.mul(float(1).sub(isWrapped));
          const compact = vegetationCompactKeep({
            wrappedX: wrapped.x,
            wrappedZ: wrapped.z,
            yOffset,
            grassWeight,
            inAnnulus,
            transitionStrength,
            buildVisibility,
            previousKeep,
            bladeHeight: uFlowerMaxScale,
            cellSpacing: spacing,
          });

          data.x = wrapped.x;
          data.y = wrapped.z;
          data.z = yOffset;
          data.w = packFlowerStateW(compact.kept, compact.debugOn.select(compact.reason, float(0)));
          appendCompact(compact.drawInstance);
        }).Else(() => {
          data.x = wrapped.x;
          data.y = wrapped.z;
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
