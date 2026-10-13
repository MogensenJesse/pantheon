// src/config/visual/village.ts — how the village looks and what it costs to draw (gameplay tunables stay in config/village.ts)
import { VILLAGE } from '../village.ts';

/** Instance slots per building kind: the building cap plus a little headroom. */
const BUILDING_SLOTS = VILLAGE.PLAN.MAX_BUILDINGS + 4;

export const village = {
  /** Instance capacity per kit key (one InstancedMesh per LOD each). */
  CAPACITY: {
    BUILDING: BUILDING_SLOTS,
    TEMPLE: 1,
    WELL: 2,
    FENCE: 320,
    STOCKPILE: 8,
    CHIMNEYS: BUILDING_SLOTS,
  },
  /** Wheat in the fields: grass blades of one even height, coloured green when young to gold when ripe. */
  WHEAT: {
    /** Blade scale of ripe wheat (the wild grass runs 0.94..3 with clumps), the share it starts at, and per-blade jitter. */
    HEIGHT_SCALE: 1.3,
    YOUNG_SCALE: 0.4,
    HEIGHT_JITTER: 0.06,
    YOUNG_COLOR: '#74a03c',
    RIPE_COLOR: '#d9aa3b',
    TIP_COLOR: '#f2d57c',
  },
  /** Rise-in animation when a building stage appears. */
  CONSTRUCTION: {
    /** Seconds the rise takes. */
    RISE_S: 2.5,
    /** Height share a rising mesh starts from. */
    RISE_FROM: 0.15,
    /** Share of the rise after which the previous stage mesh is removed. */
    SWAP_AT: 0.4,
  },
  VILLAGERS: {
    /** Villagers are drawn within this distance of the camera (m). */
    DRAW_DISTANCE_M: 220,
    /** Soft contact shadow under each figure (they do not cast into the shadow maps). */
    BLOB: { STRENGTH: 0.42, RADIUS_M: 0.55, NIGHT_MUL: 0.35 },
  },
  /** Chimney smoke puffs (when and how strongly it smokes is a schedule rule in config/village.ts). */
  SMOKE: {
    PUFFS_PER_CHIMNEY: 6,
    RISE_M: 5,
    DRIFT_M: 3,
    PUFF_PERIOD_S: 5,
  },
  /** How buildings mark the terrain's grass, contact-shade and path layers. */
  TERRAIN: {
    /**
     * Grass cleared this far beyond the plinth pad (m), fading back to full grass over FADE_M. The
     * blades are gone at about a third of the fade and shrink back to full size by two thirds.
     */
    GRASS_PAD_M: 0.1,
    GRASS_FADE_M: 2,
    /** Worn yard around a building: path strength 0..1, margin beyond the pad and fade (m). */
    YARD: { STRENGTH: 0.45, MARGIN_M: 2, FADE_M: 2 },
    /** Texels per side of a dirty tile of the path and grass layers, and the compose budget per frame (texels). */
    TILE_TEXELS: 16,
    UPLOAD_TEXELS_PER_FRAME: 12000,
    /** Minimum seconds between the starts of a layer's tile sweeps. */
    UPLOAD_S: 1,
    /** Minimum seconds between grass compact passes requested after a grass-layer upload. */
    COMPACT_S: 3,
  },
  /**
   * The player's orb over the temple, fed by the faith the village gathers once the player has reached 100% energy
   * (hidden before that, and counted from that moment). Up to FULL_FAITH it follows the player's own 0..100% energy
   * ramp (orb size, rim, particles); past it, particles and the beam keep growing to MAX_FAITH.
   */
  CROWN_ORB: {
    /** Size at 100% (x the player's full-energy orb), bob height (m) and period (s). */
    SCALE: 4,
    BOB_M: 0.15,
    BOB_PERIOD_S: 6,
    FULL_FAITH: 300,
    MAX_FAITH: 1500,
    /** Particles at MAX_FAITH as a multiple of the player's 100% count. */
    MAX_PARTICLE_MUL: 3,
  },
  /**
   * Light beam rising from the crown orb: a thin guide-line ribbon with climbing pulses and sparkles. Brightness and
   * particle count grow with the square of the faith share, so the beam stays faint for a long time and fills with
   * particles at the top. Every range runs from MIN (no faith) to MAX (MAX_FAITH).
   */
  CROWN_BEAM: {
    HEIGHT_M: { MIN: 40, MAX: 400 },
    /** Half width of the ribbon (m); it widens to TOP_WIDEN times that at the top. */
    HALF_WIDTH_M: { MIN: 0.05, MAX: 0.2 },
    TOP_WIDEN: 1.5,
    HDR: { MIN: 0.08, MAX: 3 },
    /** The beam fades in over this many metres above the orb's centre, so it grows out of the orb. */
    FADE_M: 12,
    /** Share of the night brightness the beam keeps by day. */
    DAY_MUL: 0.35,
    /** Pulses climb the beam like the guide line's: cycles per second, spacing and half length (m), edge sharpness, idle level. */
    PULSE: { SPEED: 0.3, SPACING_M: 40, LENGTH_M: 14, SHARPNESS: 4, IDLE: 0.2 },
    /** Slow lateral drift of the whole beam (guide-line noise): amplitude (m), speed and scale along the beam. */
    SWAY: { AMP_M: 1.2, SPEED: 0.35, SCALE: 0.01 },
    PARTICLES: { COUNT: 700, SIZE_M: 0.12, SPREAD_M: 0.7 },
  },
  /**
   * Second stage once the thin beam is at full strength (faith past CROWN_ORB.MAX_FAITH): a wide soft light column
   * rises from the temple's floor, with a flared base, a ground ring and many rising particles. It grows from nothing
   * at MAX_FAITH to its full size at FULL_FAITH, where its base reaches past the temple's corners.
   */
  CROWN_COLUMN: {
    FULL_FAITH: 4500,
    HEIGHT_M: { MIN: 40, MAX: 220 },
    /** Radius at the ground (m) and of the column away from the flare (m). */
    BASE_RADIUS_M: { MIN: 1.5, MAX: 4.5 },
    TOP_RADIUS_M: { MIN: 0.6, MAX: 2.5 },
    /** Metres over which the radius narrows from the base to the column (e-folding height). */
    FLARE_M: 14,
    HDR: { MIN: 0.02, MAX: 0.12 },
    /** Share of the night brightness the column keeps by day. */
    DAY_MUL: 0.35,
    COLOR_HEX: 0xbfe6ff,
    /** Slow bands climbing the column (the guide line's pulses): cycles per second, spacing and half length (m), sharpness, idle level. */
    PULSE: { SPEED: 0.25, SPACING_M: 25, LENGTH_M: 10, SHARPNESS: 2, IDLE: 0.1 },
    /** The whole column breathes: angular speed (rad/s, 1.2 is a pulse every ~5 s) and how deep the dip goes (0..1). */
    BREATH: { SPEED: 2.5, AMOUNT: 0.6 },
    /** Particles inside the column rise this share of its height per second. */
    PARTICLES: { COUNT: 1200, SIZE_M: 0.2, RISE: 0.02 },
  },
  /** Glow the temple's runes keep by day (0..1 of their night glow). */
  TEMPLE_RUNE_DAY_GLOW: 0.35,
  /** Minimum gap between shadow-map re-bakes caused by building changes (s). */
  SHADOW_FLUSH_MIN_S: 1.5,
} as const;
