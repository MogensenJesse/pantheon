// src/config/visual/terrain.ts — biome splat mesh, snow, chisel facets

export const terrain = {
  /** Night visibility boost from player point light on terrain splat. */
  playerGlowMul: 0.42,
  /** Per-atlas-slot texture tuning (tile repeat). */
  biomes: {
    shore: { tileRepeat: 0.055 },
    forest: { tileRepeat: 0.15 },
    hills: { tileRepeat: 0.1 },
    mountain: { tileRepeat: 0.05 },
    path: { tileRepeat: 0.12 },
    meadow: { tileRepeat: 0.2 },
    snow: { tileRepeat: 0.065 },
    /** Steep-slope overlay (`dark_rock_02`, 1k pack upscaled at bake). */
    rock: { tileRepeat: 0.07 },
  },
  snow: {
    heightStart: 0.4,
    heightEnd: 0.6,
    mountainWeight: 0.1,
    noise: { amplitude: 0.135, scale: 0.025 },
    aspect: {
      strength: 0.75,
      shadeBoost: 0.45,
      referenceElevationDeg: 15,
      referenceAzimuthDeg: 200,
    },
    slope: { normalYStart: 0.2, normalYEnd: 0.05, strength: 0.5 },
  },
  /** Grid-cell blur radius when baking painted biome weights (~2–3 m at default grid). */
  biomeBlendRadiusCells: 3,
  /** Sculpted terrain mesh draws into the sun shadow map (hill → valley shadows). */
  castShadow: true,
  /**
   * Convex ridge overlay from pack aux. Slope-rock (and grass kill) use chisel
   * N.y via `TERRAIN_SLOPE_ROCK_*` — not a second 1 m hypot formula.
   */
  packMaps: {
    convex: {
      /** Albedo lift on white ridges (black stays unchanged). */
      ridgeLight: 0.08,
    },
    grass: {
      /** How strongly the shared slope-rock curve suppresses grass (0 = ignore). */
      slopeKill: 0.85,
    },
  },
  /**
   * Display-only knife chisel. Authored height stays full-res. Play CPU-bakes vertex Y
   * (and the visible mesh casts shadows). Editor GPU-displaces so sculpt stays live.
   * getWorldY / prop contact / grass Y / waterline still snap onto coarse world-space
   * triangles. Play + editor mesh segments = WORLD.SIZE / stepM (reload after changing
   * stepM). `edgeSoft` fillets lighting N across triangle creases only — not height.
   * Bilinear sculpt Y is |∇h| / foam AA only.
   */
  chisel: {
    /** World-space slab size (m). */
    stepM: 8,
    /**
     * Crease fillet width as a fraction of `stepM` (0 = knife lighting).
     * 0.15 ≈ 1.2 m on 8 m slabs. Live in Dev → Terrain → Chisel.
     */
    edgeSoft: 0.03,
  },
  /**
   * Painterly albedo. Mix 0 keeps photographed splat; mix 1 remaps luma onto
   * palettes (Firewatch: complementary warm sun / cool shadow). Distance haze
   * is scene fog (`VISUAL.atmosphere.haze`). Live: Dev → Terrain → Stylize
   * (hue-split mix, global sun/ground/shadow, per-biome palettes).
   */
  stylize: {
    albedoPaletteMix: 0.9,
    /** 0 = per-biome palettes, 1 = `global` on every biome (noon and golden). */
    globalPaletteMix: 0.25,
    global: { sun: '#F4E84D', ground: '#919342', shadow: '#03353D' },
    biomes: {
      shore: {
        noon: { sun: '#edd9b0', ground: '#c4a47a', shadow: '#5f8a8c' },
        goldenHour: { sun: '#f0b56a', ground: '#c48452', shadow: '#5a6e90' },
      },
      forest: {
        noon: { sun: '#b8c45c', ground: '#6a8a48', shadow: '#3d5c5a' },
        goldenHour: { sun: '#d4a84a', ground: '#7a7a38', shadow: '#3a4a5e' },
      },
      hills: {
        noon: { sun: '#d8b56a', ground: '#a8884c', shadow: '#5a7068' },
        goldenHour: { sun: '#e8a048', ground: '#b87840', shadow: '#4a5874' },
      },
      mountain: {
        noon: { sun: '#d4b890', ground: '#9a7b5c', shadow: '#4a6572' },
        goldenHour: { sun: '#e0a060', ground: '#a07048', shadow: '#3e4a64' },
      },
      path: {
        noon: { sun: '#e2c8a0', ground: '#b8956a', shadow: '#6b5e54' },
        goldenHour: { sun: '#ecc090', ground: '#c08050', shadow: '#5a504c' },
      },
      meadow: {
        noon: { sun: '#DDEE42', ground: '#87BC25', shadow: '#4a6e5c' },
        goldenHour: { sun: '#e0c04a', ground: '#9a9a3c', shadow: '#3e5864' },
      },
      snow: {
        noon: { sun: '#f2f0e8', ground: '#d4dce4', shadow: '#8aa0b8' },
        goldenHour: { sun: '#ffe8d0', ground: '#d0c8c8', shadow: '#7a8aa8' },
      },
      rock: {
        noon: { sun: '#c4a070', ground: '#8a6e55', shadow: '#3d4e58' },
        goldenHour: { sun: '#d4884a', ground: '#8a5a40', shadow: '#3a4558' },
      },
    },
  },
} as const;
