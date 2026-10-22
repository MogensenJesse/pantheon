// src/config/visual/life.ts — the world's ambient life: wind strength beyond the calm base, and (later) what drifts and lives in it
//
// Plain numbers, node-safe: `src/life/*` modules that checks run import it with the `.ts` extension.

export const life = {
  WIND: {
    /** Extra wind at full rain, as a multiplier added to 1 (a storm blows this much harder than calm). */
    STORM_GAIN: 0.9,
    /** Extra wind while rain is about to arrive (the gust before a front), added to 1 at full effect. */
    PRE_RAIN_GAIN: 0.6,
    /** How far ahead (game seconds) the gust before rain looks: the rain that is `LEAD_S` away blows it. */
    PRE_RAIN_LEAD_S: 75,
    /** Time constant (s) the wind boost takes to follow its target, so a front does not jerk the trees. */
    SMOOTH_S: 6,
  },
} as const;
