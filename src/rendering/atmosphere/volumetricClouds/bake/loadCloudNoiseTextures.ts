// src/rendering/atmosphere/volumetricClouds/bake/loadCloudNoiseTextures.ts — load shipped 3D Perlin-Worley atlas
import { Data3DTexture, LinearFilter, RepeatWrapping, RGBAFormat, UnsignedByteType } from 'three';
import { VISUAL } from '../../../../config/visualTuning';
import {
  bakePerlinWorleyVolume,
  CLOUD_PERLIN_WORLEY_SIZE,
  decodePerlinWorleyBin,
} from './perlinWorleyBake';

/** Vite-served path under `public/textures/environment/`. */
export const CLOUD_PERLIN_WORLEY_PATH = '/textures/environment/cloud-perlin-worley.bin';

export interface CloudNoiseTextures {
  perlinWorley: Data3DTexture;
  dispose: () => void;
}

function createData3DTextureFromRgba(
  data: Uint8Array,
  width: number,
  height: number,
  depth: number,
): Data3DTexture {
  const tex = new Data3DTexture(data, width, height, depth);
  tex.format = RGBAFormat;
  tex.type = UnsignedByteType;
  tex.minFilter = LinearFilter;
  tex.magFilter = LinearFilter;
  tex.wrapS = RepeatWrapping;
  tex.wrapT = RepeatWrapping;
  tex.wrapR = RepeatWrapping;
  tex.needsUpdate = true;
  return tex;
}

async function fetchPerlinWorleyBin(): Promise<ArrayBuffer> {
  const res = await fetch(CLOUD_PERLIN_WORLEY_PATH);
  if (!res.ok) {
    throw new Error(`Cloud noise fetch failed (${res.status}): ${CLOUD_PERLIN_WORLEY_PATH}`);
  }
  return res.arrayBuffer();
}

/**
 * Load pre-baked 3D Perlin-Worley noise. In DEV, falls back to a CPU bake when the asset is missing.
 */
export async function loadCloudNoiseTextures(): Promise<CloudNoiseTextures | null> {
  if (!VISUAL.sky.volumetricClouds.enabled) {
    return null;
  }

  let decoded: ReturnType<typeof decodePerlinWorleyBin>;
  try {
    decoded = decodePerlinWorleyBin(await fetchPerlinWorleyBin());
  } catch (err) {
    if (!import.meta.env.DEV) {
      throw err;
    }
    console.warn(
      '[volumetricClouds] cloud-perlin-worley.bin missing — DEV CPU bake (run scripts/bake-cloud-perlin-worley.mjs to ship)',
      err,
    );
    const data = bakePerlinWorleyVolume();
    decoded = {
      ...CLOUD_PERLIN_WORLEY_SIZE,
      data,
    };
  }

  const perlinWorley = createData3DTextureFromRgba(
    decoded.data,
    decoded.width,
    decoded.height,
    decoded.depth,
  );

  return {
    perlinWorley,
    dispose: () => {
      perlinWorley.dispose();
    },
  };
}
