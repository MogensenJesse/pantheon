// src/config/visual/terrain.ts — biome splat mesh, snow, LOD detail ring

export const terrain = {
  /** Night visibility boost from player point light on terrain splat. */
  playerGlowMul: 0.42,
  /** Render mesh subdivisions (PlaneGeometry). ~12 texels/vertex on path cobbles needs ≥4k; 2k is a perf compromise. */
  meshSegments: 4096,
  /** Map editor terrain subdivisions — lower vertex count for sculpt/paint. */
  editorMeshSegments: 256,
  /** Per-atlas-slot texture tuning (tile repeat, detail disp, normals, roughness). */
  biomes: {
    shore: { tileRepeat: 0.055, detailDisplacement: 0.4, normalStrength: 1, roughness: 1 },
    forest: { tileRepeat: 0.15, detailDisplacement: 0.3, normalStrength: 2, roughness: 1.1 },
    hills: { tileRepeat: 0.1, detailDisplacement: 0.9, normalStrength: 0.65, roughness: 0.7 },
    mountain: { tileRepeat: 0.05, detailDisplacement: 1, normalStrength: 1, roughness: 0.5 },
    path: { tileRepeat: 0.12, detailDisplacement: 0.07, normalStrength: 1.2, roughness: 0.85 },
    meadow: { tileRepeat: 0.2, detailDisplacement: 0, normalStrength: 2, roughness: 1.3 },
    snow: { tileRepeat: 0.065, detailDisplacement: 0.2, normalStrength: 1, roughness: 0.25 },
    /** Steep-slope overlay (`dark_rock_02`, 1k pack upscaled at bake). */
    rock: { tileRepeat: 0.07, detailDisplacement: 0.8, normalStrength: 1.1, roughness: 0.55 },
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
  /** DEV: prefer JPG displacement when probing Poly Haven disp files. */
  preferredDispFormat: 'jpg' as const,
  /** Probe/load order when both resolutions exist — `1k` when only *_disp_1k.* are shipped. */
  preferredDispResolution: '1k' as const,
  displacementEnabled: true,
  /** worldNormal.y below this → full tangent normals for lighting. */
  plateauFlatnessStart: 0.9,
  /** worldNormal.y above this → geometric normal for lighting (reduces plateau shimmer). */
  plateauFlatnessEnd: 0.97,
  /** Grid-cell blur radius when baking painted biome weights (~2–3 m at default grid). */
  biomeBlendRadiusCells: 3,
  /** Sculpted terrain mesh draws into the sun shadow map (hill → valley shadows). */
  castShadow: true,
  /** Play-mode fine center + coarse macro meshes — macro step = meshSegments / farStepMul. */
  lod: {
    /** Play mesh vertex step multiplier vs finest reference (`meshSegments`). */
    farStepMul: 8,
    /** CPU-baked shadow caster resolution (decoupled from visible play mesh). */
    shadowMeshSegments: 256,
    /** Outer detail circle (m) — detail disp fades to 0; disp-atlas samples skipped beyond. */
    detailRadiusM: 35,
    /**
     * Inner radius (m) for full detail before fade — 0 uses `detailRadiusM - layerFadeBandM`.
     * Drives both detail disp and fine/coarse layer opacity (same smoothstep).
     */
    detailDispFadeStartM: 0,
    /** Min smoothstep band (m) at the outer edge for disp + layer handoff. */
    layerFadeBandM: 8,
  },
} as const;
