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
  /** Chimney smoke follows the wind: the drift speed at calm (m of drift per unit wind) and how slowly the plume turns. */
  SMOKE: {
    /** Strength of the smoke's wind at calm: the old fixed drift vector's length, so the calm look is unchanged. */
    WIND_MUL: 0.873,
    /** Time constant (s) the plume takes to turn with a change of wind (a puff's place is a pure function of its age). */
    WIND_SMOOTH_S: 4,
  },
  /** Wheat rolls in waves along the wind and lies down in rain (blades in a wheat field only). */
  WHEAT: {
    /** How strongly the wave modulates the wind's lean (0 = none); the wave itself runs -0.5..0.5. */
    WAVE_GAIN: 1.1,
    /** A breeze that rolls through the wheat even in a lull, in wind units (the grass's wind is about 0.27). */
    WAVE_BASE: 0.07,
    WAVE_LENGTH_M: 12,
    WAVE_PERIOD_S: 3.2,
    /** Extra downwind lean at full wetness (a rain-soaked field lies down), in wind units. */
    LODGE_LEAN: 0.35,
  },
  /** Plants react to the orb whatever the phase: grass rustles around it, flowers brighten and sway. */
  ORB_PLANTS: {
    RUSTLE_RADIUS_M: 5,
    /** Lean (m, like the wind's bend) of a full-height blade at the orb, and the rustle's rate (rad/s). */
    RUSTLE_STRENGTH: 0.25,
    RUSTLE_RATE: 7,
    FLOWER_RADIUS_M: 6,
    /** Extra brightness of a flower at the orb (1 = twice as bright) and extra sway (same unit). */
    FLOWER_GLOW_GAIN: 0.8,
    FLOWER_SWAY_GAIN: 2,
  },
} as const;
