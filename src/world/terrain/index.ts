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
  type BiomeSplatMaterialOptions,
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
  buildTerrainLodVertexStats,
  formatTerrainLodVertexStats,
  formatTerrainLodVertexStatsHtml,
  legacyTerrainMeshVertexCount,
  type TerrainLodVertexStats,
} from './lod/terrainLodStats';
export {
  configureGpuDisplacedTerrainMesh,
  createTerrainLodMesh,
  createLodCenterGeometry,
  createTerrainMacroBaseGeometry,
  snapLodOrigin,
  terrainLodConfigFromVisual,
  type TerrainLodConfig,
  type TerrainLodMesh,
} from './lod/terrainLodRings';
export {
  clearDevLodOverride,
  readDevLodOverride,
  resolvePlayLodEnabled,
  TERRAIN_LOD_DEV_STORAGE_KEY,
  writeDevLodOverride,
} from './lod/resolvePlayLodEnabled';
export {
  createTerrainLodBoundsDebug,
  type TerrainLodBoundsDebug,
} from './lod/terrainLodDebug';
