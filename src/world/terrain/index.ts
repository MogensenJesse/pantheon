// src/world/terrain/index.ts
export {
  createTerrainSplatMaterial,
  syncTerrainSplatLighting,
  disposeTerrainSplatMaterial,
  type TerrainSplatMaterial,
  type TerrainSplatUniforms,
} from './TerrainSplatMaterial';
export { applyTerrainDevUniforms, resetTerrainDevSettings } from './applyTerrainDevUniforms';
export { loadTerrainTextures, type TerrainTextureSet } from './loadTerrainTextures';
