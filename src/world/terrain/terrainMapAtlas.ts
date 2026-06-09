// src/world/terrain/terrainMapAtlas.ts — pack biome maps into 3 atlases (WebGPU sampler limit)
import {
  DataTexture,
  NoColorSpace,
  RepeatWrapping,
  SRGBColorSpace,
  type Texture,
} from 'three';

/** 3×3 grid — slot order matches load order (shore…snow). */
export const TERRAIN_ATLAS_COLS = 3;
export const TERRAIN_ATLAS_ROWS = 3;

export const TERRAIN_ATLAS_BIOME_INDEX = {
  shore: 0,
  forest: 1,
  hills: 2,
  mountain: 3,
  path: 4,
  meadow: 5,
  snow: 6,
} as const;

export interface TerrainBiomeAtlases {
  color: DataTexture;
  normal: DataTexture;
  orm: DataTexture;
}

type ImageLike = { width: number; height: number; data?: Uint8ClampedArray | Uint8Array };

function textureSize(tex: Texture): { width: number; height: number } {
  const img = tex.image as ImageLike | HTMLImageElement | undefined;
  if (!img) return { width: 1, height: 1 };
  if (img instanceof HTMLImageElement) {
    return {
      width: img.naturalWidth || img.width || 1,
      height: img.naturalHeight || img.height || 1,
    };
  }
  return { width: img.width || 1, height: img.height || 1 };
}

function drawLayer(
  ctx: CanvasRenderingContext2D,
  tex: Texture,
  destX: number,
  destY: number,
  tileW: number,
  tileH: number,
): void {
  const img = tex.image;
  if (img instanceof HTMLImageElement) {
    ctx.drawImage(img, 0, 0, img.naturalWidth, img.naturalHeight, destX, destY, tileW, tileH);
    return;
  }

  const size = textureSize(tex);
  const dataTex = img as ImageLike | undefined;
  if (dataTex?.data) {
    const tmp = document.createElement('canvas');
    tmp.width = size.width;
    tmp.height = size.height;
    const tctx = tmp.getContext('2d');
    if (tctx) {
      const imageData = tctx.createImageData(size.width, size.height);
      imageData.data.set(dataTex.data);
      tctx.putImageData(imageData, 0, 0);
      ctx.drawImage(tmp, destX, destY, tileW, tileH);
    }
  }
}

function buildAtlas(layers: Texture[], colorSpace: typeof SRGBColorSpace | typeof NoColorSpace): DataTexture {
  const tileW = Math.max(1, ...layers.map((t) => textureSize(t).width));
  const tileH = Math.max(1, ...layers.map((t) => textureSize(t).height));
  const width = tileW * TERRAIN_ATLAS_COLS;
  const height = tileH * TERRAIN_ATLAS_ROWS;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    const fallback = new DataTexture(new Uint8Array([128, 128, 128, 255]), 1, 1);
    fallback.wrapS = RepeatWrapping;
    fallback.wrapT = RepeatWrapping;
    fallback.colorSpace = colorSpace;
    fallback.needsUpdate = true;
    return fallback;
  }

  for (let i = 0; i < layers.length; i++) {
    const col = i % TERRAIN_ATLAS_COLS;
    const row = Math.floor(i / TERRAIN_ATLAS_COLS);
    drawLayer(ctx, layers[i], col * tileW, row * tileH, tileW, tileH);
  }

  const imageData = ctx.getImageData(0, 0, width, height);
  const atlas = new DataTexture(imageData.data, width, height);
  atlas.wrapS = RepeatWrapping;
  atlas.wrapT = RepeatWrapping;
  atlas.colorSpace = colorSpace;
  atlas.needsUpdate = true;
  return atlas;
}

/** Pack parallel color / normal / ORM layers into three atlases; disposes source map textures. */
export function buildTerrainBiomeAtlases(layers: {
  color: Texture[];
  normal: Texture[];
  orm: Texture[];
}): TerrainBiomeAtlases {
  const atlases = {
    color: buildAtlas(layers.color, SRGBColorSpace),
    normal: buildAtlas(layers.normal, NoColorSpace),
    orm: buildAtlas(layers.orm, NoColorSpace),
  };

  for (const list of [layers.color, layers.normal, layers.orm]) {
    for (const tex of list) {
      tex.dispose();
    }
  }

  return atlases;
}
