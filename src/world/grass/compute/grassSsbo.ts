// src/world/grass/compute/grassSsbo.ts — GPU compute for grass instance state (bit-packed uvec4)
import type { DataTexture, Texture } from 'three';
import {
  EPSILON,
  Fn,
  float,
  hash,
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
import { GRASS_CONFIG, GRASS_MOVE_EPS_SQ } from '../config/grassConfig';
import { type GrassRingUniforms, grassSharedUniforms } from '../config/grassUniforms';
import type { TslNode } from '../tsl/tslNode';
import {
  clearTerrainCacheValid,
  encodeVisBool,
  packHeightWord,
  packOffsetX,
  packOffsetZ,
  packStateWord,
  unpackCurrentScale,
  unpackGrassWeight,
  unpackHeightNorm,
  unpackOffsetX,
  unpackOffsetZ,
  unpackOriginalScale,
  unpackTerrainCacheValid,
  unpackVisByte,
} from './grassSsboPack';
import { vegetationCompactKeep, vegetationJitteredGridOffset } from './shared/vegetationCompactTsl';
import { resetIndirectInstanceCountAtKernelStart } from './shared/vegetationIndirectTsl';
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
import { vegetationWrapSlot } from './shared/vegetationWrapTsl';

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
    windAtlas: Texture | null = null,
    sampleTerrainSurfaceY: ((worldXZ: TslNode) => TslNode) | null = null,
    sampleTerrainSurfacePosition: ((worldXZ: TslNode) => TslNode) | null = null,
    propExclusionMap: DataTexture | null = null,
    bladesPerSide = Math.round(Math.sqrt(instanceCount)),
    tileCullSize: number = VISUAL.grass.tileCullSize,
  ) {
    this.instanceCount = instanceCount;
    const tilesPerSideCpu = grassTilesPerSide(bladesPerSide, tileCullSize);
    this.tileCount = grassTileCount(bladesPerSide, tileCullSize);

    this.packed = instancedArray(instanceCount, 'uvec4');
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
      uPlayerDeltaXZ,
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

    const halfTile = uTileSize.mul(0.5);
    const originalScaleSpan = uBladeMaxScale.sub(uBladeMinScale);
    const currentScaleMin = min(uBladeMinScale, uTrailMinScale);
    const currentScaleSpan = uBladeMaxScale.sub(currentScaleMin);
    const bladesPerSideNode = uBladesPerSide;
    const spacing = uTileSize.div(uBladesPerSide);
    const windTex = windAtlas ? texture(windAtlas) : null;
    const moveEpsSq = float(GRASS_MOVE_EPS_SQ);
    const tileCullSizeNode = float(Math.max(1, tileCullSize));
    const tilesPerSideNode = float(tilesPerSideCpu);
    const tileSlotCount = uint(this.tileCount);

    const { inAnnulusMask, transitionStrength, sampleGrassData, buildVisibility } =
      createVegetationVisibilityContext({
        grassDataMap,
        uInnerRadius,
        uOuterRadius,
        uWorldSize,
        uHeightScale,
        uSurfaceBias,
        grassThreshold: uBiomeGrassThreshold,
        fadeWidth: uBiomeGrassFadeWidth,
        uPlayerPosition,
        frustumBoundsRadius: uBladeBoundsRadius,
        uRingFadeBandM: uFadeBandM,
        uRingFadeInBandM: uFadeInBandM,
        sampleTerrainSurfaceY,
        sampleTerrainSurfacePosition,
        propExclusionMap,
      });

    this.computeInit = Fn(() => {
      If(instanceIndex.lessThan(slotCount), () => {
        const data = this.packed.element(instanceIndex) as any;
        const placed = vegetationJitteredGridOffset({
          perSide: bladesPerSideNode,
          spacing,
          halfTile,
          tileSize: uTileSize,
          windTex,
          wrapNoiseChannel: (atlas) => atlas.b,
        });
        const offsetX = placed.offsetX;
        const offsetZ = placed.offsetZ;
        const scaleNoise = placed.atlas ? placed.atlas.b : hash(instanceIndex.add(77));

        const shaped = scaleNoise.mul(scaleNoise);
        const randomScale = mix(uBladeMinScale, uBladeMaxScale, shaped);
        const worldX = offsetX.add(uPlayerPosition.x);
        const worldZ = offsetZ.add(uPlayerPosition.z);
        const grassData = sampleGrassData(worldX, worldZ);

        data.x = packOffsetX(offsetX);
        data.y = packOffsetZ(offsetZ);
        // Tile-cull skip leaves height unchanged — packing 0 here made blades
        // pop onto terrain as frustum tiles came online over the first frames.
        data.z = packHeightWord(grassData.heightNorm, grassData.grassWeight, float(1));
        data.w = packStateWord(
          float(0),
          randomScale,
          randomScale,
          currentScaleMin,
          currentScaleSpan,
          uBladeMinScale,
          originalScaleSpan,
        );
      });
    })().compute(instanceCount, [GRASS_CONFIG.WORKGROUP_SIZE]);

    this.computeInitIndirect = indirect.computeInitIndirect;

    this.computeMarkTiles = Fn(() => {
      If(instanceIndex.lessThan(tileSlotCount), () => {
        const tileId = float(instanceIndex);
        const visible = vegetationTileFrustumVisible({
          tileId,
          uTileSize,
          uBladesPerSide,
          tileCullSize: tileCullSizeNode,
          tilesPerSide: tilesPerSideNode,
          uPlayerPosition,
          uHeightScale,
          uSurfaceBias,
          uBladeBoundsRadius,
        });
        assignVegetationTileMark(this.tileVisible, tileId, visible, uGrassTileCullEnabled);
      });
    })().compute(this.tileCount, [GRASS_CONFIG.WORKGROUP_SIZE]);

    this.computeUpdateCompact = Fn(() => {
      resetIndirectInstanceCountAtKernelStart(this.drawStorage);

      If(instanceIndex.lessThan(slotCount), () => {
        const data = this.packed.element(instanceIndex) as any;

        const offsetX = unpackOffsetX(data.x);
        const offsetZ = unpackOffsetZ(data.y);
        const { wrapped, isWrapped } = vegetationWrapSlot(
          offsetX,
          offsetZ,
          uPlayerDeltaXZ,
          uTileSize,
          moveEpsSq,
        );

        const inAnnulus = inAnnulusMask(wrapped.x, wrapped.z);
        const currentScale = unpackCurrentScale(data.w, currentScaleMin, currentScaleSpan);
        const originalScale = unpackOriginalScale(data.w, uBladeMinScale, originalScaleSpan);

        If(inAnnulus.greaterThan(float(0.05)), () => {
          // Keep select/If on bool; use float 0/1 masks for .mul() (WGSL forbids bool*bool).
          const tileCullOn = step(float(0.5), uGrassTileCullEnabled);
          const manhattan = wrapped.x.abs().add(wrapped.z.abs());
          const nearRadius = max(float(NEAR_CAMERA_ALWAYS_VISIBLE), uTrailRadiusSquared.sqrt());
          const nearKeep = float(1).sub(step(nearRadius, manhattan));
          const tileId = vegetationTileIdFromOffset(
            wrapped.x,
            wrapped.z,
            uTileSize,
            uBladesPerSide,
            tileCullSizeNode,
            tilesPerSideNode,
          );
          const tileBit = this.tileVisible.element(tileId) as any;
          // Sticky counter > 0 means keep the expensive path (see assignVegetationTileMark).
          const tileMiss = float(1).sub(step(float(0.5), tileBit.toFloat()));
          const skipExpensive = tileCullOn.mul(float(1).sub(nearKeep)).mul(tileMiss);

          If(skipExpensive.lessThan(float(0.5)), () => {
            const worldX = wrapped.x.add(uPlayerPosition.x);
            const worldZ = wrapped.z.add(uPlayerPosition.z);
            const cacheValidity = unpackTerrainCacheValid(data.z)
              .mul(float(1).sub(isWrapped))
              .mul(float(1).sub(uInvalidateTerrainCache));

            const heightNorm = float(0).toVar();
            const grassWeight = float(0).toVar();
            const yOffset = float(0).toVar();
            If(cacheValidity.greaterThan(float(0.5)), () => {
              heightNorm.assign(unpackHeightNorm(data.z));
              grassWeight.assign(unpackGrassWeight(data.z));
              yOffset.assign(heightNorm.mul(uHeightScale).add(uSurfaceBias));
            }).Else(() => {
              const grassData = sampleGrassData(worldX, worldZ);
              heightNorm.assign(grassData.heightNorm);
              grassWeight.assign(grassData.grassWeight);
              yOffset.assign(grassData.yOffset);
            });

            const wasVisible = step(float(0.5), unpackVisByte(data.w).toFloat());
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
              bladeHeight: currentScale.mul(uBladeHeight),
              cellSpacing: spacing,
            });
            const { kept, drawInstance, reason, debugOn, clumpMask } = compact;
            const visByte = debugOn.select(reason, encodeVisBool(kept));

            const distSqPlayer = wrapped.x.mul(wrapped.x).add(wrapped.z.mul(wrapped.z));
            const isPlayerGrounded = step(float(0.1), float(1).sub(uPlayerPosition.y.sub(yOffset)));
            const contact = float(1)
              .sub(smoothstep(float(0), uTrailRadiusSquared, distSqPlayer))
              .mul(isPlayerGrounded);

            const transitionMul = mix(
              uGrassTransitionMinScale,
              float(1),
              transitionStrength(grassWeight),
            );
            const clumpMul = mix(uClumpEdgeMinScale, float(1), clumpMask);
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

            data.x = packOffsetX(wrapped.x);
            data.y = packOffsetZ(wrapped.z);
            data.z = packHeightWord(heightNorm, grassWeight, float(1));
            data.w = packStateWord(
              visByte,
              nextScale,
              originalScale,
              currentScaleMin,
              currentScaleSpan,
              uBladeMinScale,
              originalScaleSpan,
            );
            appendCompact(drawInstance);
          }).Else(() => {
            data.x = packOffsetX(wrapped.x);
            data.y = packOffsetZ(wrapped.z);
            data.z = isWrapped
              .greaterThan(float(0.5))
              .select(clearTerrainCacheValid(data.z), data.z);
          });
        }).Else(() => {
          data.x = packOffsetX(wrapped.x);
          data.y = packOffsetZ(wrapped.z);
          data.z = isWrapped.greaterThan(float(0.5)).select(clearTerrainCacheValid(data.z), data.z);
        });
      });
    })().compute(instanceCount, [GRASS_CONFIG.WORKGROUP_SIZE]);
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
