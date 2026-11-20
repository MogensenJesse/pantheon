// src/world/snow/snowMaps.ts — the baked snow as two textures over the whole map
//
//   hull  R32F    hull Y (m); read with integer loads in the vertex stage (float32 is not filterable)
//   snow  RGBA16F hull slope x, hull slope z, snow depth (m), 0; filtered, read by the vertex and the fragment stage
//
// Texel (i, j) is centred at `(i + 0.5) * texelM - size * texelM / 2` (see cpu/snowBake.ts), so u = (x + half) / worldM.
import {
  DataTexture,
  DataUtils,
  FloatType,
  HalfFloatType,
  LinearFilter,
  NearestFilter,
  RedFormat,
  RGBAFormat,
} from 'three';
import type { SnowBake } from './cpu/snowBake';

export interface SnowMaps {
  readonly hull: DataTexture;
  readonly snow: DataTexture;
  readonly size: number;
  readonly texelM: number;
  /** Overwrite both textures with a (re)bake of the same size. */
  update: (bake: SnowBake) => void;
  dispose: () => void;
}

export function createSnowMaps(size: number, texelM: number): SnowMaps {
  const n = size * size;
  const hull = new DataTexture(new Float32Array(n), size, size, RedFormat, FloatType);
  hull.name = 'SnowHull';
  hull.minFilter = NearestFilter;
  hull.magFilter = NearestFilter;
  hull.generateMipmaps = false;
  hull.flipY = false;
  const snowData = new Uint16Array(4 * n);
  const snow = new DataTexture(snowData, size, size, RGBAFormat, HalfFloatType);
  snow.name = 'SnowMap';
  snow.minFilter = LinearFilter;
  snow.magFilter = LinearFilter;
  snow.generateMipmaps = false;
  snow.flipY = false;
  return {
    hull,
    snow,
    size,
    texelM,
    update: (bake) => {
      (hull.image.data as Float32Array).set(bake.hull);
      for (let k = 0; k < n; k++) {
        const d = bake.depth[k];
        snowData[4 * k] = d > 0 ? DataUtils.toHalfFloat(bake.slope[2 * k]) : 0;
        snowData[4 * k + 1] = d > 0 ? DataUtils.toHalfFloat(bake.slope[2 * k + 1]) : 0;
        snowData[4 * k + 2] = d > 0 ? DataUtils.toHalfFloat(d) : 0;
      }
      hull.needsUpdate = true;
      snow.needsUpdate = true;
    },
    dispose: () => {
      hull.dispose();
      snow.dispose();
    },
  };
}
