// src/config/village.ts — village tunables: gameplay and pure-sim values (render look and budgets live in config/visual/village.ts)

export const VILLAGE = {
  /** Authored `villageSeed` entity bounds. */
  SEED: {
    DEFAULT: 1,
    DEFAULT_RADIUS_M: 160,
    MIN_RADIUS_M: 40,
    MAX_RADIUS_M: 400,
  },
  /**
   * Level pad every building stands on, cut into the terrain's 2 m detail layer while it is built
   * (`sim/pad.ts`). The floor is the mean ground under the pad, so cut and fill balance.
   */
  PLINTH: {
    /** Pad margin beyond the footprint (m). */
    PAD_M: 0.6,
    /** Detail lattice step (m). Must equal the terrain chisel step / 4. */
    NODE_M: 2,
    /** Distance over which the cut or fill fades back into the terrain (m). */
    SKIRT_M: 4,
    /** Half side of the detail region around the seed (m); must cover the outermost ring plus a skirt. */
    REGION_HALF_M: 144,
    /** DEV warning when a founding pad needs more fill than this (m): the seed sits on steep ground. */
    WARN_HEIGHT_M: 1.5,
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
    /** A site is skipped when walking to it from the temple takes more than this times the straight distance (+ slack). */
    MAX_WALK_DETOUR: 2.6,
    WALK_SLACK_M: 12,
    /** Ground this close above the water plane counts as shore: no building or walking there (m). */
    SHORE_MARGIN_M: 2.5,
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
  },
  /** Concentric ring layout: houses sit loosely on rings around the temple, doors turned to it. */
  RINGS: {
    COUNT: 5,
    /** Base radius of the innermost ring and the gap between rings (m, centre to centre). */
    FIRST_RADIUS_M: 24,
    SPACING_M: 18,
    /** Each ring's radius is shifted by up to this (m) so the rings are not evenly spaced. */
    SPACING_JITTER_M: 2.5,
    /** Arc length a building typically takes on a ring (m); gives a ring's capacity. */
    PITCH_M: 14,
    /** A ring counts as open while it holds less than this share of its capacity (sparser outward). */
    FILL_TARGET: [0.85, 0.75, 0.6, 0.5, 0.45] as readonly number[],
    /** Chance a new building goes one ring further out than the first open ring. */
    SPILL: 0.2,
    /** Planner passes with no valid site before a ring is given up on. */
    EXHAUST_AFTER_FAILS: 6,
    /** Radial wobble of each ring (m) and the most the rings stretch along the contour (share). */
    WOBBLE_M: 4.2,
    ELONGATION_MAX: 0.3,
    /** Ground slope (rise/run) around the temple at which the stretch reaches its maximum. */
    ELONGATION_SLOPE: 0.25,
    /** Spread of a building's distance from its ring (m). */
    RADIAL_SIGMA_M: 3.2,
    /** Door direction noise (rad) and the share of buildings turned further for variety. */
    FACING_JITTER: 0.2,
    TURNED_SHARE: 0.08,
    TURNED_EXTRA: [0.6, 0.9] as readonly [number, number],
    /** Reward distance to the nearest building up to this gap (m): even but irregular rows. */
    GOAL_GAP_M: 9,
    /** Score weights: even spacing versus the clustering field (more density = looser hamlets). */
    SPACING_WEIGHT: 0.7,
    DENSITY_WEIGHT: 1.4,
    /** Half-width kept clear on both sides of the main road (m). */
    ROAD_CLEAR_M: 4.5,
    /** The main road ends this far past the radius of the outermost ring it has reached (m). */
    ROAD_OVERSHOOT_M: 4,
    /** Ring roads run this far inside their ring of houses (m): midway between two rings. */
    ROAD_INSET_M: 9,
    /** Fields start this far beyond the outermost ring (m). */
    FIELD_GAP_M: 14,
    /** House variant odds (a, b, c) per ring, innermost first: larger houses nearer the temple. */
    HOUSE_MIX: [
      [0.15, 0.4, 0.45],
      [0.3, 0.45, 0.25],
      [0.5, 0.35, 0.15],
      [0.65, 0.3, 0.05],
      [0.7, 0.27, 0.03],
    ] as readonly (readonly [number, number, number])[],
  },
  /** Ring roads, radial lanes and doorstep stubs laid as the village grows (then deepened by foot traffic). */
  PATHS: {
    /** Wear value painted and the permanent minimum it never fades below. */
    LAID_VALUE: 0.5,
    LAID_FLOOR: 0.35,
    LAID_RADIUS_M: 0.9,
    /** Ring roads: wear of a ring road (the plaza loop, ring 0, is stronger) and its half-width (m). */
    ROAD_VALUE: 0.55,
    ROAD_FLOOR: 0.4,
    ROAD_RADIUS_M: 1,
    PLAZA_VALUE: 0.7,
    PLAZA_FLOOR: 0.5,
    /** Two buildings on one ring road are joined when the arc between them is at most this long (m). */
    ARC_MAX_M: 85,
    /** Buildings keep this far from ring roads and radial lanes (m, footprint edge to road line). */
    ROAD_MARGIN_M: 2.2,
    /** Sideways sway of stubs and radial lanes (m); ring roads follow their ring exactly. */
    LANE_SWAY_M: 0.5,
    /** Plaza loop: road nodes around ring 0. Ring-road arcs are painted every this many metres. */
    PLAZA_NODES: 14,
    ARC_STEP_M: 2.5,
    /** Stubs shorter than this are not painted (m). */
    STUB_MIN_M: 0.6,
    /** Clearance a lane keeps from a building's or the temple's bounding circle (m), and the share of ROAD_MARGIN_M it needs. */
    OBSTACLE_PAD_M: 0.6,
    TEMPLE_PAD_M: 1,
    LANE_CLEAR_SHARE: 0.8,
    /** A building's door finds its road point by searching this many steps of STEP_RAD either side of straight ahead. */
    DOOR_SEARCH: { STEPS: 8, STEP_RAD: 0.04 },
    /** The main road joins a ring road only where it passes within this distance of it (m). */
    AXIS_SNAP_M: 4,
    /** Extra detour allowed to a searched fallback link, over MAX_DETOUR, from a door or from a road node. */
    FALLBACK_EXTRA_DETOUR: { DOOR: 1, ROAD: 1.8 },
    /** Chance that a new building also gets a radial lane inward, and the least arc between lanes (m). */
    RADIAL_P: 0.3,
    RADIAL_MIN_GAP_M: 30,
    /** How far (rad) a radial lane may slide along the ring to find a gap between houses. */
    RADIAL_SLIDE_RAD: 0.5,
    /** Fallback footpaths (field tracks): dropped when the route is longer than this many times the straight line. */
    MAX_DETOUR: 2.2,
    /** Sideways sway added to a laid path (m). */
    WIGGLE_M: 0.7,
    /** Wear that counts as path for walkers: starts at LO, fully path at HI. */
    PATHINESS: { LO: 0.1, HI: 0.4 },
    /**
     * How much cheaper path cells are for a journey (0 none, 0.55 about a 2x detour). Each journey
     * is a follower or a cutter, so most traffic stays on paths but not all of it.
     */
    AFFINITY: { FOLLOWER: 0.55, CUTTER: 0.2, FOLLOWER_SHARE: 0.7, LAYING: 0.15, TRACK: 0.6 },
    /** Share of strolls that head for a spot on or beside a path. */
    WANDER_ON_PATH_SHARE: 0.6,
  },
  /** Faith: the village currency; the orb's presence speeds it up (Phase 1 onward). */
  FAITH: {
    START: 12,
    /** Faith per second with nobody around (the sandbox village; a hamlet earns from believers). */
    BASE_PER_SEC: 0.08,
    /** Faith per second for each villager who believes (a hamlet's only income, before the orb's presence). */
    PER_BELIEVER_PER_SEC: 0.015,
    /** Faith rate multiple at full presence. */
    PRESENCE_MUL: 3.5,
    /** Presence ramps up over this long while the orb is near (s). */
    DWELL_UP_S: 20,
    DWELL_DOWN_S: 10,
    /** Full presence inside this distance, fading to none at PRESENCE_RADIUS_M (m). */
    FULL_RADIUS_M: 30,
    PRESENCE_RADIUS_M: 80,
    SITE_COST: 12,
    /** Faith a newcomer costs; they arrive while the village has free beds. */
    VILLAGER_COST: 2,
    /** Each building raises the next site cost by this fraction of the base cost. */
    SITE_COST_GROWTH: 0.005,
  },
  /**
   * The village the game starts with: a finished hamlet that does not grow, bring newcomers or earn faith
   * until it is converted (the conversion quest ends with the elder believing).
   */
  HAMLET: {
    /** Houses standing at the start (the temple and the well are always there). */
    HOUSES: 3,
    FIELDS: 2,
    /** People at the start, including the priest who is the elder. */
    VILLAGERS: 11,
    /** Converts past this many are worth a spark each. */
    SPARK_AFTER_CONVERTS: 5,
    /** Sparks given when the village converts. */
    SPARKS_AT_CONVERSION: 3,
  },
  CONSTRUCTION: {
    /**
     * Builder-seconds of work per phase. A site appears as a foundation (stage 0): the first phase
     * raises the frame (stage 1), the second finishes the building (stage 2).
     */
    WORK_S: [300, 600],
    /** Builder-seconds of progress per second a builder works at a site. */
    BUILDER_RATE: 1,
    /** Extra work rate at full presence (0.5 = half again as fast). */
    PRESENCE_WORK_BOOST: 0.5,
    SLOTS_PER_SITE: 4,
  },
  VILLAGERS: {
    MAX: 200,
    /** Villagers at founding: a priest, two builders and an idler. */
    START: 4,
    /** Beds per finished building. */
    BEDS: { temple: 2, house_a: 3, house_b: 4, house_c: 5 } as Readonly<Record<string, number>>,
    /** Share of the population that builds; one priest per this many people. */
    BUILDER_SHARE: 0.5,
    PEOPLE_PER_PRIEST: 12,
    /**
     * Ambient workers, each only when the map has a workplace for them (trees near the village, a
     * shore inside its grid): share of the population, taken from the idlers.
     */
    WOODCUTTER_SHARE: 0.1,
    FISHERMAN_SHARE: 0.06,
    /** Where ambient workers stand: metres off the trunk, trees nearer the temple than this are left alone. */
    WORK_SPOTS: { STAND_OFF_M: 1.1, TREE_MIN_FROM_TEMPLE_M: 22 },
    WALK_SPEED_MPS: 1.35,
    CARRY_SPEED_MPS: 1.1,
    /** Metres per full stride cycle (drives the walk animation phase, so feet do not slide). */
    STRIDE_M: 1.3,
    /** Seconds between a villager's decisions. */
    THINK_S: 0.3,
    /** Reached a waypoint within this distance (m). */
    ARRIVE_M: 0.5,
    /**
     * Phase 0 night (the sun never rises): share of builders who keep working by lantern and of
     * everyone else who prays instead of sleeping. At least one builder always works.
     */
    VIGIL: { BUILDER_WORK_SHARE: 0.5, PRAY_SHARE: 0.15 },
    /** Share of people who join the dawn and dusk prayers (priests always do). */
    DAWN_PRAY_SHARE: 0.3,
    DUSK_PRAY_SHARE: 0.4,
    PRAY_S: { MIN: 25, MAX: 70 },
    WANDER: { PAUSE_MIN_S: 4, PAUSE_MAX_S: 14, RADIUS_M: 40 },
    /** Day-cycle phases (0 midnight, 0.25 sunrise, 0.75 sunset): wake, work start/end, dusk end. */
    SCHEDULE: { WAKE: 0.22, WORK_START: 0.27, WORK_END: 0.68, DUSK_END: 0.76 },
  },
  PATH: {
    /** Waypoints a villager can hold. */
    MAX_WAYPOINTS: 40,
    MAX_EXPANSIONS: 6000,
    REQUESTS_PER_STEP: 2,
    /** Terrain steeper than this (rise/run, 0.7 is about 35 degrees) is not walkable. */
    STEEP_SLOPE: 0.7,
    /** Extra cost per slope squared. */
    SLOPE_COST: 6,
    /** Doorstep distance in front of a door (m). */
    DOORSTEP_M: 1.2,
  },
  /** Fixed-step sim speed-up: sub-step size and cap (keeps A*, planner and rise-in stable). */
  TIME_SCALE: { MAX_SUBSTEP_S: 0.1, MAX_SUBSTEPS: 16 },
  FIELDS: {
    MAX: 6,
    /** One more field for every this many houses. */
    HOUSES_PER_FIELD: 3,
    /** Field footprint (m): rows run along the long side. */
    WIDTH_M: 10,
    DEPTH_M: 14,
    MAX_RELIEF_M: 1.2,
    /** Fields sit between these shares of the village radius. */
    MIN_RADIUS_SHARE: 0.4,
    MAX_RADIUS_SHARE: 0.85,
    COST: 8,
    /** Seconds for a planted field to ripen untended; farmers speed it up. */
    GROW_S: 900,
    /** Extra growth speed per farmer at work (up to 3 count). */
    TEND_BOOST: 0.5,
    /** Share of the population that farms once a field exists. */
    FARMER_SHARE: 0.25,
    FENCE_SEGMENT_M: 2,
  },
  WELL: { HOUSES_NEEDED: 4, COST: 10 },
  /** Chimney smoke schedule: cooking spells (day-cycle phase ranges) puff strongly, other hours faintly. */
  SMOKE: {
    MORNING: [0.2, 0.32] as readonly [number, number],
    EVENING: [0.62, 0.9] as readonly [number, number],
    IDLE: 0.12,
    VIGIL: 0.35,
  },
  /** Lit windows: dusk to a per-house bedtime, and a short wake-up glow. */
  LIGHTS: {
    DUSK: 0.7,
    BEDTIME_MIN: 0.84,
    BEDTIME_SPAN: 0.12,
    WAKE: 0.2,
    SUNRISE: 0.26,
    VIGIL_SHARE: 0.7,
  },
  /** Footsteps wear paths into the ground; worn ground is cheaper to cross, so routes reinforce. */
  WEAR: {
    CELL_M: 1,
    /** Border beyond the village radius that the wear field and the terrain layers cover (m). */
    MARGIN_M: 12,
    /** Wear added at a cell per metre walked over it (about 140 crossings to full wear). */
    DEPOSIT_PER_M: 0.007,
    /** The 8 neighbours receive this share of the centre deposit. */
    NEIGHBOR_SHARE: 0.35,
    /** Unused paths fade with this half-life (s of village time). */
    HALF_LIFE_S: 1500,
    /** Wear is reported changed in tiles of this many cells per side (the dirty-area granularity). */
    TILE_CELLS: 16,
    /** Seconds between decay passes. */
    DECAY_STEP_S: 10,
    /** Seconds between copies of the wear into the pathfinder's cost grid. */
    PATHFINDER_SYNC_S: 10,
    /** Tent half-width (cells) of the blurred wear that feathers the edges of worn ground. */
    HALO_CELLS: 4,
    /**
     * Wear shown in the terrain's path layer: starts at LO, full strength (MAX 0..1) at HI. Blurred
     * wear adds a dirt skirt of up to HALO_MAX, full once the blurred wear reaches HALO_FULL.
     */
    PATH: { LO: 0.12, HI: 0.55, MAX: 0.9, HALO_MAX: 0.3, HALO_FULL: 0.2 },
    /**
     * Wear that clears grass: grass fades out between LO and HI; NOISE ragged-edges the border.
     * Blurred wear thins the grass by up to HALO_STRENGTH (kept under the blade cull so the skirt
     * only shortens blades) once it reaches HALO_FULL.
     */
    GRASS: { LO: 0.2, HI: 0.45, NOISE: 0.12, HALO_STRENGTH: 0.65, HALO_FULL: 0.12 },
    /** Wear of the road laid at founding from the temple door out along its axis. */
    OLD_ROAD: 0.85,
    /** Wear the founding road never fades below. */
    OLD_ROAD_FLOOR: 0.6,
    OLD_ROAD_RADIUS_M: 1.2,
  },
} as const;
