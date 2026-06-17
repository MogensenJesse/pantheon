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
  createBiomeSplatMaterial,
  createTerrainSplatMaterial,
  type TerrainSplatMaterial,
  type TerrainSplatUniforms,
} from './material/createBiomeSplatMaterial';
export {
  disposeTerrainSplatMaterial,
  syncTerrainSplatLighting,
} from './material/syncTerrainSplatLighting';
export {
  formatTerrainLodVertexStatsHtml,
  type TerrainLodVertexStats,
} from './lod/terrainLodStats';
export {
  createTerrainLodBoundsDebug,
  type TerrainLodBoundsDebug,
} from './lod/terrainLodDebug';
