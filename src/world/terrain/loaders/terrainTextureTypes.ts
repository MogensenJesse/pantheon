// src/world/terrain/loaders/terrainTextureTypes.ts
import type { TerrainBiomeAtlases } from '../atlas/terrainMapAtlas';

export interface TerrainTextureSet {
  /** Color + AO atlases (8 biome slots in a 3×3 grid). AO in `.r`. */
  atlases: TerrainBiomeAtlases;
  dispose: () => void;
}
