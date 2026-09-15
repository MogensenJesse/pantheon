// src/world/grass/compute/grassSsbo.ts — GPU compute for grass instance state (bit-packed uvec2)
import type { DataTexture, Texture } from 'three';
import {
  EPSILON,
  Fn,
  float,
  If,
  instancedArray,
  instanceIndex,
  max,
  min,
  mix,
  smoothstep,
  step,
  texture,
  uint,
} from 'three/tsl';
import type { ComputeNode, IndirectStorageBufferAttribute } from 'three/webgpu';
import { VISUAL } from '../../../config/visualTuning';
import { GRASS_CONFIG } from '../config/grassConfig';
import { type GrassRingUniforms, grassSharedUniforms } from '../config/grassUniforms';
import type { TslNode } from '../tsl/tslNode';
import {
  clearTerrainCacheValid,
  encodeVisBool,
  packHeightWord,
  packStateWord,
  unpackCurrentScale,
  unpackGrassWeight,
  unpackHeightNorm,
  unpackOriginalScale,
  unpackTerrainCacheValid,
  unpackVisByte,
} from './grassSsboPack';
import { vegetationCompactKeep } from './shared/vegetationCompactTsl';
import { resetIndirectInstanceCountAtKernelStart } from './shared/vegetationIndirectTsl';
import { vegetationFollowSlot, vegetationSlotWrapped } from './shared/vegetationOffsetTsl';
import {
  createVegetationIndirectResources,
  createVegetationVisibilityContext,
} from './shared/vegetationSsboResources';
import {
  assignVegetationTileMark,
  grassTileCount,
  grassTilesPerSide,
  vegetationTileFrustumVisible,
  vegetationTileIdFromOffset,
} from './shared/vegetationTileCullTsl';
import { NEAR_CAMERA_ALWAYS_VISIBLE } from './shared/vegetationVisibilityTsl';

export { VEGETATION_INDIRECT_INSTANCE_COUNT_OFFSET as GRASS_INDIRECT_INSTANCE_COUNT_OFFSET } from './shared/vegetationIndirectTsl';

export class GrassSsbo {
  private readonly packed: TslNode;
  private readonly visibleIndices: TslNode;
  private readonly tileVisible: TslNode;
  private readonly drawIndirectAttr: IndirectStorageBufferAttribute;
  private readonly drawStorage: TslNode;

  readonly computeInit: ComputeNode;
  readonly computeInitIndirect: ComputeNode;
  readonly computeMarkTiles: ComputeNode;
  readonly computeUpdateCompact: ComputeNode;
  readonly instanceCount: number;
  readonly tileCount: number;

