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
  createTerrainLodMesh,
  createLodCenterGeometry,
  createLodRingGeometry,
  createLodRingSkirtGeometry,
  snapLodOrigin,
  terrainLodConfigFromVisual,
  type TerrainLodConfig,
  type TerrainLodMesh,
  type TerrainLodRingSpec,
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
