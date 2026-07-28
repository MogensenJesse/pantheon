// src/config/visual/dof.ts — depth of field

export const dof = {
  ENABLED: true,
  /** Added to auto focus distance (camera → player, world units). */
  FOCUS_DISTANCE_OFFSET: 3,
  FOCAL_LENGTH: 75,
  /** Bokeh at 0% energy (night / start) → 100% energy (full reveal). */
  BOKEH_SCALE_START: 8,
  /** Bokeh at 100% energy (mild DoF stays on). */
  BOKEH_SCALE_END: 2,
  /** Exponential smooth for focus distance (higher = snappier). */
  FOCUS_SMOOTH: 10,
} as const;
