// src/world/terrain/atlas/bakedAtlasPaths.ts — play-mode pre-baked terrain atlases
/** Vite-served directory for offline-baked atlases (`npm run bake:terrain-atlases`). */
export const TERRAIN_BAKED_ATLAS_DIR = '/textures/terrain/atlases/';

export const TERRAIN_BAKED_ATLAS_FILES = {
  color: 'color.ktx2',
  normal: 'normal.ktx2',
  orm: 'orm.ktx2',
  spec: 'spec.ktx2',
  /** Raw R8 (1 byte/px) — kept uncompressed for CPU `sampleDispAtlasR8`. */
  detailDisplacement: 'detailDisplacement.r8',
} as const;

export function terrainBakedAtlasUrl(key: keyof typeof TERRAIN_BAKED_ATLAS_FILES): string {
  return `${TERRAIN_BAKED_ATLAS_DIR}${TERRAIN_BAKED_ATLAS_FILES[key]}`;
}
