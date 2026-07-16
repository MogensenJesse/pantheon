// src/rendering/sunShadow/index.ts

export type { SunShadowFilterMode } from '../../config/visualTuning';
export {
  configureMeshShadowCast,
  getShadowCastMaterial,
  installShadowCastSceneHooks,
  normalizeMaterialTextureSlots,
  unregisterMeshShadowCast,
} from './casterMaterial';
export { configureSunShadowFilter } from './configureSunShadowFilter';
export { createSunShadowNode, type SunShadowNode } from './createSunShadowNode';
export { updateSunShadowTarget, warmupSunShadowMap } from './followTarget';
export {
  normalizeSunShadowMapSize,
  readSunShadowMapSize,
  setSunShadowMapSize,
} from './setSunShadowMapSize';
export { snapSunShadowTargetToTexels, syncSunShadowCameraFromLight } from './snapSunShadowTarget';
export {
  applyShadowFloorDebugOverride,
  restoreShadowFloorsToDefaults,
  type SunShadowDebugTargets,
  type SunShadowFloorUniform,
  setShadowFloor,
} from './sunShadowDebugTargets';
export {
  GRASS_SHADOW_FLOOR_DEFAULT,
  PROP_SHADOW_FLOOR_DEFAULT,
  type SunShadowReceiverProfile,
  shadowFloorForProfile,
  TERRAIN_SHADOW_FLOOR_DEFAULT,
  WATER_SHADOW_FLOOR_DEFAULT,
} from './sunShadowProfiles';
export {
  applySunShadowVisibility,
  computeEffectiveSunShadowFloor,
  computePropSunShadowMul,
  computeSunShadowWeight,
  computeSunVisFloor,
  computeTerrainSunVisFloor,
} from './sunShadowTsl';
export { type SunShadowReceiverSyncOpts, syncSunShadowReceivers } from './syncSunShadowReceivers';
