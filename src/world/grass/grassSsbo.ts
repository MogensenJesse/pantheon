// @ts-nocheck — TSL node parameter typings incomplete in r184
// src/world/grass/grassSsbo.ts — GPU compute for grass instance state (bit-packed uvec4)
import type { DataTexture, Texture } from 'three';
import {
  Fn,
  float,
  floor,
  hash,
  instancedArray,
  instanceIndex,
  mix,
  mod,
  smoothstep,
  step,
  texture,
  vec2,
  vec3,
} from 'three/tsl';
import type { ComputeNode } from 'three/webgpu';
import { worldXZToMapUv } from '../../map/mapUvTsl';
import { GRASS_MOVE_EPS_SQ } from './grassComputeSchedule';
import { GRASS_CONFIG } from './grassConfig';
import { grassFrustumVisibility } from './grassFrustumVisibilityTsl';
import {
  packHeightWord,
  packOffsetX,
  packOffsetZ,
  packStateWord,
  packVisibilityOnly,
  unpackCurrentScale,
  unpackOffsetX,
  unpackOffsetZ,
  unpackOriginalScale,
} from './grassSsboPack';
import { type GrassRingUniforms, grassSharedUniforms } from './grassUniforms';

export class GrassSsbo {
  private readonly packed;

  readonly computeInit: ComputeNode;
  readonly computeUpdate: ComputeNode;
  readonly computeVisibility: ComputeNode;
  readonly instanceCount: number;

  constructor(
    grassDataMap: DataTexture,
    ringUniforms: GrassRingUniforms,
    instanceCount: number,
    windAtlas: Texture | null = null,
  ) {
    this.instanceCount = instanceCount;
    this.packed = instancedArray(instanceCount, 'uvec4');

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
    } = grassSharedUniforms;

    const { uInnerRadius, uOuterRadius, uTileSize, uBladesPerSide } = ringUniforms;

    const halfTile = uTileSize.mul(0.5);
    const scaleSpan = uBladeMaxScale.sub(uBladeMinScale);
    const bladesPerSide = uBladesPerSide;
    const spacing = uTileSize.div(uBladesPerSide);
    const grassDataTex = texture(grassDataMap);
    const windTex = windAtlas ? texture(windAtlas) : null;
    const moveEpsSq = float(GRASS_MOVE_EPS_SQ);

    this.computeInit = Fn(() => {
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
    })().compute(instanceCount, [GRASS_CONFIG.WORKGROUP_SIZE]);

    const transitionStrength = (grassWeight) =>
      smoothstep(uBiomeGrassThreshold, uBiomeGrassThreshold.add(uBiomeGrassFadeWidth), grassWeight);

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

      const frustumVis = grassFrustumVisibility(worldPos);

      return frustumVis.mul(inAnnulus).mul(allowed);
    };

    const sampleGrassData = (worldX, worldZ) => {
      const mapUv = worldXZToMapUv(worldX, worldZ, uWorldSize);
      const data = grassDataTex.sample(mapUv);
      const heightNorm = data.r;
      const grassWeight = data.g;
      const yOffset = heightNorm.mul(uHeightScale);
      return { heightNorm, grassWeight, yOffset };
    };

    this.computeVisibility = Fn(() => {
      const data = this.packed.element(instanceIndex);
      const offsetX = unpackOffsetX(data.x);
      const offsetZ = unpackOffsetZ(data.y);
      const worldX = offsetX.add(uPlayerPosition.x);
      const worldZ = offsetZ.add(uPlayerPosition.z);
      const grassData = sampleGrassData(worldX, worldZ);
      const isVisible = buildVisibility(offsetX, offsetZ, grassData.yOffset, grassData.grassWeight);
      data.w = packVisibilityOnly(data.w, isVisible);
    })().compute(instanceCount, [GRASS_CONFIG.WORKGROUP_SIZE]);

    this.computeUpdate = Fn(() => {
      const data = this.packed.element(instanceIndex);
      const halfTileSize = uTileSize.mul(0.5);

      const offsetX = unpackOffsetX(data.x);
      const offsetZ = unpackOffsetZ(data.y);

      const deltaSq = uPlayerDeltaXZ.x
        .mul(uPlayerDeltaXZ.x)
        .add(uPlayerDeltaXZ.y.mul(uPlayerDeltaXZ.y));
      const moved = step(moveEpsSq, deltaSq);

      const wrappedX = mix(
        offsetX,
        mod(offsetX.sub(uPlayerDeltaXZ.x).add(halfTileSize), uTileSize).sub(halfTileSize),
        moved,
      );
      const wrappedZ = mix(
        offsetZ,
        mod(offsetZ.sub(uPlayerDeltaXZ.y).add(halfTileSize), uTileSize).sub(halfTileSize),
        moved,
      );

      const worldX = wrappedX.add(uPlayerPosition.x);
      const worldZ = wrappedZ.add(uPlayerPosition.z);
      const grassData = sampleGrassData(worldX, worldZ);
      const { heightNorm, yOffset } = grassData;

      const isVisible = buildVisibility(wrappedX, wrappedZ, yOffset, grassData.grassWeight);

      const currentScale = unpackCurrentScale(data.w, uBladeMinScale, scaleSpan);
      const originalScale = unpackOriginalScale(data.w, uBladeMinScale, scaleSpan);

      const worldPos = vec3(worldX, yOffset, worldZ);
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

      data.x = packOffsetX(wrappedX);
      data.y = packOffsetZ(wrappedZ);
      data.z = packHeightWord(heightNorm);
      data.w = packStateWord(isVisible, nextScale, originalScale, uBladeMinScale, scaleSpan);
    })().compute(instanceCount, [GRASS_CONFIG.WORKGROUP_SIZE]);
  }

  get packedBuffer() {
    return this.packed;
  }
}
