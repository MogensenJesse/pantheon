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
    globalPaletteMix: 0.28,
    global: { sun: '#F0D848', ground: '#7A9A30', shadow: '#1A4858' },
    biomes: {
      shore: biomePalettes(
        { sun: '#F8E0A8', ground: '#CC9748', shadow: '#4A7888' },
        { sun: '#F8B870', ground: '#E8C060', shadow: '#3A4058' },
        { sun: '#3A4858', ground: '#283848', shadow: '#121C28' },
      ),
      forest: biomePalettes(
        { sun: '#D7B93F', ground: '#957827', shadow: '#2A4850' },
        { sun: '#D4A040', ground: '#6A7030', shadow: '#2A3848' },
        { sun: '#0E2824', ground: '#081C18', shadow: '#040C0C' },
      ),
      hills: biomePalettes(
        { sun: '#E8C858', ground: '#A89840', shadow: '#3A6070' },
        { sun: '#F09850', ground: '#C87840', shadow: '#4A5068' },
        { sun: '#383848', ground: '#242430', shadow: '#101018' },
      ),
      mountain: biomePalettes(
        { sun: '#E8D0A0', ground: '#B8A078', shadow: '#4A6878' },
        { sun: '#E8A060', ground: '#C07048', shadow: '#4A5068' },
        { sun: '#383848', ground: '#282838', shadow: '#101018' },
      ),
      path: biomePalettes(
        { sun: '#F0D8A8', ground: '#D0B080', shadow: '#6A6058' },
        { sun: '#F0B878', ground: '#D08850', shadow: '#5A5048' },
        { sun: '#383028', ground: '#241C18', shadow: '#100C08' },
      ),
      meadow: biomePalettes(
        { sun: '#D8D840', ground: '#789A28', shadow: '#2A5868' },
        { sun: '#E8C040', ground: '#B86838', shadow: '#5A3838' },
        { sun: '#0E2820', ground: '#0A1C18', shadow: '#040C0C' },
      ),
      snow: biomePalettes(
        { sun: '#F8F6F0', ground: '#D0E0F0', shadow: '#6890B0' },
        { sun: '#FFE8D8', ground: '#E0D0C8', shadow: '#7A8AA8' },
        { sun: '#485868', ground: '#303848', shadow: '#181C28' },
      ),
      rock: biomePalettes(
        { sun: '#E0B878', ground: '#A89068', shadow: '#4A5868' },
        { sun: '#E09050', ground: '#A86848', shadow: '#4A4558' },
        { sun: '#2C2C38', ground: '#1C1C28', shadow: '#0C0C14' },
      ),
      water: biomePalettes(
        { sun: '#E8D0A0', ground: '#C8A068', shadow: '#3A6878' },
        { sun: '#E8B070', ground: '#C88848', shadow: '#3A4858' },
        { sun: '#2A3848', ground: '#1C2838', shadow: '#0C141C' },
      ),
    },
  },
} as const;
