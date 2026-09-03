// src/config/visual/terrain.ts — biome splat, snow, chisel facets

export const terrain = {
  playerGlowMul: 0.42,
  biomes: {
    shore: { tileRepeat: 0.055 },
    forest: { tileRepeat: 0.15 },
    hills: { tileRepeat: 0.1 },
    mountain: { tileRepeat: 0.05 },
    path: { tileRepeat: 0.12 },
    meadow: { tileRepeat: 0.2 },
    snow: { tileRepeat: 0.065 },
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
  },
  biomeBlendRadiusCells: 3,
  castShadow: true,
  packMaps: {
    convex: {
      ridgeLight: 0.08,
    },
    grass: {
      /** Shared slope-rock curve suppresses grass. */
      slopeKill: 0.85,
    },
  },
  /**
   * Display chisel: play CPU-bakes Y + casts shadows; editor GPU-displaces.
   * Walkable Y / grass / waterline snap to coarse triangles. Segments = SIZE / stepM.
   * edgeSoft fillets lighting N only. Bilinear Y is |∇h| / foam AA only.
   */
  chisel: {
    stepM: 8,
    edgeSoft: 0.03,
  },
  /** Hue-split palettes; distance haze is atmosphere.haze. */
  stylize: {
    albedoPaletteMix: 0.9,
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
