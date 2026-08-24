// src/config/visual/terrain.ts — biome splat mesh, snow, LOD detail ring

export const terrain = {
  /** Night visibility boost from player point light on terrain splat. */
  playerGlowMul: 0.42,
  /** Render mesh subdivisions (PlaneGeometry). Density reference — play fine step is capped by `lod.maxFinestStepM`. */
  meshSegments: 4096,
  /**
   * Map editor terrain subdivisions. GPU-displaces from the height texture, so this
   * must stay close to the authored grid (2049 cells / 1 m) or ridges collapse.
   * 1024 → 2 m/vertex (was 256 / 8 m after the 2048 world).
   */
  editorMeshSegments: 1024,
  /** Per-atlas-slot texture tuning (tile repeat, detail disp, normals, roughness). */
  biomes: {
    shore: { tileRepeat: 0.055, detailDisplacement: 0.4, normalStrength: 1, roughness: 1 },
    forest: { tileRepeat: 0.15, detailDisplacement: 0, normalStrength: 2, roughness: 1.1 },
    hills: { tileRepeat: 0.1, detailDisplacement: 0, normalStrength: 0.65, roughness: 0.7 },
    mountain: { tileRepeat: 0.05, detailDisplacement: 0, normalStrength: 1, roughness: 0.5 },
    path: { tileRepeat: 0.12, detailDisplacement: 0.09, normalStrength: 1.2, roughness: 0.85 },
    meadow: { tileRepeat: 0.2, detailDisplacement: 0, normalStrength: 2, roughness: 1.3 },
    snow: { tileRepeat: 0.065, detailDisplacement: 0, normalStrength: 1, roughness: 0.25 },
    /** Steep-slope overlay (`dark_rock_02`, 1k pack upscaled at bake). */
    rock: { tileRepeat: 0.07, detailDisplacement: 0, normalStrength: 1.1, roughness: 0.55 },
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
  displacementEnabled: true,
  /** worldNormal.y below this → full tangent normals for lighting. */
  plateauFlatnessStart: 0.9,
  /** worldNormal.y above this → geometric normal for lighting (reduces plateau shimmer). */
  plateauFlatnessEnd: 0.97,
  /** Grid-cell blur radius when baking painted biome weights (~2–3 m at default grid). */
  biomeBlendRadiusCells: 3,
  /** Sculpted terrain mesh draws into the sun shadow map (hill → valley shadows). */
  castShadow: true,
  /** Play-mode fine + mid follow patches + world-fixed far base (three opaque layers). */
  lod: {
    /** Mid-ring vertex step = referenceStep × this (player-follow patch). */
    midStepMul: 4,
    /** Far-ring vertex step = referenceStep × this (world-fixed backdrop). */
    farStepMul: 8,
    /**
     * Fine-ring vertex spacing cap (m). `SIZE / meshSegments` grew from ~0.2 m to 0.5 m
     * on the 2048 m world, so vertex displacement could not follow the 1k/2k atlas tiles.
     */
    maxFinestStepM: 0.2,
    /** Mid-ring vertex spacing cap (m). */
    maxMacroStepM: 2,
    /** Far-ring vertex spacing cap (m). */
    maxFarStepM: 16,
    /** CPU-baked shadow caster resolution (decoupled from visible play mesh). */
    shadowMeshSegments: 256,
    /** Outer detail circle (m) — detail disp fades to 0; disp-atlas samples skipped beyond. */
    detailRadiusM: 35,
    /** Outer mid-ring circle (m) — mid follow patch fades to far backdrop. */
    macroRadiusM: 200,
    /**
     * Inner radius (m) for full detail before fade — 0 uses `detailRadiusM - layerFadeBandM`.
     * Drives detail disp (finishes early in the band) and geomorph toward the coarser mesh.
     */
    detailDispFadeStartM: 0,
    /** Band (m) at detailRadiusM for disp fade + geomorph before the opaque fine→mid cut. */
    layerFadeBandM: 16,
    /** Band (m) at macroRadiusM for geomorph before the opaque mid→far cut. */
    macroFadeBandM: 24,
    /**
     * Coarser ring draws this many of its vertex-steps inside the finer cut.
     * Complementary circles on different tessellations leave slope cracks; a short
     * opaque underlay plugs them after geomorph finishes. Keep below the fade band.
     */
    seamOverlapSteps: 1.5,
  },
} as const;
