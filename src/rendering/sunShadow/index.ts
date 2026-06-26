// src/rendering/sunShadow/index.ts
export {
  configureSunShadowFilter,
} from './configureSunShadowFilter';
export type { SunShadowFilterMode } from '../../config/visualTuning';
export {
  normalizeSunShadowMapSize,
  readSunShadowMapSize,
  setSunShadowMapSize,
} from './setSunShadowMapSize';
export { snapSunShadowTargetToTexels, syncSunShadowCameraFromLight } from './snapSunShadowTarget';
export { createSunShadowNode, type SunShadowNode } from './createSunShadowNode';
export {
  GRASS_SHADOW_FLOOR_DEFAULT,
  PROP_SHADOW_FLOOR_DEFAULT,
  shadowFloorForProfile,
  TERRAIN_SHADOW_FLOOR_DEFAULT,
  WATER_SHADOW_FLOOR_DEFAULT,
  type SunShadowReceiverProfile,
} from './sunShadowProfiles';
export { syncSunShadowReceivers, type SunShadowReceiverSyncOpts } from './syncSunShadowReceivers';
export {
  applyShadowFloorDebugOverride,
  applyShadowFloorDisable,
  createSunShadowDebugTargets,
  restoreShadowFloorsToDefaults,
  setShadowFloor,
  type SunShadowDebugTargets,
  type SunShadowFloorUniform,
} from './sunShadowDebugTargets';
export {
  applySunShadowVisibility,
  computeEffectiveSunShadowFloor,
  computePropSunShadowMul,
  computeSunShadowWeight,
  computeSunVisFloor,
  computeTerrainSunVisFloor,
} from './sunShadowTsl';
