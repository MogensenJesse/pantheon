// src/world/grass/compute/flowerSsbo.ts — GPU compute for flower instance state (uint)
import type { DataTexture, Texture } from 'three';
import { Fn, float, If, instancedArray, instanceIndex, texture } from 'three/tsl';
import type { ComputeNode, IndirectStorageBufferAttribute } from 'three/webgpu';
import { FLOWER_CONFIG } from '../config/flowerConfig';
import type { FlowerRingUniforms } from '../config/flowerUniforms';
import { grassSharedUniforms } from '../config/grassUniforms';
import type { TslNode } from '../tsl/tslNode';
import { packFlowerWord, unpackFlowerVisibility } from './flowerSsboPack';
import { vegetationCompactKeep } from './shared/vegetationCompactTsl';
import { resetIndirectInstanceCountAtKernelStart } from './shared/vegetationIndirectTsl';
import { vegetationFollowSlot, vegetationSlotWrapped } from './shared/vegetationOffsetTsl';
import {
  createVegetationIndirectResources,
  createVegetationVisibilityContext,
} from './shared/vegetationSsboResources';

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
    windAtlas: Texture,
    sampleTerrainSurfaceY: (worldXZ: TslNode) => TslNode,
    propExclusionMap: DataTexture,
  ) {
    this.instanceCount = instanceCount;
    this.buffer = instancedArray(instanceCount, 'uint');
    const indirect = createVegetationIndirectResources(instanceCount, indexCount);
    this.visibleIndices = indirect.visibleIndices;
    this.drawIndirectAttr = indirect.drawIndirectAttr;
    this.drawStorage = indirect.drawStorage;
    const appendCompact = indirect.appendCompact;
    const slotCount = indirect.slotCount;

    const {
      uWorldSize,
      uHeightScale,
      uPrevPlayerXZ,
      uPlayerPosition,
      uFlowerGrassThreshold,
      uBiomeGrassFadeWidth,
      uFlowerBoundsRadius,
      uSurfaceBias,
      uFlowerMaxScale,
    } = grassSharedUniforms as any;

    const { uInnerRadius, uOuterRadius, uTileSize, uFlowersPerSide, uFadeBandM, uFadeInBandM } =
      ringUniforms as any;

    const spacing = uTileSize.div(uFlowersPerSide);
    const windTex = texture(windAtlas);

    const followParams = {
      perSide: uFlowersPerSide,
      spacing,
      tileSize: uTileSize,
      windTex,
      wrapNoiseChannel: (atlas: TslNode) => atlas.r,
    };

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
        frustumBoundsRadius: uFlowerBoundsRadius,
        uRingFadeBandM: uFadeBandM,
        uRingFadeInBandM: uFadeInBandM,
        sampleTerrainSurfaceY,
        propExclusionMap,
      });

    this.computeInit = Fn(() => {
      If(instanceIndex.lessThan(slotCount), () => {
        const placed = vegetationFollowSlot({
          ...followParams,
          slotIndex: instanceIndex,
          playerX: uPlayerPosition.x,
          playerZ: uPlayerPosition.z,
        });
        const worldX = placed.offsetX.add(uPlayerPosition.x);
        const worldZ = placed.offsetZ.add(uPlayerPosition.z);
        const grassData = sampleGrassData(worldX, worldZ);
        (this.buffer.element(instanceIndex) as any).assign(
          packFlowerWord(grassData.heightNorm, float(0), float(0)),
        );
      });
    })().compute(instanceCount, [FLOWER_CONFIG.WORKGROUP_SIZE]);

    this.computeInitIndirect = indirect.computeInitIndirect;

    this.computeUpdateCompact = Fn(() => {
      resetIndirectInstanceCountAtKernelStart(this.drawStorage);

      If(instanceIndex.lessThan(slotCount), () => {
        const word = this.buffer.element(instanceIndex) as any;
        const placed = vegetationFollowSlot({
          ...followParams,
          slotIndex: instanceIndex,
          playerX: uPlayerPosition.x,
          playerZ: uPlayerPosition.z,
        });
        const isWrapped = vegetationSlotWrapped(
          placed.gridX,
          placed.gridZ,
          uPrevPlayerXZ.x,
          uPrevPlayerXZ.y,
          uPlayerPosition.x,
          uPlayerPosition.z,
          uTileSize,
        );
        const inAnnulus = inAnnulusMask(placed.offsetX, placed.offsetZ);

        If(inAnnulus.greaterThan(float(0.05)), () => {
          const worldX = placed.offsetX.add(uPlayerPosition.x);
          const worldZ = placed.offsetZ.add(uPlayerPosition.z);
          const grassData = sampleGrassData(worldX, worldZ);
          const wasVisible = unpackFlowerVisibility(word);
          const previousKeep = wasVisible.mul(float(1).sub(isWrapped));
          const biomeStrength = transitionStrength(grassData.grassWeight);
          const compact = vegetationCompactKeep({
            wrappedX: placed.offsetX,
            wrappedZ: placed.offsetZ,
            worldX,
            worldZ,
            yOffset: grassData.yOffset,
            grassWeight: grassData.grassWeight,
            inAnnulus,
            biomeStrength,
            buildVisibility,
            previousKeep,
            bladeHeight: uFlowerMaxScale,
            cellSpacing: spacing,
            clumpRaw: grassData.clump,
          });
          const reason = import.meta.env.DEV
            ? compact.debugOn.select(compact.reason, float(0))
            : float(0);
          word.assign(packFlowerWord(grassData.heightNorm, compact.kept, reason));
          appendCompact(compact.drawInstance);
        });
      });
    })().compute(instanceCount, [FLOWER_CONFIG.WORKGROUP_SIZE]);
    this.computeInit.name = 'flowerInit';
    this.computeInitIndirect.name = 'flowerInitIndirect';
    this.computeUpdateCompact.name = 'flowerCompact';
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
