// src/world/terrain/terrainDisplacement.ts — load and normalize biome displacement maps
import { DataTexture, DataUtils, RepeatWrapping, type Texture, TextureLoader } from 'three';
import { EXRLoader } from 'three/addons/loaders/EXRLoader.js';
import type { TerrainGltfFolder } from '../config/terrainTextureManifest';
import { TerrainPackLoadError } from './terrainLoadErrors';
import { configureDataTexture } from './terrainTextureConfigure';

type DisplacementPixelData = Uint8Array | Uint8ClampedArray | Uint16Array | Float32Array;

function readDisplacementHeight(
  data: DisplacementPixelData,
  pixelIndex: number,
  channels: number,
): number {
  const i = pixelIndex * channels;
  if (data instanceof Float32Array) return data[i] ?? 0;
  if (data instanceof Uint16Array) return DataUtils.fromHalfFloat(data[i] ?? 0);
  return (data[i] ?? 128) / 255;
}

/** Decode EXR/JPG/PNG displacement, re-center around 0.5 neutral, emit RGBA8 DataTexture. */
export function normalizeDisplacementTexture(source: Texture): DataTexture {
  const img = source.image as
    | HTMLImageElement
    | { width?: number; height?: number; data?: DisplacementPixelData }
    | undefined;

  let width = 1;
  let height = 1;
  let heights: Float32Array;
  let isFloatSource = false;

  if (img instanceof HTMLImageElement) {
    width = img.naturalWidth || img.width || 1;
    height = img.naturalHeight || img.height || 1;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      source.dispose();
      throw new TerrainPackLoadError('Displacement normalize failed: 2d canvas unavailable');
    }
    ctx.drawImage(img, 0, 0, width, height);
    const rgba = ctx.getImageData(0, 0, width, height).data;
    const pixelCount = width * height;
    heights = new Float32Array(pixelCount);
    for (let i = 0; i < pixelCount; i++) {
      heights[i] = rgba[i * 4] / 255;
    }
  } else if (img?.data && img.width && img.height) {
    width = img.width;
    height = img.height;
    const pixelCount = width * height;
    const channels = Math.max(1, Math.floor(img.data.length / pixelCount));
    isFloatSource = img.data instanceof Float32Array || img.data instanceof Uint16Array;
    heights = new Float32Array(pixelCount);
    for (let i = 0; i < pixelCount; i++) {
      heights[i] = readDisplacementHeight(img.data, i, channels);
    }
  } else {
    source.dispose();
    throw new TerrainPackLoadError('Displacement normalize failed: unreadable image data');
  }

  let sum = 0;
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < heights.length; i++) {
    const h = Math.max(0, Math.min(1, heights[i]));
    heights[i] = h;
    sum += h;
    min = Math.min(min, h);
    max = Math.max(max, h);
  }
  const mean = sum / heights.length;
  const range = max - min;
  const isJpegSource = img instanceof HTMLImageElement;

  const out = new Uint8Array(width * height * 4);
  for (let i = 0; i < heights.length; i++) {
    let centered: number;
    if (isFloatSource) {
      centered = heights[i];
      if (Math.abs(mean - 0.5) > 0.02) {
        centered = heights[i] - mean + 0.5;
      }
    } else if (isJpegSource && range >= 0.05) {
      centered = heights[i];
    } else if (range < 0.05) {
      const stretched = (heights[i] - min) / Math.max(range, 1e-6);
      centered = stretched - (mean - min) / Math.max(range, 1e-6) + 0.5;
    } else {
      centered = heights[i];
      if (Math.abs(mean - 0.5) > 0.02) {
        centered = heights[i] - mean + 0.5;
      }
    }
    const b = Math.round(Math.max(0, Math.min(1, centered)) * 255);
    const p = i * 4;
    out[p] = b;
    out[p + 1] = b;
    out[p + 2] = b;
    out[p + 3] = 255;
  }

  source.dispose();
  const normalized = new DataTexture(out, width, height);
  configureDataTexture(normalized);
  return normalized;
}

/** HEAD probe — skip full texture decode on missing displacement files. */
export async function probeDisplacementUrl(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: 'HEAD' });
    if (res.ok) return true;
    // Some static hosts reject HEAD; allow GET attempt for that URL only.
    if (res.status === 405) return true;
    return false;
  } catch {
    return false;
  }
}

export async function loadDisplacementTexture(
  folder: TerrainGltfFolder,
  url: string,
): Promise<Texture> {
  try {
    const ext = url.split('.').pop()?.toLowerCase() ?? '';
    let texture: Texture;
    if (ext === 'exr') {
      const loader = new EXRLoader();
      texture = await loader.loadAsync(url);
    } else {
      const loader = new TextureLoader();
      texture = await loader.loadAsync(url);
    }
    texture.wrapS = RepeatWrapping;
    texture.wrapT = RepeatWrapping;
    configureDataTexture(texture);
    return texture;
  } catch (cause) {
    throw new TerrainPackLoadError(`Terrain displacement load failed (${folder}): ${url}`, {
      cause,
    });
  }
}
