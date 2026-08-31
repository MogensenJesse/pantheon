// src/world/terrain/index.ts

export {
  initTerrainAtlases,
  loadTerrainTextures,
  type TerrainTextureSet,
} from './loaders/loadTerrainTextures';
export {
  applyTerrainDevUniforms,
  resetTerrainDevSettings,
} from './material/applyTerrainDevUniforms';
export {
  createTerrainSplatMaterial,
  type TerrainSplatMaterial,
  type TerrainSplatUniforms,
} from './material/createTerrainSplatMaterial';
export {
  disposeTerrainSplatMaterial,
  syncTerrainSplatLighting,
} from './material/syncTerrainSplatLighting';
