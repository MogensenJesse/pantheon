// src/world/terrain/terrainMapAtlas.ts — pack biome maps into atlases (WebGPU sampler limit)
import {
  ClampToEdgeWrapping,
  DataTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  NoColorSpace,
  RedFormat,
  SRGBColorSpace,
  type Texture,
  UnsignedByteType,
} from 'three';
import type { WebGPURenderer } from 'three/webgpu';

/** 3×3 grid — slot order matches load order (shore…snow). */
export const TERRAIN_ATLAS_COLS = 3;
export const TERRAIN_ATLAS_ROWS = 3;
export const TERRAIN_ATLAS_SLOT_COUNT = TERRAIN_ATLAS_COLS * TERRAIN_ATLAS_ROWS;

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
  spec: DataTexture;
  /** R8 displacement — sampled in vertex shader at per-biome tile repeat. */
  detailDisplacement: DataTexture;
}

/** Shipped displacement tile size — pre-baked offline as *_disp_2k.* (Nyquist reference). */
export const DETAIL_DISP_TILE = 2048;

type ImageLike = { width: number; height: number; data?: Uint8ClampedArray | Uint8Array };
type AtlasKind = 'color' | 'normal' | 'orm' | 'spec' | 'disp';

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

function neutralFillStyle(kind: AtlasKind): string {
  switch (kind) {
    case 'color':
      return 'rgb(128, 128, 128)';
    case 'normal':
      return 'rgb(128, 128, 255)';
    case 'orm':
      return 'rgb(128, 255, 0)';
    case 'spec':
      return 'rgb(255, 255, 255)';
    case 'disp':
      return 'rgb(128, 128, 128)';
  }
}

function drawFloatLayer(
  ctx: CanvasRenderingContext2D,
  tex: Texture,
  destX: number,
  destY: number,
  tileW: number,
  tileH: number,
): void {
  const size = textureSize(tex);
  const dataTex = tex.image as ImageLike | undefined;
  const raw = dataTex?.data;
  if (!raw || raw.length === 0) return;

  const pixelCount = size.width * size.height;
  const channels = Math.max(1, Math.floor(raw.length / pixelCount));
  const imageData = ctx.createImageData(size.width, size.height);
  const out = imageData.data;

  for (let i = 0; i < pixelCount; i++) {
    const v = Math.max(0, Math.min(1, raw[i * channels] as number));
    const b = Math.round(v * 255);
    const p = i * 4;
    out[p] = b;
    out[p + 1] = b;
    out[p + 2] = b;
    out[p + 3] = 255;
  }

  const tmp = document.createElement('canvas');
  tmp.width = size.width;
  tmp.height = size.height;
  const tctx = tmp.getContext('2d');
  if (!tctx) return;
  tctx.putImageData(imageData, 0, 0);
  ctx.drawImage(tmp, destX, destY, tileW, tileH);
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
    if (dataTex.data instanceof Float32Array) {
      drawFloatLayer(ctx, tex, destX, destY, tileW, tileH);
      return;
    }

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

function fillNeutralSlot(
  ctx: CanvasRenderingContext2D,
  slotIndex: number,
  tileW: number,
  tileH: number,
  kind: AtlasKind,
): void {
  const col = slotIndex % TERRAIN_ATLAS_COLS;
  const row = Math.floor(slotIndex / TERRAIN_ATLAS_COLS);
  ctx.fillStyle = neutralFillStyle(kind);
  ctx.fillRect(col * tileW, row * tileH, tileW, tileH);
}

function configureAtlas(
  texture: DataTexture,
  colorSpace: typeof SRGBColorSpace | typeof NoColorSpace,
  kind: AtlasKind,
): void {
  texture.wrapS = ClampToEdgeWrapping;
  texture.wrapT = ClampToEdgeWrapping;
  texture.colorSpace = colorSpace;
  // Displacement is sampled in the vertex shader — skip mips to preserve crack detail.
  texture.generateMipmaps = kind !== 'disp';
  texture.minFilter = kind === 'disp' ? LinearFilter : LinearMipmapLinearFilter;
  texture.magFilter = LinearFilter;
  texture.needsUpdate = true;
}

function createFallbackDispAtlas(): DataTexture {
  const fallback = new DataTexture(new Uint8Array([128]), 1, 1, RedFormat, UnsignedByteType);
  configureAtlas(fallback, NoColorSpace, 'disp');
  return fallback;
}

/** Pack canvas RGBA draw buffer into single-channel R8 displacement atlas. */
function dispAtlasFromCanvas(ctx: CanvasRenderingContext2D, width: number, height: number): DataTexture {
  const rgba = ctx.getImageData(0, 0, width, height).data;
  const r8 = new Uint8Array(width * height);
  for (let i = 0; i < r8.length; i++) {
    r8[i] = rgba[i * 4];
  }
  const atlas = new DataTexture(r8, width, height, RedFormat, UnsignedByteType);
  configureAtlas(atlas, NoColorSpace, 'disp');
  return atlas;
}

function buildAtlas(layers: Texture[], kind: AtlasKind): DataTexture {
  const tileW = Math.max(1, ...layers.map((t) => textureSize(t).width));
  const tileH = Math.max(1, ...layers.map((t) => textureSize(t).height));
  const width = tileW * TERRAIN_ATLAS_COLS;
  const height = tileH * TERRAIN_ATLAS_ROWS;
  const colorSpace = kind === 'color' ? SRGBColorSpace : NoColorSpace;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    const fallback = new DataTexture(new Uint8Array([128, 128, 128, 255]), 1, 1);
    configureAtlas(fallback, colorSpace, kind);
    return fallback;
  }

  for (let i = 0; i < TERRAIN_ATLAS_SLOT_COUNT; i++) {
    if (i < layers.length) {
      const col = i % TERRAIN_ATLAS_COLS;
      const row = Math.floor(i / TERRAIN_ATLAS_COLS);
      drawLayer(ctx, layers[i], col * tileW, row * tileH, tileW, tileH);
    } else {
      fillNeutralSlot(ctx, i, tileW, tileH, kind);
    }
  }

  const imageData = ctx.getImageData(0, 0, width, height);
  const atlas = new DataTexture(imageData.data, width, height);
  configureAtlas(atlas, colorSpace, kind);
  return atlas;
}

