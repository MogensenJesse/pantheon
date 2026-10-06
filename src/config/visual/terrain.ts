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
    water: { tileRepeat: 0.05 },
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
    albedoPaletteMix: 0.95,
    globalPaletteMix: 0.15,
    /** Global trio per TOD stop (mixed in by globalPaletteMix). */
    global: {
      night: { sun: '#3A4868', ground: '#243048', shadow: '#0E1424' },
      goldenHour: { sun: '#E89048', ground: '#8A4A30', shadow: '#283058' },
      noon: { sun: '#DCD898', ground: '#7A9448', shadow: '#1E4060' },
    },
    biomes: {
      shore: biomePalettes(
        { sun: '#F6E0B0', ground: '#D8B070', shadow: '#3A6488' },
        { sun: '#F0A868', ground: '#A86840', shadow: '#34365E' },
        { sun: '#3A4858', ground: '#283848', shadow: '#121C28' },
      ),
      forest: biomePalettes(
        { sun: '#8EB044', ground: '#628A30', shadow: '#1E4A40' },
        { sun: '#C88040', ground: '#7A4A24', shadow: '#26264A' },
        { sun: '#10283A', ground: '#0A1C28', shadow: '#040C14' },
      ),
      hills: biomePalettes(
        { sun: '#8EB044', ground: '#628A30', shadow: '#1E4A40' },
        { sun: '#C88040', ground: '#7A4A24', shadow: '#26264A' },
        { sun: '#12303C', ground: '#0A1E28', shadow: '#040C14' },
      ),
      mountain: biomePalettes(
        { sun: '#E8DCC0', ground: '#B0A088', shadow: '#3A5478' },
        { sun: '#E89868', ground: '#9A6050', shadow: '#363C66' },
        { sun: '#383848', ground: '#282838', shadow: '#101018' },
      ),
      path: biomePalettes(
        { sun: '#F0DCB0', ground: '#C8A878', shadow: '#4A5068' },
        { sun: '#E8A070', ground: '#9A6040', shadow: '#3A3658' },
        { sun: '#383028', ground: '#241C18', shadow: '#100C08' },
      ),
      meadow: biomePalettes(
        { sun: '#8EB044', ground: '#628A30', shadow: '#1E4A40' },
        { sun: '#C88040', ground: '#7A4A24', shadow: '#26264A' },
        { sun: '#12303C', ground: '#0A1E28', shadow: '#040C14' },
      ),
      snow: biomePalettes(
        { sun: '#F8F6F0', ground: '#D0E0F0', shadow: '#6890B0' },
        { sun: '#FFC8A0', ground: '#C89890', shadow: '#5A5888' },
        { sun: '#485868', ground: '#303848', shadow: '#181C28' },
      ),
      rock: biomePalettes(
        { sun: '#E0C8A0', ground: '#A89880', shadow: '#34445E' },
        { sun: '#C07050', ground: '#7A4838', shadow: '#2A2C48' },
        { sun: '#2C2C38', ground: '#1C1C28', shadow: '#0C0C14' },
      ),
      water: biomePalettes(
        { sun: '#E8D4A8', ground: '#C0A070', shadow: '#2A5478' },
        { sun: '#D09060', ground: '#8A5840', shadow: '#2A3A60' },
        { sun: '#2A3848', ground: '#1C2838', shadow: '#0C141C' },
      ),
    },
  },
} as const;
