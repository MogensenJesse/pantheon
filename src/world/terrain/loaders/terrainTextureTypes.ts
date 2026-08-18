// src/world/terrain/loaders/terrainTextureTypes.ts
import type { Texture } from 'three';
import type { TerrainBiomeAtlases } from '../atlas/terrainMapAtlas';

/** ORM packed texture: R = roughness, G = AO, B = metalness. */
export interface TerrainBiomeMaps {
  color: Texture;
  normal: Texture;
  orm: Texture;
  spec: Texture;
  displacement: Texture;
}

export interface TerrainTextureSet {
  /** Color / normal / ORM / spec / detail displacement atlases — null in solid-color play. */
  atlases: TerrainBiomeAtlases | null;
  /** Filtered vertex displacement atlas (alias of atlases.detailDisplacement). */
  detailDisplacement: Texture | null;
  /** True when at least one biome loaded a real displacement map. */
  hasDisplacementMaps: boolean;
  dispose: () => void;
}