/** Pack displacement layers into an R8 atlas at tileW×tileH per slot (1:1, no resize). */
function buildDisplacementAtlasR8(layers: Texture[], tileW: number, tileH: number): DataTexture {
  const width = tileW * TERRAIN_ATLAS_COLS;
  const height = tileH * TERRAIN_ATLAS_ROWS;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return createFallbackDispAtlas();
  }

  for (let i = 0; i < TERRAIN_ATLAS_SLOT_COUNT; i++) {
    if (i < layers.length) {
      const col = i % TERRAIN_ATLAS_COLS;
      const row = Math.floor(i / TERRAIN_ATLAS_COLS);
      drawLayer(ctx, layers[i], col * tileW, row * tileH, tileW, tileH);
    } else {
      fillNeutralSlot(ctx, i, tileW, tileH, 'disp');
    }
  }

  return dispAtlasFromCanvas(ctx, width, height);
}

/** Pack displacement at source resolution — no runtime downsample (use pre-baked *_disp_2k.*). */
function buildDetailDisplacementAtlas(layers: Texture[]): DataTexture {
  const tileW = Math.max(1, ...layers.map((t) => textureSize(t).width));
  const tileH = Math.max(1, ...layers.map((t) => textureSize(t).height));
  return buildDisplacementAtlasR8(layers, tileW, tileH);
}

/** Pack parallel color / normal / ORM / spec / displacement layers into atlases; disposes source map textures. */
export function buildTerrainBiomeAtlases(layers: {
  color: Texture[];
  normal: Texture[];
  orm: Texture[];
  spec: Texture[];
  displacement: Texture[];
}): TerrainBiomeAtlases {
  const atlases = {
    color: buildAtlas(layers.color, 'color'),
    normal: buildAtlas(layers.normal, 'normal'),
    orm: buildAtlas(layers.orm, 'orm'),
    spec: buildAtlas(layers.spec, 'spec'),
    detailDisplacement: buildDetailDisplacementAtlas(layers.displacement),
  };

  for (const list of [layers.color, layers.normal, layers.orm, layers.spec, layers.displacement]) {
    for (const tex of list) {
      tex.dispose();
    }
  }

  return atlases;
}

/** Upload mips and set anisotropy — call once after renderer.init(). */
export function initTerrainAtlases(
  renderer: WebGPURenderer,
  atlases: TerrainBiomeAtlases,
  anisotropy = 4,
): void {
  for (const tex of [
    atlases.color,
    atlases.normal,
    atlases.orm,
    atlases.spec,
    atlases.detailDisplacement,
  ]) {
    tex.anisotropy = anisotropy;
    renderer.initTexture(tex);
  }
}
