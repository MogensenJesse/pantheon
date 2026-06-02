// @ts-nocheck — TSL node parameter typings incomplete in r184
// src/world/grass/grassSsbo.ts — GPU compute for grass instance state (bit-packed uvec4)
import type { DataTexture, Texture } from 'three';
import type { ComputeNode } from 'three/webgpu';
import {
  EPSILON,
  Fn,
  float,
  floor,
  hash,
  instancedArray,
  instanceIndex,
  max,
  mix,
  mod,
  smoothstep,
  step,
  texture,
  vec2,
  vec3,
  vec4,
} from 'three/tsl';
import { worldXZToMapUv } from '../../map/mapUvTsl';
import { GRASS_MOVE_EPS_SQ } from './grassComputeSchedule';
import { GRASS_CONFIG, grassInstanceCount } from './grassConfig';
import {
  packOffsetX,
  packOffsetZ,
  packStateWord,
  packHeightWord,
  packVisibilityOnly,
  unpackCurrentScale,
  unpackOffsetX,
  unpackOffsetZ,
  unpackOriginalScale,
} from './grassSsboPack';
import { grassFrustumVisibility } from './grassFrustumVisibilityTsl';
import { grassUniforms } from './grassUniforms';

export class GrassSsbo {
  private readonly packed;

  readonly computeInit: ComputeNode;
  readonly computeUpdate: ComputeNode;
  readonly computeVisibility: ComputeNode;
  readonly instanceCount: number;

  constructor(
    grassDataMap: DataTexture,
    instanceCount = grassInstanceCount(),
    windAtlas: Texture | null = null,
  ) {
    this.instanceCount = instanceCount;
    this.packed = instancedArray(instanceCount, 'uvec4');

    const {
      uWorldSize,
      uHeightScale,
      uBladeMinScale,
      uBladeMaxScale,
      uTileSize,
      uBladesPerSide,
      uPlayerDeltaXZ,
      uPlayerPosition,
      uR0,
      uR1,
      uPMin,
      uCameraMatrix,
      uBiomeGrassThreshold,
      uTrailRadiusSquared,
      uTrailGrowthRate,
      uTrailMinScale,
      uKDown,
    } = grassUniforms;

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
      let offsetX = col.mul(spacing).sub(halfTile).add(randX.mul(spacing.mul(0.5)));
      let offsetZ = row.mul(spacing).sub(halfTile).add(randZ.mul(spacing.mul(0.5)));

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

    const buildVisibility = (offsetX, offsetZ, yOffset, grassWeight, offPath) => {
      const worldX = offsetX.add(uPlayerPosition.x);
      const worldZ = offsetZ.add(uPlayerPosition.z);
      const worldPos = vec3(worldX, yOffset, worldZ);

      const dx = offsetX;
      const dz = offsetZ;
      const distSq = dx.mul(dx).add(dz.mul(dz));
      const R0Sq = uR0.mul(uR0);
      const R1Sq = uR1.mul(uR1);
      const tThin = distSq.sub(R0Sq).div(max(R1Sq.sub(R0Sq), EPSILON)).clamp();
      const pKeep = mix(float(1), uPMin, tThin);
      const rnd = hash(float(instanceIndex).mul(0.73));
      const thinFade = float(0.07);
      const stochasticKeep = smoothstep(rnd.sub(thinFade), rnd.add(thinFade), pKeep);

      const onGrassBiome = step(uBiomeGrassThreshold, grassWeight);
      const allowed = onGrassBiome.mul(offPath);

      const frustumVis = grassFrustumVisibility(worldPos);

      return frustumVis.mul(stochasticKeep).mul(allowed);
    };

    const sampleGrassData = (worldX, worldZ) => {
      const mapUv = worldXZToMapUv(worldX, worldZ, uWorldSize);
      const data = grassDataTex.sample(mapUv);
      const heightNorm = data.r;
      const grassWeight = data.g;
      const offPath = step(float(0.5), data.b);
      const yOffset = heightNorm.mul(uHeightScale);
      return { heightNorm, grassWeight, offPath, yOffset };
    };

    this.computeVisibility = Fn(() => {
      const data = this.packed.element(instanceIndex);
      const offsetX = unpackOffsetX(data.x);
      const offsetZ = unpackOffsetZ(data.y);
      const worldX = offsetX.add(uPlayerPosition.x);
      const worldZ = offsetZ.add(uPlayerPosition.z);
      const grassData = sampleGrassData(worldX, worldZ);
      const isVisible = buildVisibility(
        offsetX,
        offsetZ,
        grassData.yOffset,
        grassData.grassWeight,
        grassData.offPath,
      );
      data.w = packVisibilityOnly(data.w, isVisible);
    })().compute(instanceCount, [GRASS_CONFIG.WORKGROUP_SIZE]);

    this.computeUpdate = Fn(() => {
      const data = this.packed.element(instanceIndex);
      const halfTileSize = uTileSize.mul(0.5);

      const offsetX = unpackOffsetX(data.x);
      const offsetZ = unpackOffsetZ(data.y);

      const deltaSq = uPlayerDeltaXZ.x.mul(uPlayerDeltaXZ.x).add(uPlayerDeltaXZ.y.mul(uPlayerDeltaXZ.y));
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

      const isVisible = buildVisibility(
        wrappedX,
        wrappedZ,
        yOffset,
        grassData.grassWeight,
        grassData.offPath,
      );

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
      const contact = float(1).sub(smoothstep(inner, outer, distSqPlayer)).mul(isPlayerGrounded);

      const up = currentScale.add(originalScale.sub(currentScale).mul(uTrailGrowthRate));
      const down = currentScale.add(uTrailMinScale.sub(currentScale).mul(uKDown));
      const nextScale = mix(up, down, contact);

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
