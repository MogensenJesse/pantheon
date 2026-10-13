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
    PLINTH: BUILDING_SLOTS,
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
  /** Glow the temple's runes keep by day (0..1 of their night glow). */
  TEMPLE_RUNE_DAY_GLOW: 0.35,
  /** Minimum gap between shadow-map re-bakes caused by building changes (s). */
  SHADOW_FLUSH_MIN_S: 1.5,
} as const;
