// src/rendering/sunShadow/shadowFollowConstants.ts — shared shadow cascade extents
/** Far sun-shadow ortho half-extent (m). Span = 2 × this. */
export const SUN_SHADOW_FAR_FOLLOW_HALF_M = 200;

/** Far plane (m) of the far and near shadow cameras; keeps tall peaks inside the frustum. */
export const SHADOW_CAMERA_FAR_M = 900;

/**
 * Enabled on the sun, near and world shadow cameras so they keep their own layer mask (layer 0).
 * Three's ShadowNode.updateShadow copies the main camera's mask onto any shadow camera whose mask is
 * only layer 0, and the main camera also sees CLOUD_SHADOW_LAYER, so clouds would be drawn into these
 * maps. No object uses this layer.
 */
export const SHADOW_CAMERA_EXPLICIT_LAYER = 31;

/**
 * Cloud-cast light distance (m) from its focus. The sun peaks at 35°, so a ±500 m light-view
 * window reaches kilometres sunward at low sun; casters in front of the near plane drop out.
 */
export const CLOUD_CAST_LIGHT_DISTANCE_M = 2000;

/** Far plane (m) of the cloud-cast camera; must exceed twice {@link CLOUD_CAST_LIGHT_DISTANCE_M}. */
export const CLOUD_CAST_CAMERA_FAR_M = 4200;
