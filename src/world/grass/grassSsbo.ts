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
import { GRASS_CONFIG, grassInstanceCount } from './grassConfig';
import {
  packOffsetX,
  packOffsetZ,
  packStateWord,
  packWindWord,
  unpackCurrentScale,
  unpackOffsetX,
  unpackOffsetZ,
  unpackOriginalScale,
  unpackWindXZ,
} from './grassSsboPack';
import { grassUniforms } from './grassUniforms';

export class GrassSsbo {
  private readonly packed;

  readonly computeInit: ComputeNode;
  readonly computeUpdate: ComputeNode;
  readonly instanceCount: number;

  constructor(
    biomeMap: DataTexture,
    pathMap: DataTexture,
    heightMap: DataTexture,
    instanceCount = grassInstanceCount(),
    windAtlas: Texture | null = null,
  ) {
    this.instanceCount = instanceCount;
    // uvec4 = 16-byte stride (WGSL); uvec3 would pad to 16 B anyway but CPU wrote 12 B / instance.
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
      uForestDensity,
      uHillsDensity,
      uShoreDensity,
      uTrailRadiusSquared,
      uTrailGrowthRate,
      uTrailMinScale,
      uKDown,
      uWindDirection,
      uWindStrength,
      uTime,
      uWindSpeed,
    } = grassUniforms;

    const halfTile = uTileSize.mul(0.5);
    const scaleSpan = uBladeMaxScale.sub(uBladeMinScale);
    const bladesPerSide = uBladesPerSide;
    const spacing = uTileSize.div(uBladesPerSide);
    const biomeTex = texture(biomeMap);
    const pathTex = texture(pathMap);
    const heightTex = texture(heightMap);
    const windTex = windAtlas ? texture(windAtlas) : null;

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
      data.z = packWindWord(float(0), float(0));
      data.w = packStateWord(float(1), randomScale, randomScale, uBladeMinScale, scaleSpan);
    })().compute(instanceCount, [GRASS_CONFIG.WORKGROUP_SIZE]);

    this.computeUpdate = Fn(() => {
      const data = this.packed.element(instanceIndex);
      const halfTileSize = uTileSize.mul(0.5);

      const offsetX = unpackOffsetX(data.x);
      const offsetZ = unpackOffsetZ(data.y);

      const wrappedX = mod(
        offsetX.sub(uPlayerDeltaXZ.x).add(halfTileSize),
        uTileSize,
      ).sub(halfTileSize);
      const wrappedZ = mod(
        offsetZ.sub(uPlayerDeltaXZ.y).add(halfTileSize),
        uTileSize,
      ).sub(halfTileSize);

      const worldX = wrappedX.add(uPlayerPosition.x);
      const worldZ = wrappedZ.add(uPlayerPosition.z);
      const mapUv = worldXZToMapUv(worldX, worldZ, uWorldSize);
      const yOffset = heightTex.sample(mapUv).r.mul(uHeightScale);

      const worldPos = vec3(worldX, yOffset, worldZ);

      const dx = wrappedX;
      const dz = wrappedZ;
      const distSq = dx.mul(dx).add(dz.mul(dz));
      const R0Sq = uR0.mul(uR0);
      const R1Sq = uR1.mul(uR1);
      const tThin = distSq.sub(R0Sq).div(max(R1Sq.sub(R0Sq), EPSILON)).clamp();
      const pKeep = mix(float(1), uPMin, tThin);
      const rnd = hash(float(instanceIndex).mul(0.73));
      const thinFade = float(0.07);
      const stochasticKeep = smoothstep(rnd.sub(thinFade), rnd.add(thinFade), pKeep);

      const biome = biomeTex.sample(mapUv);
      const grassWeight = biome.x
        .mul(uForestDensity)
        .add(biome.y.mul(uHillsDensity))
        .add(biome.z.mul(uShoreDensity));
      const onGrassBiome = step(uBiomeGrassThreshold, grassWeight);
      const pathMask = pathTex.sample(mapUv).r;
      const offPath = step(pathMask, float(0.5));
      const allowed = onGrassBiome.mul(offPath);

      const clip = uCameraMatrix.mul(vec4(worldPos, 1));
      const inFront = step(EPSILON, clip.w);

      const isVisible = inFront.mul(stochasticKeep).mul(allowed);

      const currentScale = unpackCurrentScale(data.w, uBladeMinScale, scaleSpan);
      const originalScale = unpackOriginalScale(data.w, uBladeMinScale, scaleSpan);

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

      const uvBase = worldPos.xz.mul(0.01);
      const scroll = uWindDirection.mul(uTime.mul(uWindSpeed));
      let windFactor;
      if (windTex) {
        const uvA = uvBase.add(scroll);
        const uvB = uvBase.mul(1.37).add(scroll.mul(1.11));
        const nA = windTex.sample(uvA).mul(2).sub(1);
        const nB = windTex.sample(uvB).mul(2).sub(1);
        const mixRand = hash(float(instanceIndex).mul(12.9898)).mul(78.233).fract();
        const w = mixRand.clamp(0.2, 0.8);
        const n = mix(nA, nB, w);
        windFactor = n.r.mul(uWindStrength).add(n.g.mul(uWindStrength).mul(0.35));
      } else {
        const windUv = uvBase.add(scroll);
        const nA = hash(windUv.x.mul(17).add(windUv.y.mul(31))).mul(2).sub(1);
        windFactor = nA.mul(uWindStrength);
      }
      const target = uWindDirection.mul(windFactor);
      const prevWind = unpackWindXZ(data.z);
      const newWind = prevWind.add(target.sub(prevWind).mul(0.15));

      data.x = packOffsetX(wrappedX);
      data.y = packOffsetZ(wrappedZ);
      data.z = packWindWord(newWind.x, newWind.y);
      data.w = packStateWord(isVisible, nextScale, originalScale, uBladeMinScale, scaleSpan);
    })().compute(instanceCount, [GRASS_CONFIG.WORKGROUP_SIZE]);
  }

  get packedBuffer() {
    return this.packed;
  }
}
