// src/config/village.ts — village gameplay tunables (look lives in config/visual/village.ts)

export const VILLAGE = {
  /** Authored `villageSeed` entity bounds. */
  SEED: {
    DEFAULT: 1,
    DEFAULT_RADIUS_M: 160,
    MIN_RADIUS_M: 40,
    MAX_RADIUS_M: 400,
  },
  /** Stone pad every building stands on: it hides the terrain slope across the footprint. */
  PLINTH: {
    /** Pad margin beyond the footprint (m). */
    PAD_M: 0.6,
    /** Pad base below the lowest ground under it (m), so no gap shows on the downhill side. */
    SINK_M: 0.5,
    /** Pad top above the highest ground under it (m). */
    TOP_LIFT_M: 0.1,
    /** Minimum pad thickness (m). */
    MIN_HEIGHT_M: 0.25,
    /** DEV warning when a founding pad is taller than this (m): the seed sits on steep ground. */
    WARN_HEIGHT_M: 3,
  },
  /** Instance capacity per kit key (one InstancedMesh per LOD each). */
  CAPACITY: {
    BUILDING: 64,
    TEMPLE: 1,
    WELL: 2,
    PLINTH: 64,
  },
  /** Planner: where and how often new building sites start. */
  PLAN: {
    /** Seconds between planner passes. */
    INTERVAL_S: 5,
    /** Open construction sites at once. */
    MAX_ACTIVE_SITES: 3,
    /** Village size cap, temple included (draw-call and triangle budget). */
    MAX_BUILDINGS: 60,
    /** Candidate positions scored per pass. */
    CANDIDATES: 64,
    /** Cell size of the village-local site grid (m). */
    CELL_M: 2,
    /** Keep-clear radius around the temple door plaza (m). */
    PLAZA_M: 10,
    /** Gap kept between building footprints (m). */
    SPACING_M: 3,
    /** Tallest terrain step a footprint may span (m); relaxed after repeated failed passes. */
    MAX_RELIEF_M: 2.4,
    RELIEF_RELAX_STEP: 1.25,
    RELIEF_RELAX_CAP_M: 3.5,
    /** Failed passes before the relief limit relaxes. */
    FAILS_PER_RELAX: 3,
    /** Ridge direction jitter around the contour (rad). */
    YAW_JITTER: 0.17,
    /** Slope (rise/run) at which houses turn fully downhill instead of toward the village centre. */
    FULL_SLOPE_FACING: 0.08,
    SPOKES: { MIN: 3, MAX: 4, MIN_LENGTH_M: 55, MAX_LENGTH_M: 110, SETBACK_M: 7 },
  },
  /** Faith: the village currency; the orb's presence speeds it up (Phase 1 onward). */
  FAITH: {
    START: 12,
    /** Faith per second with nobody around. About one 15-faith building per 5 minutes. */
    BASE_PER_SEC: 0.05,
    /** Faith rate multiple at full presence. */
    PRESENCE_MUL: 3.5,
    /** Presence ramps up over this long while the orb is near (s). */
    DWELL_UP_S: 20,
    DWELL_DOWN_S: 10,
    /** Full presence inside this distance, fading to none at PRESENCE_RADIUS_M (m). */
    FULL_RADIUS_M: 30,
    PRESENCE_RADIUS_M: 80,
    SITE_COST: 15,
    /** Each building raises the next site cost by this fraction of the base cost. */
    SITE_COST_GROWTH: 0.005,
  },
  CONSTRUCTION: {
    /**
     * Builder-seconds of work per phase. A site appears as a foundation (stage 0): the first phase
     * raises the frame (stage 1), the second finishes the building (stage 2).
     */
    WORK_S: [400, 800],
    /** Stand-in builders until villagers carry the work. */
    GHOST_BUILDERS: 4,
    /** Extra work rate at full presence (1 = twice as fast). */
    PRESENCE_WORK_BOOST: 1,
    SLOTS_PER_SITE: 4,
    /** Rise-in animation when a stage appears (s). */
    RISE_S: 2.5,
    RISE_FROM: 0.15,
    /** Share of the rise after which the previous stage mesh is removed. */
    SWAP_AT: 0.4,
  },
  /** Fixed-step sim speed-up: sub-step size and cap (keeps A*, planner and rise-in stable). */
  TIME_SCALE: { MAX_SUBSTEP_S: 0.1, MAX_SUBSTEPS: 16 },
  /** How buildings mark the terrain's grass, contact-shade and path layers. */
  TERRAIN: {
    /** Border beyond the village radius covered by the layers (m). */
    MARGIN_M: 12,
    /** Grass cleared this far beyond the plinth pad (m), fading back to full grass over FADE_M. */
    GRASS_PAD_M: 0.5,
    GRASS_FADE_M: 0.8,
    /** Worn yard around a building: path strength 0..1, margin beyond the pad and fade (m). */
    YARD: { STRENGTH: 0.45, MARGIN_M: 2, FADE_M: 1 },
    /** Minimum seconds between region uploads of the path and grass layers. */
    UPLOAD_S: 1,
    /** Minimum seconds between grass compact passes requested after a grass-layer upload. */
    COMPACT_S: 3,
  },
  /** Minimum gap between shadow-map re-bakes caused by building changes (s). */
  SHADOW_FLUSH_MIN_S: 1.5,
} as const;
