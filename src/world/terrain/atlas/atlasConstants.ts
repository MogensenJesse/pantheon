// src/world/terrain/atlas/atlasConstants.ts — shared atlas grid + tile sizing
import type { Texture } from 'three';

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

/** Fragment atlases (color / normal / ORM / spec) — Poly Haven 2K glTF packs. */
export const TERRAIN_ATLAS_SURF_TILE_PX = 2048;

/** Vertex displacement atlas — native 1K disp maps (separate canvas from surface atlases). */
export const TERRAIN_ATLAS_DISP_TILE_PX = 1024;

/** Nyquist reference for dev disp logging (matches disp atlas inner tile). */
export const DETAIL_DISP_TILE = TERRAIN_ATLAS_DISP_TILE_PX;

/** Per-slot gutter pixels — edge texels duplicated so color mips do not bleed neighbor biomes. */
export const TERRAIN_ATLAS_GUTTER_PX = 8;

/** Gutter UV inset for surface atlases (fragment splat). */
export const TERRAIN_ATLAS_TILE_PX = TERRAIN_ATLAS_SURF_TILE_PX;

type ImageLike = { width: number; height: number; data?: Uint8ClampedArray | Uint8Array };

/** Pixel size of a loaded map before atlas pack (HTMLImage or DataTexture). */
export function readTexturePixelSize(tex: Texture): { width: number; height: number } {
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
