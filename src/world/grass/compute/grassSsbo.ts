// @ts-nocheck — TSL node parameter typings incomplete in r184
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
  mix,
  smoothstep,
  step,
  storage,
  texture,
  uint,
  vec2,
  vec3,
} from 'three/tsl';
import { type ComputeNode, IndirectStorageBufferAttribute } from 'three/webgpu';
import { GRASS_CONFIG, GRASS_MOVE_EPS_SQ } from '../config/grassConfig';
import { type GrassRingUniforms, grassSharedUniforms } from '../config/grassUniforms';
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

export { VEGETATION_INDIRECT_INSTANCE_COUNT_OFFSET as GRASS_INDIRECT_INSTANCE_COUNT_OFFSET } from './shared/vegetationIndirectTsl';

export class GrassSsbo {
  private readonly packed;
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
    ringUniforms: GrassRingUniforms,
    instanceCount: number,
    indexCount: number,
    windAtlas: Texture | null = null,
    sampleTerrainSurfaceY: unknown = null,
    sampleTerrainSurfacePosition: unknown = null,
  ) {
    this.instanceCount = instanceCount;
    this.packed = instancedArray(instanceCount, 'uvec4');
    this.visibleIndices = instancedArray(instanceCount, 'uint');
    this.drawIndirectAttr = new IndirectStorageBufferAttribute(new Uint32Array(5), 5);
    this.drawStorage = storage(this.drawIndirectAttr, vegetationDrawIndirectStruct, 1);

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
      uSurfaceBias,
    } = grassSharedUniforms;

    const { uInnerRadius, uOuterRadius, uTileSize, uBladesPerSide } = ringUniforms;

    const halfTile = uTileSize.mul(0.5);
    const scaleSpan = uBladeMaxScale.sub(uBladeMinScale);
    const bladesPerSide = uBladesPerSide;
    const spacing = uTileSize.div(uBladesPerSide);
    const grassDataTex = texture(grassDataMap);
    const windTex = windAtlas ? texture(windAtlas) : null;
    const moveEpsSq = float(GRASS_MOVE_EPS_SQ);

    const inAnnulusMask = createInAnnulusMask(uInnerRadius, uOuterRadius);
    const transitionStrength = createTransitionStrength(uBiomeGrassThreshold, uBiomeGrassFadeWidth);
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
    });
    const appendCompact = createAppendCompact(this.drawStorage, this.visibleIndices);
    const slotCount = uint(instanceCount);

    this.computeInit = Fn(() => {
      If(instanceIndex.lessThan(slotCount), () => {
        const data = this.packed.element(instanceIndex);

        const row = floor(float(instanceIndex).div(bladesPerSide));
        const col = float(instanceIndex).mod(bladesPerSide);
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
          const tileUv = vec2(offsetX, offsetZ).add(halfTile).div(uTileSize).abs().fract();
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
        data.w = packStateWord(float(1), randomScale, randomScale, uBladeMinScale, scaleSpan);
      });
    })().compute(instanceCount, [GRASS_CONFIG.WORKGROUP_SIZE]);

    this.computeInitIndirect = createComputeInitIndirect(this.drawStorage, indexCount);
    this.computeCompactReset = createComputeCompactReset(this.drawStorage);

    this.computeUpdateCompact = Fn(() => {
      If(instanceIndex.lessThan(slotCount), () => {
        const data = this.packed.element(instanceIndex);

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
        const currentScale = unpackCurrentScale(data.w, uBladeMinScale, scaleSpan);
        const originalScale = unpackOriginalScale(data.w, uBladeMinScale, scaleSpan);

        If(inAnnulus.greaterThan(float(0)), () => {
          const worldX = wrapped.x.add(uPlayerPosition.x);
          const worldZ = wrapped.z.add(uPlayerPosition.z);
          const grassData = sampleGrassData(worldX, worldZ);
          const { heightNorm, yOffset, surfaceXZ } = grassData;

          const visibility = buildVisibility(wrapped.x, wrapped.z, yOffset, grassData.grassWeight);
          const isVisible = visibility.visible;
          const debugOn = uGrassCullDebug.greaterThan(float(0.5));
          const visByte = debugOn.select(visibility.reason, encodeVisBool(isVisible));
          const drawInstance = debugOn.select(float(1), isVisible);

          const worldPos = vec3(surfaceXZ.x, yOffset, surfaceXZ.y);
          const diff = worldPos.xz.sub(uPlayerPosition.xz);
          const distSqPlayer = diff.dot(diff);
          const inner = uTrailRadiusSquared.mul(0.35);
          const outer = uTrailRadiusSquared;
          const isPlayerGrounded = step(
            float(0.1),
            float(1).sub(uPlayerPosition.y.sub(yOffset).abs().div(float(3))),
          );
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
          data.w = packStateWord(visByte, nextScale, originalScale, uBladeMinScale, scaleSpan);
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
          const visByte = debugOn.select(visibility.reason, uint(0));
          const drawInstance = debugOn.select(float(1), float(0));
          data.x = packOffsetX(wrapped.x);
          data.y = packOffsetZ(wrapped.z);
          data.z = packHeightWord(grassData.heightNorm);
          data.w = packStateWord(visByte, currentScale, originalScale, uBladeMinScale, scaleSpan);
          appendCompact(drawInstance);
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
    this.drawIndirectAttr.dispose();
    this.computeInit.dispose();
    this.computeInitIndirect.dispose();
    this.computeCompactReset.dispose();
    this.computeUpdateCompact.dispose();
  }
}
