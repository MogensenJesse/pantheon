// src/world/terrain/atlas/terrainMapAtlas.ts — pack biome maps into atlases (WebGPU sampler limit)
import {
  ClampToEdgeWrapping,
  DataTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  NearestFilter,
  NoColorSpace,
  RedFormat,
  SRGBColorSpace,
  type Texture,
  UnsignedByteType,
} from 'three';
import type { WebGPURenderer } from 'three/webgpu';
import { TerrainPackLoadError } from '../loaders/terrainLoadErrors';
import { isTerrainSharedNeutralTexture } from '../loaders/terrainNeutralTextures';
import {
  readTexturePixelSize,
  TERRAIN_ATLAS_COLS,
  TERRAIN_ATLAS_DISP_TILE_PX,
  TERRAIN_ATLAS_GUTTER_PX,
  TERRAIN_ATLAS_ROWS,
  TERRAIN_ATLAS_SLOT_COUNT,
  TERRAIN_ATLAS_SURF_TILE_PX,
} from './atlasConstants';

export interface TerrainBiomeAtlases {
  color: DataTexture;
  normal: DataTexture;
  orm: DataTexture;
  spec: DataTexture;
  /** R8 displacement — sampled in vertex shader at per-biome tile repeat. */
  detailDisplacement: DataTexture;
}

type ImageLike = { width: number; height: number; data?: Uint8ClampedArray | Uint8Array };
type AtlasKind = 'color' | 'normal' | 'orm' | 'spec' | 'disp';

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
      return 'rgb(0, 0, 0)';
  }
}

function atlasCellSize(
  tileW: number,
  tileH: number,
  gutter: number,
): { cellW: number; cellH: number } {
  return { cellW: tileW + gutter * 2, cellH: tileH + gutter * 2 };
}

function slotOrigin(
  slotIndex: number,
  tileW: number,
  tileH: number,
  gutter: number,
): { destX: number; destY: number } {
  const col = slotIndex % TERRAIN_ATLAS_COLS;
  const row = Math.floor(slotIndex / TERRAIN_ATLAS_COLS);
  const { cellW, cellH } = atlasCellSize(tileW, tileH, gutter);
  return {
    destX: col * cellW + gutter,
    destY: row * cellH + gutter,
  };
}

/** Extrude 1px edge strips into gutter so mip chains stay inside the biome slot. */
function sealAtlasGutter(
  ctx: CanvasRenderingContext2D,
  destX: number,
  destY: number,
  tileW: number,
  tileH: number,
  gutter: number,
): void {
  if (gutter <= 0 || tileW < 1 || tileH < 1) return;

  const top = ctx.getImageData(destX, destY, tileW, 1);
  const bottom = ctx.getImageData(destX, destY + tileH - 1, tileW, 1);
  const left = ctx.getImageData(destX, destY, 1, tileH);
  const right = ctx.getImageData(destX + tileW - 1, destY, 1, tileH);
  const tl = ctx.getImageData(destX, destY, 1, 1);
  const tr = ctx.getImageData(destX + tileW - 1, destY, 1, 1);
  const bl = ctx.getImageData(destX, destY + tileH - 1, 1, 1);
  const br = ctx.getImageData(destX + tileW - 1, destY + tileH - 1, 1, 1);

  for (let i = 1; i <= gutter; i++) {
    ctx.putImageData(top, destX, destY - i);
    ctx.putImageData(bottom, destX, destY + tileH - 1 + i);
    ctx.putImageData(left, destX - i, destY);
    ctx.putImageData(right, destX + tileW - 1 + i, destY);
    ctx.putImageData(tl, destX - i, destY - i);
    ctx.putImageData(tr, destX + tileW - 1 + i, destY - i);
    ctx.putImageData(bl, destX - i, destY + tileH - 1 + i);
    ctx.putImageData(br, destX + tileW - 1 + i, destY + tileH - 1 + i);
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
  const size = readTexturePixelSize(tex);
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

  const size = readTexturePixelSize(tex);
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
  gutter: number,
  kind: AtlasKind,
): void {
  const { destX, destY } = slotOrigin(slotIndex, tileW, tileH, gutter);
  ctx.fillStyle = neutralFillStyle(kind);
  ctx.fillRect(destX, destY, tileW, tileH);
  sealAtlasGutter(ctx, destX, destY, tileW, tileH, gutter);
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
  // Nearest on disp — linear bleeds white stone into black gap texels at vertex samples.
  texture.minFilter = kind === 'disp' ? NearestFilter : LinearMipmapLinearFilter;
  texture.magFilter = kind === 'disp' ? NearestFilter : LinearFilter;
  texture.needsUpdate = true;
}

function createFallbackDispAtlas(): DataTexture {
  const fallback = new DataTexture(new Uint8Array([0]), 1, 1, RedFormat, UnsignedByteType);
  configureAtlas(fallback, NoColorSpace, 'disp');
  return fallback;
}

/** Pack canvas RGBA draw buffer into single-channel R8 displacement atlas. */
function dispAtlasFromCanvas(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
): DataTexture {
  const rgba = ctx.getImageData(0, 0, width, height).data;
  const r8 = new Uint8Array(width * height);
  for (let i = 0; i < r8.length; i++) {
    r8[i] = rgba[i * 4];
  }
  const atlas = new DataTexture(r8, width, height, RedFormat, UnsignedByteType);
  configureAtlas(atlas, NoColorSpace, 'disp');
  return atlas;
}

function resolveUnifiedAtlasTileSize(layers: Texture[][]): { tileW: number; tileH: number } {
  const flat = layers.flat();
  return {
    tileW: Math.max(1, ...flat.map((t) => readTexturePixelSize(t).width)),
    tileH: Math.max(1, ...flat.map((t) => readTexturePixelSize(t).height)),
  };
}

function packAtlasSlot(
  ctx: CanvasRenderingContext2D,
  layer: Texture | undefined,
  slotIndex: number,
  tileW: number,
  tileH: number,
  gutter: number,
  kind: AtlasKind,
): void {
  if (layer) {
    const { destX, destY } = slotOrigin(slotIndex, tileW, tileH, gutter);
    drawLayer(ctx, layer, destX, destY, tileW, tileH);
    sealAtlasGutter(ctx, destX, destY, tileW, tileH, gutter);
  } else {
    fillNeutralSlot(ctx, slotIndex, tileW, tileH, gutter, kind);
  }
}

function buildAtlas(
  layers: Texture[],
  kind: AtlasKind,
  tileW: number,
  tileH: number,
  gutter: number,
): DataTexture {
  const { cellW, cellH } = atlasCellSize(tileW, tileH, gutter);
  const width = cellW * TERRAIN_ATLAS_COLS;
  const height = cellH * TERRAIN_ATLAS_ROWS;
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
    packAtlasSlot(ctx, i < layers.length ? layers[i] : undefined, i, tileW, tileH, gutter, kind);
  }

  const imageData = ctx.getImageData(0, 0, width, height);
  const atlas = new DataTexture(imageData.data, width, height);
  configureAtlas(atlas, colorSpace, kind);
  return atlas;
}

