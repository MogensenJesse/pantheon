// src/world/grass/grassSsbo.ts — GPU compute for grass instance state
import type { DataTexture } from 'three';
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
import { GRASS_CONFIG, grassInstanceCount, grassTileHalfSize, grassTileSpacing } from './grassConfig';
import { grassUniforms } from './grassUniforms';

export class GrassSsbo {
  private readonly buffer1 = instancedArray(grassInstanceCount(), 'vec4');
  private readonly buffer2 = instancedArray(grassInstanceCount(), 'vec4');

  readonly computeInit: ComputeNode;
  readonly computeUpdate: ComputeNode;

  constructor(biomeMap: DataTexture, pathMap: DataTexture, heightMap: DataTexture) {
    const {
      uWorldSize,
      uHeightScale,
      uBladeMinScale,
      uBladeMaxScale,
      uTileSize,
      uPlayerDeltaXZ,
      uPlayerPosition,
      uR0,
      uR1,
      uPMin,
      uCameraMatrix,
      uFx,
      uFy,
      uCullPadNdcX,
      uCullPadNdcYNear,
      uCullPadNdcYFar,
      uBiomeGrassThreshold,
      uTrailRadiusSquared,
      uTrailGrowthRate,
      uTrailMinScale,
      uKDown,
      uWindDirection,
      uWindStrength,
      uTime,
      uWindSpeed,
    } = grassUniforms;

    const bladesPerSide = float(GRASS_CONFIG.BLADES_PER_SIDE);
    const spacing = float(grassTileSpacing());
    const halfTile = float(grassTileHalfSize());
    const biomeTex = texture(biomeMap);
    const pathTex = texture(pathMap);
    const heightTex = texture(heightMap);

    this.computeInit = Fn(() => {
      const data1 = this.buffer1.element(instanceIndex);
      const data2 = this.buffer2.element(instanceIndex);

      const row = floor(float(instanceIndex).div(bladesPerSide));
      const col = float(instanceIndex).mod(bladesPerSide);
      const randX = hash(instanceIndex.add(4321));
      const randZ = hash(instanceIndex.add(1234));
      const offsetX = col.mul(spacing).sub(halfTile).add(randX.mul(spacing.mul(0.5)));
      const offsetZ = row.mul(spacing).sub(halfTile).add(randZ.mul(spacing.mul(0.5)));

      data1.x = offsetX;
      data1.y = offsetZ;
      data1.z = float(0);
      data1.w = float(0);

      const n = hash(instanceIndex.add(77));
      const shaped = n.mul(n);
      const randomScale = mix(uBladeMinScale, uBladeMaxScale, shaped);
      data2.x = float(0);
      data2.y = randomScale;
      data2.z = float(1);
      data2.w = randomScale;
    })().compute(grassInstanceCount(), [GRASS_CONFIG.WORKGROUP_SIZE]);

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

      const worldPos = vec3(wrappedX, float(0), wrappedZ).add(uPlayerPosition);

      const dx = worldPos.x.sub(uPlayerPosition.x);
      const dz = worldPos.z.sub(uPlayerPosition.z);
      const distSq = dx.mul(dx).add(dz.mul(dz));
      const R0Sq = uR0.mul(uR0);
      const R1Sq = uR1.mul(uR1);
      const tThin = distSq.sub(R0Sq).div(max(R1Sq.sub(R0Sq), EPSILON)).clamp();
      const pKeep = mix(float(1), uPMin, tThin);
      const rnd = hash(float(instanceIndex).mul(0.73));
      const stochasticKeep = step(rnd, pKeep);

      const one = float(1);
      const clip = uCameraMatrix.mul(vec4(worldPos, 1));
      const invW = one.div(clip.w);
      const ndc = clip.xyz.mul(invW);
      const eyeDepthAbs = clip.w.abs().max(EPSILON);
      const r = float(GRASS_CONFIG.BLADE_BOUNDING_SPHERE_RADIUS);
      const rNdcX = uFx.mul(r).div(eyeDepthAbs).add(uCullPadNdcX);
      const rNdcY = uFy.mul(r).div(eyeDepthAbs);
      const rNdcYNear = rNdcY.add(uCullPadNdcYNear);
      const rNdcYFar = rNdcY.sub(uCullPadNdcYFar);
      const frustumVis = step(one.negate().sub(rNdcX), ndc.x)
        .mul(step(ndc.x, one.add(rNdcX)))
        .mul(step(one.negate().sub(rNdcYNear), ndc.y))
        .mul(step(ndc.y.add(rNdcYFar), one))
        .mul(step(-1, ndc.z))
        .mul(step(ndc.z, 1));

      const mapUv = vec2(worldPos.x, worldPos.z).div(uWorldSize).add(0.5);
      const biome = biomeTex.sample(mapUv);
      const grassWeight = biome.x.add(biome.y).add(biome.z);
      const onGrassBiome = step(uBiomeGrassThreshold, grassWeight);
      const pathMask = pathTex.sample(mapUv).r;
      const offPath = step(pathMask, float(0.5));
      const allowed = onGrassBiome.mul(offPath);

      const isVisible = frustumVis.mul(stochasticKeep).mul(allowed);

      const yOffset = heightTex.sample(mapUv).r.mul(uHeightScale);
      data2.x = yOffset;

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

      const windUv = worldPos.xz.mul(0.02).add(uWindDirection.mul(uTime.mul(uWindSpeed)));
      const nA = hash(windUv.x.mul(17).add(windUv.y.mul(31))).mul(2).sub(1);
      const windFactor = nA.mul(uWindStrength);
      const target = uWindDirection.mul(windFactor);
      const prevWind = vec2(data1.z, data1.w);
      const newWind = prevWind.add(target.sub(prevWind).mul(0.15));
      data1.z = newWind.x;
      data1.w = newWind.y;

      data2.z = isVisible;
    })().compute(grassInstanceCount(), [GRASS_CONFIG.WORKGROUP_SIZE]);
  }

  get bufferA() {
    return this.buffer1;
  }

  get bufferB() {
    return this.buffer2;
  }
}
