// src/world/terrain/terrainTextureTypes.ts
import type { Texture } from 'three';
import type { TerrainBiomeAtlases } from './terrainMapAtlas';

/** ORM packed texture: R = roughness, G = AO, B = metalness. */
export interface TerrainBiomeMaps {
  color: Texture;
  normal: Texture;
  orm: Texture;
  spec: Texture;
  displacement: Texture;
}

export interface TerrainTextureSet {
  /** Color / normal / ORM / spec / detail displacement atlases (7 biomes in a 3×3 grid). */
  atlases: TerrainBiomeAtlases;
  /** Filtered vertex displacement atlas (alias of atlases.detailDisplacement). */
  detailDisplacement: Texture;
  /** True when at least one biome loaded a real displacement map. */
  hasDisplacementMaps: boolean;
  dispose: () => void;
}
