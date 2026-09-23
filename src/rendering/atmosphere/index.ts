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
  defaultValleyFogParams,
  getValleyFogAreaNode,
  getValleyFogParams,
  getValleyFogSkyVolumeNode,
  getValleyFogUniforms,
  type HazeLookStop,
  type HazeLookStops,
  initValleyFog,
  initValleyFogEditorAtmosphere,
  resetValleyFogParams,
  setValleyFogEditorPreview,
  setValleyFogFromSun,
  setValleyFogLookStop,
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
