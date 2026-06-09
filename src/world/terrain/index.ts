// src/world/terrain/index.ts

export { applyTerrainDevUniforms, resetTerrainDevSettings } from './applyTerrainDevUniforms';
export { loadTerrainTextures, initTerrainAtlases, type TerrainTextureSet } from './loadTerrainTextures';
export {
  createTerrainSplatMaterial,
  disposeTerrainSplatMaterial,
  syncTerrainSplatLighting,
  type TerrainSplatMaterial,
  type TerrainSplatUniforms,
} from './TerrainSplatMaterial';
