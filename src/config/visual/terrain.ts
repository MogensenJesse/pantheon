// src/config/visual/terrain.ts — biome splat, snow, chisel facets

function biomePalettes(
  noon: { sun: string; ground: string; shadow: string },
  goldenHour: { sun: string; ground: string; shadow: string },
  night: { sun: string; ground: string; shadow: string },
) {
  return { night, noon, goldenHour };
}

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
      shore: biomePalettes(
        { sun: '#edd9b0', ground: '#c4a47a', shadow: '#5f8a8c' },
        { sun: '#f0b56a', ground: '#EDDE2E', shadow: '#2E2E49' },
        { sun: '#6a7080', ground: '#3a4050', shadow: '#1a2030' },
      ),
      forest: biomePalettes(
        { sun: '#b8c45c', ground: '#6a8a48', shadow: '#3d5c5a' },
        { sun: '#d4a84a', ground: '#7a7a38', shadow: '#3a4a5e' },
        { sun: '#3a4a48', ground: '#243430', shadow: '#121c1c' },
      ),
      hills: biomePalettes(
        { sun: '#d8b56a', ground: '#a8884c', shadow: '#5a7068' },
        { sun: '#e8a048', ground: '#b87840', shadow: '#4a5874' },
        { sun: '#5a5848', ground: '#3a3830', shadow: '#1c1e28' },
      ),
      mountain: biomePalettes(
        { sun: '#d4b890', ground: '#9a7b5c', shadow: '#4a6572' },
        { sun: '#e0a060', ground: '#a07048', shadow: '#3e4a64' },
        { sun: '#585860', ground: '#383840', shadow: '#1a1c24' },
      ),
      path: biomePalettes(
        { sun: '#e2c8a0', ground: '#b8956a', shadow: '#6b5e54' },
        { sun: '#ecc090', ground: '#c08050', shadow: '#5a504c' },
        { sun: '#504840', ground: '#302820', shadow: '#181410' },
      ),
      meadow: biomePalettes(
        { sun: '#DDEE42', ground: '#87BC25', shadow: '#4a6e5c' },
        { sun: '#E0C04A', ground: '#A5593A', shadow: '#693839' },
        { sun: '#3a4a38', ground: '#283028', shadow: '#141c18' },
      ),
      snow: biomePalettes(
        { sun: '#f2f0e8', ground: '#d4dce4', shadow: '#8aa0b8' },
        { sun: '#ffe8d0', ground: '#d0c8c8', shadow: '#7a8aa8' },
        { sun: '#687088', ground: '#485060', shadow: '#242838' },
      ),
      rock: biomePalettes(
        { sun: '#c4a070', ground: '#8a6e55', shadow: '#3d4e58' },
        { sun: '#d4884a', ground: '#8a5a40', shadow: '#3a4558' },
        { sun: '#404048', ground: '#282830', shadow: '#121418' },
      ),
    },
  },
} as const;
