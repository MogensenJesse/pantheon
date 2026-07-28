// src/world/terrain/index.ts

export {
  initTerrainAtlases,
  loadTerrainTextures,
  type TerrainTextureSet,
} from './loaders/loadTerrainTextures';
export {
  createTerrainLodBoundsDebug,
  type TerrainLodBoundsDebug,
} from './lod/terrainLodDebug';
export {
  formatTerrainLodVertexStatsHtml,
  type TerrainLodVertexStats,
} from './lod/terrainLodStats';
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
