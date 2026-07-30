// src/rendering/sunShadow/index.ts

export { copyBakedSunDirection } from './bakedSunDirection';
export {
  configureMeshShadowCast,
  getShadowCastMaterial,
  installShadowCastSceneHooks,
  normalizeMaterialTextureSlots,
  unregisterMeshShadowCast,
} from './casterMaterial';
export {
  createCloudCastShadowLight,
  createCloudCastShadowNode,
  disposeCloudCastShadow,
  getCloudCastShadowLight,
  invalidateCloudCastShadowMap,
  syncCloudCastShadowSettings,
  updateCloudCastShadowTarget,
  warmupCloudCastShadowMap,
} from './cloudCastShadow';
export { CLOUD_SHADOW_LAYER } from './cloudCastShadowLayer';
export {
  configureHardSunShadowFilter,
  configurePcssSunShadowFilter,
} from './configureSunShadowFilter';
export {
  type ContactShadowSoftness,
  contactShadowUniforms,
  readContactShadowSoftness,
  resetContactShadowSoftness,
  setContactShadowSoftness,
  syncSunShadowRadiusToContactMax,
} from './contactShadowUniforms';
export {
  createReceiverSunShadowNode,
  type ReceiverSunShadowNode,
} from './createReceiverSunShadowNode';
export { createSunShadowNode, type SunShadowNode } from './createSunShadowNode';
export {
  farCoverageUniforms,
  readFarCoverageRadiusTexels,
  resetFarCoverageRadiusTexels,
  setFarCoverageRadiusTexels,
} from './farCoverageUniforms';
export { invalidateSunShadowMap, updateSunShadowTarget, warmupSunShadowMap } from './followTarget';
export {
  createNearCascadeShadowLight,
  createNearCascadeShadowNode,
  disposeNearCascadeShadow,
  getNearCascadeShadowLight,
  invalidateNearCascadeShadowMap,
  updateNearCascadeShadowTarget,
  warmupNearCascadeShadowMap,
} from './nearCascadeShadow';
export {
  nearCascadeHandoffUniforms,
  syncNearCascadeHandoffFromLight,
} from './nearCascadeHandoffUniforms';
export { PcssShadowNode } from './pcssShadowNode';
export {
  grassSunReceiverUniforms,
  propSunReceiverUniforms,
  waterSunReceiverUniforms,
} from './receiverUniforms';
export {
  normalizeSunShadowMapSize,
  readSunShadowMapSize,
  setSunShadowMapSize,
} from './setSunShadowMapSize';
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
  computeTerrainSunVisFloor,
} from './sunShadowTsl';
export { type SunShadowReceiverSyncOpts, syncSunShadowReceivers } from './syncSunShadowReceivers';
