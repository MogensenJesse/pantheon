// src/config/world.ts — map scale, grid, biome height bands (shared play + editor)
import { Color } from 'three';

// Ground textures: PBR sets under public/textures/terrain/{biome}/ — see terrainTextureManifest.ts.

export const WORLD = {
  SIZE: 2048,
  SEGMENTS: 2048,
  // 1.0 in the height grid = this many meters. EXR was 0.040–0.222;
  // treating that as a fraction of the 2048 m world gives ~373 m of relief.
  // Biome / snow / player-speed thresholds are normalised (worldY / HEIGHT_SCALE).
  HEIGHT_SCALE: 350,
  BIOMES: {
    /** Normalized Y of the water plane (world Y = max * HEIGHT_SCALE). 0.08 flooded the imported shelves. */
    WATER: { max: 0.04, color: new Color(0x1a3d7a) },
    SHORE: { max: 0.42 },
    FOREST: { max: 1.1 },
    /** Mountain / slope-rock splat starts above this band (no separate max). */
    HILLS: { max: 1.9 },
  },
} as const;
