// src/rendering/sunShadow/shadowFollowConstants.ts — shared follow / dirty epsilons
/** Far / cloud-cast ortho half-extent (m). Span = 2 × this. */
export const SUN_SHADOW_FAR_FOLLOW_HALF_M = 200;

/** Ignore only floating-point noise; visible sun motion remains continuous. */
export const SUN_SHADOW_ANGLE_EPS_DEG = 1e-6;
export const SUN_SHADOW_FOLLOW_POSITION_EPS_M = 1e-5;
export const SUN_SHADOW_LIGHT_DISTANCE_EPS_M = 1e-3;
