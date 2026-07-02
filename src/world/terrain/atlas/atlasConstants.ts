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

export type TerrainAtlasBiomeKey = keyof typeof TERRAIN_ATLAS_BIOME_INDEX;

/** Atlas slot order (0…6) — derived from `TERRAIN_ATLAS_BIOME_INDEX`, not object key order. */
export const TERRAIN_ATLAS_BIOME_KEYS: readonly TerrainAtlasBiomeKey[] = (
  Object.entries(TERRAIN_ATLAS_BIOME_INDEX) as [TerrainAtlasBiomeKey, number][]
)
  .sort((a, b) => a[1] - b[1])
  .map(([key]) => key);

/** Fragment atlases (color / normal / ORM / spec) — Poly Haven 2K glTF packs. */
export const TERRAIN_ATLAS_SURF_TILE_PX = 2048;

/** Vertex displacement atlas — native 1K disp maps (separate canvas from surface atlases). */
export const TERRAIN_ATLAS_DISP_TILE_PX = 1024;

/** Per-slot gutter pixels — edge texels duplicated so color mips do not bleed neighbor biomes. */
export const TERRAIN_ATLAS_GUTTER_PX = 8;

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
