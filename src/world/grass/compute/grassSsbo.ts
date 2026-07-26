// src/world/grass/compute/grassSsbo.ts — GPU compute for grass instance state (bit-packed uvec4)
import type { DataTexture, Texture } from 'three';
import {
  Fn,
  float,
  floor,
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
  vec2,
  vec3,
} from 'three/tsl';
import type { ComputeNode, IndirectStorageBufferAttribute } from 'three/webgpu';
import { VISUAL } from '../../../config/visualTuning';
import { GRASS_CONFIG, GRASS_MOVE_EPS_SQ } from '../config/grassConfig';
import { type GrassRingUniforms, grassSharedUniforms } from '../config/grassUniforms';
import type { TslNode } from '../tsl/tslNode';
import {
  encodeVisBool,
  packHeightWord,
  packOffsetX,
  packOffsetZ,
  packStateWord,
  unpackCurrentScale,
  unpackOffsetX,
  unpackOffsetZ,
  unpackOriginalScale,
} from './grassSsboPack';
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
import { vegetationMovedMask, wrapVegetationOffsetConditional } from './shared/vegetationWrapTsl';

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
      uTrailRadiusSquared,
      uTrailGrowthRate,
      uTrailMinScale,
      uKDown,
      uGrassCullDebug,
      uGrassTileCullEnabled,
      uSurfaceBias,
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

        const row = floor(float(instanceIndex).div(bladesPerSideNode));
        const col = float(instanceIndex).mod(bladesPerSideNode);
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

        let scaleNoise = hash(instanceIndex.add(77));
        if (windTex) {
          const tileUv = (vec2 as any)(offsetX, offsetZ).add(halfTile).div(uTileSize).abs().fract();
          const atlas = windTex.sample(tileUv);
          const wrapNoise = atlas.b.sub(0.5);
          offsetX = offsetX.add(wrapNoise.mul(17).fract());
          offsetZ = offsetZ.add(wrapNoise.mul(13).fract());
          scaleNoise = atlas.b;
        }

        const shaped = scaleNoise.mul(scaleNoise);
        const randomScale = mix(uBladeMinScale, uBladeMaxScale, shaped);

        data.x = packOffsetX(offsetX);
        data.y = packOffsetZ(offsetZ);
        data.z = packHeightWord(float(0));
        data.w = packStateWord(
          float(1),
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
        const currentScale = unpackCurrentScale(data.w, currentScaleMin, currentScaleSpan);
        const originalScale = unpackOriginalScale(data.w, uBladeMinScale, originalScaleSpan);

        If(inAnnulus.greaterThan(float(0.05)), () => {
          // Keep select/If on bool; use float 0/1 masks for .mul() (WGSL forbids bool*bool).
          const debugOn = uGrassCullDebug.greaterThan(float(0.5));
          const tileCullOn = step(float(0.5), uGrassTileCullEnabled);
          const debugOff = float(1).sub(step(float(0.5), uGrassCullDebug));
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
          const skipExpensive = tileCullOn.mul(debugOff).mul(float(1).sub(nearKeep)).mul(tileMiss);

          If(skipExpensive.lessThan(float(0.5)), () => {
            const worldX = wrapped.x.add(uPlayerPosition.x);
            const worldZ = wrapped.z.add(uPlayerPosition.z);
            const grassData = sampleGrassData(worldX, worldZ);
            const { heightNorm, yOffset } = grassData;

            const visibility = buildVisibility(
              wrapped.x,
              wrapped.z,
              yOffset,
              grassData.grassWeight,
            );
            const isVisible = visibility.visible;
            const visByte = debugOn.select(visibility.reason, encodeVisBool(isVisible));
            const stochKeep = step(hash(instanceIndex.add(991)), inAnnulus);
            const drawInstance = debugOn.select(float(1), isVisible.mul(stochKeep));

            const worldPos = vec3(worldX, yOffset, worldZ);
            const diff = worldPos.xz.sub(uPlayerPosition.xz);
            const distSqPlayer = diff.dot(diff);
            const inner = uTrailRadiusSquared.mul(0.35);
            const outer = uTrailRadiusSquared;
            const isPlayerGrounded = step(float(0.1), float(1).sub(uPlayerPosition.y.sub(yOffset)));
            const contact = float(1)
              .sub(smoothstep(inner, outer, distSqPlayer))
              .mul(isPlayerGrounded);

            const up = currentScale.add(originalScale.sub(currentScale).mul(uTrailGrowthRate));
            const down = currentScale.add(uTrailMinScale.sub(currentScale).mul(uKDown));
            const trailScale = mix(up, down, contact);
            const transitionMul = mix(
              uGrassTransitionMinScale,
              float(1),
              transitionStrength(grassData.grassWeight),
            );
            const nextScale = trailScale.mul(transitionMul);

            data.x = packOffsetX(wrapped.x);
            data.y = packOffsetZ(wrapped.z);
            data.z = packHeightWord(heightNorm);
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
          });
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
            const visByte = debugOn.select(visibility.reason, uint(0));
            const drawInstance = debugOn.select(float(1), float(0));
            data.x = packOffsetX(wrapped.x);
            data.y = packOffsetZ(wrapped.z);
            data.z = packHeightWord(grassData.heightNorm);
            data.w = packStateWord(
              visByte,
              currentScale,
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
          });
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
