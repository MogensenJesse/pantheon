// src/config/village/layout.ts — village tunables: where the village stands and how it is laid out: the seed, the pads, the plan, the rings, the paths and the wear

export const LAYOUT = {
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
    /** Pathiness (0..1) from which a spot counts as being on a path (strolls aim for such spots). */
    ON_PATH_MIN: 0.5,
    /**
     * How much cheaper path cells are for a journey (0 none, 0.55 about a 2x detour). Each journey
     * is a follower or a cutter, so most traffic stays on paths but not all of it.
     */
    AFFINITY: { FOLLOWER: 0.55, CUTTER: 0.2, FOLLOWER_SHARE: 0.7, LAYING: 0.15, TRACK: 0.6 },
    /** Share of strolls that head for a spot on or beside a path. */
    WANDER_ON_PATH_SHARE: 0.6,
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
