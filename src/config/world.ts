// src/config/world.ts — map scale, grid, biome height bands (shared play + editor)
import { Color } from 'three';

// Ground textures: Poly Haven 2K glTF packs under public/textures/terrain/{biome}/ — see terrainTextureManifest.ts.

/** Fallback spawn when a map has no `playerStart` entity (legacy procedural route point). */
const DEFAULT_PLAYER_START_XZ: readonly [number, number] = [-15.751, -39.403];

export const WORLD = {
  SEED: 'aethon-world-1',
  SIZE: 800,
  SEGMENTS: 512,
  // Raised from 16 → 64 so sculpted mountains can reach dramatic heights.
  // All biome thresholds, snow, and player-speed normalise against this value
  // automatically (they use worldY / HEIGHT_SCALE) so no other tuning changes.
  HEIGHT_SCALE: 128,
  BIOMES: {
    WATER: { max: 0.08, color: new Color(0x1a3d7a) },
    SHORE: { max: 0.42, color: new Color(0x8a9a5b) },
    FOREST: { max: 1.1, color: new Color(0x2d7020) },
    HILLS: { max: 1.9, color: new Color(0x8c6c35) },
    MOUNTAIN: { max: Infinity, color: new Color(0xa09080) },
  },

  PLAYER_START: { xz: DEFAULT_PLAYER_START_XZ },
} as const;