/** Pack displacement layers into an R8 atlas at tileW×tileH per slot (1:1, no resize). */
function buildDisplacementAtlasR8(
  layers: Texture[],
  tileW: number,
  tileH: number,
  gutter: number,
): DataTexture {
  const { cellW, cellH } = atlasCellSize(tileW, tileH, gutter);
  const width = cellW * TERRAIN_ATLAS_COLS;
  const height = cellH * TERRAIN_ATLAS_ROWS;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return createFallbackDispAtlas();
  }

  for (let i = 0; i < TERRAIN_ATLAS_SLOT_COUNT; i++) {
    packAtlasSlot(ctx, i < layers.length ? layers[i] : undefined, i, tileW, tileH, gutter, 'disp');
  }

  return dispAtlasFromCanvas(ctx, width, height);
}

export interface TerrainAtlasBuildOptions {
  /** Build normal/orm/spec/disp atlases from neutral fills only (editor color-only load). */
  nonColorNeutralOnly?: boolean;
}

/** 1×1 neutral stub tiles — editor color-only path skips loading real normal/ORM/spec/disp maps. */
const EDITOR_NEUTRAL_TILE_PX = 1;
const EDITOR_NEUTRAL_GUTTER_PX = 0;

/**
 * Pack parallel biome layers into GPU atlases.
 * Consumes and disposes per-biome source textures (canvas-copied); skips shared neutral singletons.
 */
export function buildTerrainBiomeAtlases(
  layers: {
    color: Texture[];
    normal: Texture[];
    orm: Texture[];
    spec: Texture[];
    displacement: Texture[];
  },
  options: TerrainAtlasBuildOptions = {},
): TerrainBiomeAtlases {
  const { nonColorNeutralOnly = false } = options;
  const surfTile = resolveUnifiedAtlasTileSize(
    nonColorNeutralOnly ? [layers.color] : [layers.color, layers.normal, layers.orm, layers.spec],
  );
  const surfW = surfTile.tileW;
  const surfH = surfTile.tileH;
  if (surfW !== TERRAIN_ATLAS_SURF_TILE_PX || surfH !== TERRAIN_ATLAS_SURF_TILE_PX) {
    throw new TerrainPackLoadError(
      `Terrain surface atlas tile size ${surfW}x${surfH} does not match shader contract ${TERRAIN_ATLAS_SURF_TILE_PX}x${TERRAIN_ATLAS_SURF_TILE_PX}`,
    );
  }
  const dispW = TERRAIN_ATLAS_DISP_TILE_PX;
  const dispH = TERRAIN_ATLAS_DISP_TILE_PX;
  const gutter = TERRAIN_ATLAS_GUTTER_PX;

  const emptyLayers: Texture[] = [];
  const stubTile = EDITOR_NEUTRAL_TILE_PX;
  const stubGutter = EDITOR_NEUTRAL_GUTTER_PX;
  const ncSurfW = nonColorNeutralOnly ? stubTile : surfW;
  const ncSurfH = nonColorNeutralOnly ? stubTile : surfH;
  const ncGutter = nonColorNeutralOnly ? stubGutter : gutter;

  const atlases = {
    color: buildAtlas(layers.color, 'color', surfW, surfH, gutter),
    normal: buildAtlas(
      nonColorNeutralOnly ? emptyLayers : layers.normal,
      'normal',
      ncSurfW,
      ncSurfH,
      ncGutter,
    ),
    orm: buildAtlas(
      nonColorNeutralOnly ? emptyLayers : layers.orm,
      'orm',
      ncSurfW,
      ncSurfH,
      ncGutter,
    ),
    spec: buildAtlas(
      nonColorNeutralOnly ? emptyLayers : layers.spec,
      'spec',
      ncSurfW,
      ncSurfH,
      ncGutter,
    ),
    detailDisplacement: buildDisplacementAtlasR8(
      nonColorNeutralOnly ? emptyLayers : layers.displacement,
      nonColorNeutralOnly ? stubTile : dispW,
      nonColorNeutralOnly ? stubTile : dispH,
      ncGutter,
    ),
  };

  const disposeLists = nonColorNeutralOnly
    ? [layers.color]
    : [layers.color, layers.normal, layers.orm, layers.spec, layers.displacement];
  for (const list of disposeLists) {
    for (const tex of list) {
      if (!isTerrainSharedNeutralTexture(tex)) {
        tex.dispose();
      }
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
