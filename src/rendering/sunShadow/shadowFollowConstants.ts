// src/rendering/sunShadow/shadowFollowConstants.ts — shared shadow cascade extents
/** Far sun-shadow ortho half-extent (m). Span = 2 × this. */
export const SUN_SHADOW_FAR_FOLLOW_HALF_M = 200;

/** Far plane (m) of the far, near and cloud shadow cameras; keeps tall peaks inside the frustum. */
export const SHADOW_CAMERA_FAR_M = 900;
