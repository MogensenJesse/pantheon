// src/rendering/atmosphere/index.ts — day aerial + night valley fog barrel
export {
  getHazeCycleParams,
  type HazeCycleParams,
  type HazeTintParams,
  hazeStrengthForElevation,
  resetHazeCycleParams,
  sampleHazeTint,
  setHazeCycleParams,
} from './atmosphereCycle';
export {
  defaultValleyFogParams,
  getValleyFogAreaNode,
  getValleyFogNightAreaNode,
  getValleyFogParams,
  getValleyFogSkyVolumeNode,
  getValleyFogUniforms,
  initValleyFog,
  initValleyFogEditorAtmosphere,
  resetValleyFogParams,
  setValleyFogEditorPreview,
  setValleyFogFromSun,
  setValleyFogParams,
  syncValleyFogDebug,
  type ValleyFogParams,
  type ValleyFogUniforms,
} from './atmosphereSystem';
export {
  applySkyHorizonHaze,
  createValleyFogAreaNodes,
  heightSlabFogFactor,
  heightSlabPathLength,
  mixTowardFog,
  type ValleyFogAreaNodes,
  type ValleyFogGraphUniforms,
} from './atmosphereTsl';
