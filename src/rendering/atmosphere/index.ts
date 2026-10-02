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
  bindValleyFogInlandMask,
  getValleyFogAreaNode,
  getValleyFogNightAreaNode,
  getValleyFogParams,
  getValleyFogSkyVolumeNode,
  getValleyFogUniforms,
  type HazeLookStop,
  initValleyFog,
  resetValleyFogParams,
  setValleyFogEditorPreview,
  setValleyFogFromSun,
  setValleyFogLookStop,
  setValleyFogParams,
  syncValleyFogDebug,
  type ValleyFogParams,
} from './atmosphereSystem';
export {
  applySkyHorizonHaze,
  createValleyFogAreaNodes,
  heightSlabFogFactor,
  heightSlabPathLength,
  mixTowardFog,
  type ValleyFogGraphUniforms,
} from './atmosphereTsl';
