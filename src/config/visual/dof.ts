// src/config/visual/dof.ts — depth of field

export const dof = {
  ENABLED: true,
  FOCUS_DISTANCE_OFFSET: 3,
  FOCAL_LENGTH: 75,
  /** Bokeh at 0% energy. */
  BOKEH_SCALE_START: 8,
  /** Bokeh at 100% energy (0 = off in daytime). */
  BOKEH_SCALE_END: 0,
  FOCUS_SMOOTH: 10,
} as const;
