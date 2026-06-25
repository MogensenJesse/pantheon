// src/rendering/sunShadow/index.ts
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
  applyShadowFloorDisable,
  createSunShadowDebugTargets,
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
