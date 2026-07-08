// @ts-nocheck — TSL node parameter typings incomplete in r185
// src/rendering/atmosphere/volumetricClouds/tsl/cloudDensityTsl.ts — 3D noise sample + height falloff (no march yet)
import type { Data3DTexture } from 'three';
import { Vector2 } from 'three';
import { abs, Fn, float, max, mix, smoothstep, texture3D, uniform, vec3 } from 'three/tsl';
import { CLOUD_PERLIN_WORLEY_SIZE } from '../bake/perlinWorleyBake';
import type { CloudTunables } from '../cloudTunables';
import { defaultCloudTunables } from '../cloudTunables';

/** GPU uniforms for density sampling — synced from cloud volume + tunables each frame (Phase 2+). */
export interface CloudDensityUniforms {
  uPerlinWorley: ReturnType<typeof texture3D>;
  uVolumeOriginXZ: ReturnType<typeof uniform>;
  uVolumeHalfExtent: ReturnType<typeof uniform>;
  uBaseHeight: ReturnType<typeof uniform>;
  uTopHeight: ReturnType<typeof uniform>;
  uDensity: ReturnType<typeof uniform>;
  uCoverage: ReturnType<typeof uniform>;
  uWindOffset: ReturnType<typeof uniform>;
}

const NOISE_UV_SCALE = vec3(
  1 / CLOUD_PERLIN_WORLEY_SIZE.width,
  1 / CLOUD_PERLIN_WORLEY_SIZE.height,
  1 / CLOUD_PERLIN_WORLEY_SIZE.depth,
);

export function createCloudDensityUniforms(perlinWorley: Data3DTexture): CloudDensityUniforms {
  const tunables = defaultCloudTunables();
  return {
    uPerlinWorley: texture3D(perlinWorley),
    uVolumeOriginXZ: uniform(new Vector2(0, 0)),
    uVolumeHalfExtent: uniform(tunables.volumeHalfExtentM),
    uBaseHeight: uniform(tunables.baseHeightM),
    uTopHeight: uniform(tunables.topHeightM),
    uDensity: uniform(tunables.density),
    uCoverage: uniform(tunables.coverage),
    uWindOffset: uniform(vec3(0, 0, 0)),
  };
}

/** Push CPU volume state + tunables into density uniforms (call each frame from Phase 2). */
export function syncCloudDensityUniforms(
  uniforms: CloudDensityUniforms,
  tunables: CloudTunables,
  originX: number,
  originZ: number,
  windOffset: { x: number; y: number; z: number },
): void {
  uniforms.uVolumeOriginXZ.value.set(originX, originZ);
  uniforms.uVolumeHalfExtent.value = tunables.volumeHalfExtentM;
  uniforms.uBaseHeight.value = tunables.baseHeightM;
  uniforms.uTopHeight.value = tunables.topHeightM;
  uniforms.uDensity.value = tunables.density;
  uniforms.uCoverage.value = tunables.coverage;
  uniforms.uWindOffset.value.set(windOffset.x, windOffset.y, windOffset.z);
}

/**
 * Sample cloud density at a world position — Perlin-Worley shape/detail + vertical envelope.
 * Returns scalar density (0 = empty). Used by march + shadow passes in later phases.
 */
export function createSampleCloudDensityFn(uniforms: CloudDensityUniforms) {
  const {
    uPerlinWorley,
    uVolumeOriginXZ,
    uVolumeHalfExtent,
    uBaseHeight,
    uTopHeight,
    uDensity,
    uCoverage,
    uWindOffset,
  } = uniforms;

  const sampleCloudDensity = Fn(([worldPos]) => {
    const samplePos = worldPos.add(uWindOffset);
    const noiseUv = samplePos.xzy.mul(NOISE_UV_SCALE);
    const noise = uPerlinWorley.sample(noiseUv);
    const shape = noise.x;
    const detail = noise.y;
    const shaped = mix(shape, detail, float(0.35));

    const y = worldPos.y;
    const edge = float(12);
    const bottom = smoothstep(uBaseHeight, uBaseHeight.add(edge), y);
    const top = smoothstep(uTopHeight, uTopHeight.sub(edge), y);
    const heightMask = bottom.mul(top);

    const localX = worldPos.x.sub(uVolumeOriginXZ.x);
    const localZ = worldPos.z.sub(uVolumeOriginXZ.y);
    const horiz = max(abs(localX), abs(localZ)).div(uVolumeHalfExtent);
    const horizMask = float(1).sub(smoothstep(float(0.85), float(1), horiz));

    const coverageRemap = mix(float(1).sub(uCoverage), float(1), shaped);
    return coverageRemap.mul(heightMask).mul(horizMask).mul(uDensity);
  });

  return sampleCloudDensity;
}
