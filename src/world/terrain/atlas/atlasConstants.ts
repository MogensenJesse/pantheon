// src/world/terrain/atlas/atlasConstants.ts — shared atlas grid + tile sizing (also read by the bake script)

/** 3×3 grid — one slot per biome folder, in bake order (shore…water). */
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
  rock: 7,
  /** Seabed / painted Water biome (loose PBR under `assets-src/terrain/water/`). */
  water: 8,
} as const;

export type TerrainAtlasBiomeKey = keyof typeof TERRAIN_ATLAS_BIOME_INDEX;

/** Atlas slot order (0…8) — derived from `TERRAIN_ATLAS_BIOME_INDEX`, not object key order. */
export const TERRAIN_ATLAS_BIOME_KEYS: readonly TerrainAtlasBiomeKey[] = (
  Object.entries(TERRAIN_ATLAS_BIOME_INDEX) as [TerrainAtlasBiomeKey, number][]
)
  .sort((a, b) => a[1] - b[1])
  .map(([key]) => key);

/** Fragment atlases (color + AO) — one tile per biome folder. */
export const TERRAIN_ATLAS_SURF_TILE_PX = 2048;

/**
 * Per-slot gutter pixels — edge texels duplicated into the pad.
 * Play KTX2 mips are generated from the whole atlas (`toktx --genmipmap`), so this only
 * protects the lowest few mips; the splat shader insets tile UV by the filter footprint
 * so coarse samples stay off the slot edge (do not clamp LOD — that kills mips).
 */
export const TERRAIN_ATLAS_GUTTER_PX = 8;

export function terrainAtlasCellPx(
  tilePx = TERRAIN_ATLAS_SURF_TILE_PX,
  gutterPx = TERRAIN_ATLAS_GUTTER_PX,
): number {
  return tilePx + gutterPx * 2;
}

export function terrainAtlasSizePx(
  tilePx = TERRAIN_ATLAS_SURF_TILE_PX,
  gutterPx = TERRAIN_ATLAS_GUTTER_PX,
): number {
  return terrainAtlasCellPx(tilePx, gutterPx) * TERRAIN_ATLAS_COLS;
}
