// src/rendering/sunShadow/index.ts

export type { SunShadowFilterMode } from '../../config/visualTuning';
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
  isCloudCastShadowActive,
  syncCloudCastShadowSettings,
  updateCloudCastShadowTarget,
  warmupCloudCastShadowMap,
} from './cloudCastShadow';
export { CLOUD_SHADOW_LAYER } from './cloudCastShadowLayer';
export { CloudCastSoftShadowFilter } from './cloudCastSoftShadowFilter';
export { CoverageShadowFilter } from './coverageShadowFilter';
export { configureSunShadowFilter } from './configureSunShadowFilter';
export {
  type ContactShadowSoftness,
  contactShadowUniforms,
  FORCE_MAX_SHADOW_SOFTNESS,
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
export { invalidateSunShadowMap, updateSunShadowTarget, warmupSunShadowMap } from './followTarget';
export {
  createNearCascadeShadowLight,
  createNearCascadeShadowNode,
  disposeNearCascadeShadow,
  getNearCascadeShadowLight,
  invalidateNearCascadeShadowMap,
  isNearCascadeShadowActive,
  updateNearCascadeShadowTarget,
  warmupNearCascadeShadowMap,
} from './nearCascadeShadow';
export { PcssShadowFilter } from './pcssShadowFilter';
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
  SUN_SHADOW_ANGLE_EPS_DEG,
  SUN_SHADOW_FAR_FOLLOW_HALF_M,
  SUN_SHADOW_FOLLOW_POSITION_EPS_M,
  SUN_SHADOW_LIGHT_DISTANCE_EPS_M,
} from './shadowFollowConstants';
export { finalizeShadowLightPose, stabilizeLightViewShadow } from './stabilizeLightViewShadow';
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
export { WidePCFShadowFilter } from './widePcfShadowFilter';
