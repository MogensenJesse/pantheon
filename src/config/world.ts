// src/config/world.ts — map scale, grid, biome height bands (shared play + editor)
import { Color } from 'three';

// Ground textures: Poly Haven 2K glTF packs under public/textures/terrain/{biome}/ — see terrainTextureManifest.ts.

export const WORLD = {
  SIZE: 800,
  SEGMENTS: 512,
  // Raised from 16 → 64 so sculpted mountains can reach dramatic heights.
  // All biome thresholds, snow, and player-speed normalise against this value
  // automatically (they use worldY / HEIGHT_SCALE) so no other tuning changes.
  HEIGHT_SCALE: 128,
  BIOMES: {
    WATER: { max: 0.08, color: new Color(0x1a3d7a) },
    SHORE: { max: 0.42 },
    FOREST: { max: 1.1 },
    /** Mountain / slope-rock splat starts above this band (no separate max). */
    HILLS: { max: 1.9 },
  },
} as const;
