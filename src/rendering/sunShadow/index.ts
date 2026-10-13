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
  disposeCloudCastShadow,
  getCloudCastBakeCount,
  invalidateCloudCastShadowMap,
  updateCloudCastShadowTarget,
  warmupCloudCastShadowMap,
} from './cloudCastShadow';
export { CLOUD_SHADOW_LAYER } from './cloudCastShadowLayer';
export { readContactShadowSoftness, setContactShadowSoftness } from './contactShadowUniforms';
export {
  createFarOnlySunShadowNode,
  createReceiverSunShadowNode,
  farShadowEdgeWeight,
  type ReceiverSunShadowNode,
} from './createReceiverSunShadowNode';
export {
  createFarSunShadowNode,
  invalidateFarSunShadowMap,
  updateFarSunShadowTarget,
  warmupFarSunShadowMap,
} from './farSunShadow';
export {
  configureFarSunShadowFilter,
  readFarCoverageRadiusTexels,
  setFarCoverageRadiusTexels,
} from './farSunShadowFilter';
export { setFragmentTextureBudget } from './fragmentTextureBudget';
export {
  createNearCascadeShadowLight,
  disposeNearCascadeShadow,
  getNearCascadeShadowLight,
  invalidateNearCascadeShadowMap,
  setNearCascadeMapSize,
  updateNearCascadeShadowTarget,
  warmupNearCascadeShadowMap,
} from './nearCascadeShadow';
export { SHADOW_CAMERA_EXPLICIT_LAYER, SHADOW_CAMERA_FAR_M } from './shadowFollowConstants';
export {
  applyShadowFloorDebugOverride,
  restoreShadowFloorsToDefaults,
  type SunShadowDebugTargets,
  setShadowFloor,
} from './sunShadowDebugTargets';
export { type SunShadowReceiverProfile, TERRAIN_SHADOW_FLOOR_DEFAULT } from './sunShadowProfiles';
export {
  applySunShadowVisibility,
  computeEffectiveSunShadowFloor,
  computePropSunShadowMul,
  computeTerrainSunVisFloor,
} from './sunShadowTsl';
export { syncSunShadowReceivers } from './syncSunShadowReceivers';
export {
  createWorldCascadeShadowLight,
  disposeWorldCascadeShadow,
  getWorldCascadeBakeCount,
  getWorldCascadeDefaults,
  getWorldCascadeShadowLight,
  getWorldCascadeTune,
  getWorldShadowView,
  invalidateWorldCascadeShadowMap,
  isWorldCascadeFrozen,
  resetWorldCascadeTune,
  resolveWorldCascadeVisibility,
  setWorldCascadeFrozen,
  setWorldCascadeTune,
  setWorldShadowView,
  updateWorldCascadeShadow,
  uWorldFoliageAlphaTest,
  type WorldCascadeTune,
  type WorldShadowView,
  warmupWorldCascadeShadowMap,
  worldShadowTexelM,
} from './worldCascadeShadow';
export { bindWorldShadowVisibilityHeight } from './worldShadowVisibility';
