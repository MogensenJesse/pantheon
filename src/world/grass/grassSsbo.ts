// src/world/grass/grassSsbo.ts — GPU compute for grass instance state
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
import { grassUniforms } from './grassUniforms';

export class GrassSsbo {
  private readonly buffer1;
  private readonly buffer2;

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
    this.buffer1 = instancedArray(instanceCount, 'vec4');
    this.buffer2 = instancedArray(instanceCount, 'vec4');
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

    const bladesPerSide = uBladesPerSide;
    const halfTile = uTileSize.mul(0.5);
    const spacing = uTileSize.div(uBladesPerSide);
    const biomeTex = texture(biomeMap);
    const pathTex = texture(pathMap);
    const heightTex = texture(heightMap);
    const windTex = windAtlas ? texture(windAtlas) : null;

    this.computeInit = Fn(() => {
      const data1 = this.buffer1.element(instanceIndex);
      const data2 = this.buffer2.element(instanceIndex);

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

      data1.x = offsetX;
      data1.y = offsetZ;
      data1.z = float(0);
      data1.w = float(0);

      const shaped = scaleNoise.mul(scaleNoise);
      const randomScale = mix(uBladeMinScale, uBladeMaxScale, shaped);
      data2.x = float(0);
      data2.y = randomScale;
      data2.z = float(1);
      data2.w = randomScale;
    })().compute(instanceCount, [GRASS_CONFIG.WORKGROUP_SIZE]);

    this.computeUpdate = Fn(() => {
      const data1 = this.buffer1.element(instanceIndex);
      const data2 = this.buffer2.element(instanceIndex);

      const halfTileSize = uTileSize.mul(0.5);
      const wrappedX = mod(
        data1.x.sub(uPlayerDeltaXZ.x).add(halfTileSize),
        uTileSize,
      ).sub(halfTileSize);
      const wrappedZ = mod(
        data1.y.sub(uPlayerDeltaXZ.y).add(halfTileSize),
        uTileSize,
      ).sub(halfTileSize);
      data1.x = wrappedX;
      data1.y = wrappedZ;

      const worldX = wrappedX.add(uPlayerPosition.x);
      const worldZ = wrappedZ.add(uPlayerPosition.z);
      const mapUv = worldXZToMapUv(worldX, worldZ, uWorldSize);
      const yOffset = heightTex.sample(mapUv).r.mul(uHeightScale);
      data2.x = yOffset;

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

      const currentScale = data2.y;
      const originalScale = data2.w;

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
      data2.y = mix(up, down, contact);

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
      const prevWind = vec2(data1.z, data1.w);
      const newWind = prevWind.add(target.sub(prevWind).mul(0.15));
      data1.z = newWind.x;
      data1.w = newWind.y;

      data2.z = isVisible;
    })().compute(instanceCount, [GRASS_CONFIG.WORKGROUP_SIZE]);
  }

  get bufferA() {
    return this.buffer1;
  }

  get bufferB() {
    return this.buffer2;
  }
}