  constructor(
    grassDataMap: DataTexture,
    ringUniforms: GrassRingUniforms,
    instanceCount: number,
    indexCount: number,
    windAtlas: Texture,
    sampleTerrainSurfaceY: (worldXZ: TslNode) => TslNode,
    propExclusionMap: DataTexture,
    bladesPerSide = Math.round(Math.sqrt(instanceCount)),
    tileCullSize: number = VISUAL.grass.tileCullSize,
  ) {
    this.instanceCount = instanceCount;
    const tilesPerSideCpu = grassTilesPerSide(bladesPerSide, tileCullSize);
    this.tileCount = grassTileCount(bladesPerSide, tileCullSize);

    this.packed = instancedArray(instanceCount, 'uvec2');
    this.tileVisible = instancedArray(this.tileCount, 'uint');
    const indirect = createVegetationIndirectResources(instanceCount, indexCount);
    this.visibleIndices = indirect.visibleIndices;
    this.drawIndirectAttr = indirect.drawIndirectAttr;
    this.drawStorage = indirect.drawStorage;
    const appendCompact = indirect.appendCompact;
    const slotCount = indirect.slotCount;

    const {
      uWorldSize,
      uHeightScale,
      uBladeMinScale,
      uBladeMaxScale,
      uPrevPlayerXZ,
      uPlayerPosition,
      uBiomeGrassThreshold,
      uBiomeGrassFadeWidth,
      uGrassTransitionMinScale,
      uClumpEdgeMinScale,
      uTrailRadiusSquared,
      uTrailGrowthRate,
      uTrailMinScale,
      uKDown,
      uCompactDeltaTime,
      uGrassTileCullEnabled,
      uSurfaceBias,
      uBladeHeight,
      uInvalidateTerrainCache,
    } = grassSharedUniforms as any;

    const {
      uInnerRadius,
      uOuterRadius,
      uTileSize,
      uBladesPerSide,
      uBladeBoundsRadius,
      uFadeBandM,
      uFadeInBandM,
    } = ringUniforms as any;

    const bladesPerSideNode = uBladesPerSide;
    const spacing = uTileSize.div(uBladesPerSide);
    const windTex = texture(windAtlas);
    const tileCullSizeNode = float(Math.max(1, tileCullSize));
    const tilesPerSideNode = float(tilesPerSideCpu);
    const tileSlotCount = uint(this.tileCount);

    const followParams = {
      perSide: bladesPerSideNode,
      spacing,
      tileSize: uTileSize,
      windTex,
      wrapNoiseChannel: (atlas: TslNode) => atlas.b,
    };

    const {
      inAnnulusMask,
      transitionStrength,
      sampleGrassData,
      sampleGrassClump,
      buildVisibility,
    } = createVegetationVisibilityContext({
      grassDataMap,
      uInnerRadius,
      uOuterRadius,
      uWorldSize,
      uHeightScale,
      uSurfaceBias,
      grassThreshold: uBiomeGrassThreshold,
      fadeWidth: uBiomeGrassFadeWidth,
      frustumBoundsRadius: uBladeBoundsRadius,
      uRingFadeBandM: uFadeBandM,
      uRingFadeInBandM: uFadeInBandM,
      sampleTerrainSurfaceY,
      propExclusionMap,
    });

    this.computeInit = Fn(() => {
      If(instanceIndex.lessThan(slotCount), () => {
        const data = this.packed.element(instanceIndex) as any;
        const placed = vegetationFollowSlot({
          ...followParams,
          slotIndex: instanceIndex,
          playerX: uPlayerPosition.x,
          playerZ: uPlayerPosition.z,
        });
        const shaped = placed.atlas.b.mul(placed.atlas.b);
        const randomScale = mix(uBladeMinScale, uBladeMaxScale, shaped);
        const worldX = placed.offsetX.add(uPlayerPosition.x);
        const worldZ = placed.offsetZ.add(uPlayerPosition.z);
        const grassData = sampleGrassData(worldX, worldZ);

        data.x = packHeightWord(grassData.heightNorm, grassData.grassWeight, float(1));
        data.y = packStateWord(float(0), randomScale, randomScale);
      });
    })().compute(instanceCount, [GRASS_CONFIG.WORKGROUP_SIZE]);

    this.computeInitIndirect = indirect.computeInitIndirect;

    this.computeMarkTiles = Fn(() => {
      If(instanceIndex.lessThan(tileSlotCount), () => {
        const tileId = float(instanceIndex);
        const vis = vegetationTileFrustumVisible({
          tileId,
          uTileSize,
          uBladesPerSide,
          tileCullSize: tileCullSizeNode,
          tilesPerSide: tilesPerSideNode,
          uPlayerPosition,
          uSurfaceBias,
          uBladeBoundsRadius,
          sampleTerrainSurfaceY,
        });
        assignVegetationTileMark(this.tileVisible, tileId, vis, uGrassTileCullEnabled);
      });
    })().compute(this.tileCount, [GRASS_CONFIG.WORKGROUP_SIZE]);

    this.computeUpdateCompact = Fn(() => {
      resetIndirectInstanceCountAtKernelStart(this.drawStorage);

      If(instanceIndex.lessThan(slotCount), () => {
        const data = this.packed.element(instanceIndex) as any;
        const placed = vegetationFollowSlot({
          ...followParams,
          slotIndex: instanceIndex,
          playerX: uPlayerPosition.x,
          playerZ: uPlayerPosition.z,
        });
        const wrappedX = placed.offsetX;
        const wrappedZ = placed.offsetZ;
        const isWrapped = vegetationSlotWrapped(
          placed.gridX,
          placed.gridZ,
          uPrevPlayerXZ.x,
          uPrevPlayerXZ.y,
          uPlayerPosition.x,
          uPlayerPosition.z,
          uTileSize,
        );

        const inAnnulus = inAnnulusMask(wrappedX, wrappedZ);
        const currentScale = unpackCurrentScale(data.y);
        const originalScale = unpackOriginalScale(data.y);

        If(inAnnulus.greaterThan(float(0.05)), () => {
          const tileCullOn = step(float(0.5), uGrassTileCullEnabled);
          const manhattan = wrappedX.abs().add(wrappedZ.abs());
          const nearKeep = float(1).sub(
            step(max(float(NEAR_CAMERA_ALWAYS_VISIBLE), uTrailRadiusSquared.sqrt()), manhattan),
          );
          const tileId = vegetationTileIdFromOffset(
            wrappedX,
            wrappedZ,
            uTileSize,
            uBladesPerSide,
            tileCullSizeNode,
            tilesPerSideNode,
          );
          const tileBit = this.tileVisible.element(tileId) as any;
          const tileMiss = float(1).sub(step(float(0.5), tileBit.toFloat()));
          const skipExpensive = tileCullOn.mul(float(1).sub(nearKeep)).mul(tileMiss);

          If(skipExpensive.lessThan(float(0.5)), () => {
            const worldX = wrappedX.add(uPlayerPosition.x);
            const worldZ = wrappedZ.add(uPlayerPosition.z);
            const cacheValidity = unpackTerrainCacheValid(data.x)
              .mul(float(1).sub(isWrapped))
              .mul(float(1).sub(uInvalidateTerrainCache));

            const heightNorm = float(0).toVar();
            const grassWeight = float(0).toVar();
            const yOffset = float(0).toVar();
            const clumpRaw = float(0).toVar();
            If(cacheValidity.greaterThan(float(0.5)), () => {
              heightNorm.assign(unpackHeightNorm(data.x));
              grassWeight.assign(unpackGrassWeight(data.x));
              yOffset.assign(heightNorm.mul(uHeightScale).add(uSurfaceBias));
              clumpRaw.assign(sampleGrassClump(worldX, worldZ));
            }).Else(() => {
              const grassData = sampleGrassData(worldX, worldZ);
              heightNorm.assign(grassData.heightNorm);
              grassWeight.assign(grassData.grassWeight);
              yOffset.assign(grassData.yOffset);
              clumpRaw.assign(grassData.clump);
            });

            const wasVisible = step(float(0.5), unpackVisByte(data.y).toFloat());
            const previousKeep = wasVisible.mul(float(1).sub(isWrapped));
            const biomeStrength = transitionStrength(grassWeight);
            const compact = vegetationCompactKeep({
              wrappedX,
              wrappedZ,
              worldX,
              worldZ,
              yOffset,
              grassWeight,
              inAnnulus,
              biomeStrength,
              buildVisibility,
              previousKeep,
              bladeHeight: originalScale.mul(uBladeHeight),
              cellSpacing: spacing,
              clumpRaw,
            });
            const visByte = import.meta.env.DEV
              ? compact.debugOn.select(compact.reason, encodeVisBool(compact.kept))
              : encodeVisBool(compact.kept);

            const distSqPlayer = wrappedX.mul(wrappedX).add(wrappedZ.mul(wrappedZ));
            const isPlayerGrounded = step(float(0.1), float(1).sub(uPlayerPosition.y.sub(yOffset)));
            const contact = float(1)
              .sub(smoothstep(float(0), uTrailRadiusSquared, distSqPlayer))
              .mul(isPlayerGrounded);

            const transitionMul = mix(uGrassTransitionMinScale, float(1), biomeStrength);
            const clumpMul = mix(uClumpEdgeMinScale, float(1), compact.clumpMask);
            const compactDt = max(uCompactDeltaTime, EPSILON);
            const recoveryFactor = min(uTrailGrowthRate.mul(compactDt), 1);
            const baseScale = originalScale.mul(transitionMul).mul(clumpMul);
            const recoveredScale = mix(currentScale, baseScale, recoveryFactor);
            const didAppear = float(1).sub(wasVisible);
            const shouldReset = max(isWrapped, didAppear);
            const scaleBeforeTrail = mix(recoveredScale, baseScale, shouldReset);
            const crushedScale = min(baseScale, uTrailMinScale);
            const crushingFactor = min(uKDown.mul(contact).mul(compactDt), 1);
            const nextScale = mix(scaleBeforeTrail, crushedScale, crushingFactor);

            data.x = packHeightWord(heightNorm, grassWeight, float(1));
            data.y = packStateWord(visByte, nextScale, originalScale);
            appendCompact(compact.drawInstance);
          }).Else(() => {
            If(isWrapped.greaterThan(float(0.5)), () => {
              data.x = clearTerrainCacheValid(data.x);
            });
          });
        }).Else(() => {
          If(isWrapped.greaterThan(float(0.5)), () => {
            data.x = clearTerrainCacheValid(data.x);
          });
        });
      });
    })().compute(instanceCount, [GRASS_CONFIG.WORKGROUP_SIZE]);
    this.computeInit.name = 'grassInit';
    this.computeInitIndirect.name = 'grassInitIndirect';
    this.computeMarkTiles.name = 'grassMarkTiles';
    this.computeUpdateCompact.name = 'grassCompact';
  }

  get packedBuffer() {
    return this.packed;
  }

  get visibleIndicesBuffer() {
    return this.visibleIndices;
  }

  /** WebGPU indirect draw args — GPU-written instanceCount drives drawIndexedIndirect. */
  get indirectBuffer() {
    return this.drawIndirectAttr;
  }

  dispose(): void {
    this.packed.dispose();
    this.visibleIndices.dispose();
    this.tileVisible.dispose();
    this.drawIndirectAttr.dispose();
    this.computeInit.dispose();
    this.computeInitIndirect.dispose();
    this.computeMarkTiles.dispose();
    this.computeUpdateCompact.dispose();
  }
}
