// src/config/visual/terrain.ts — solid-color faceted heightfield, snow, unused clipmap knobs

export const terrain = {
  /** Night visibility boost from player point light on terrain splat. */
  playerGlowMul: 0.42,
  /** Play mesh subdivisions (PlaneGeometry). 128 → ~6.25 m faces on an 800 m map. */
  meshSegments: 128,
  /** Map editor terrain subdivisions — denser than play so sculpt brushes still read. */
  editorMeshSegments: 256,
  /** Flat albedo per biome / overlay (low-poly look). Hex strings for DEV color pickers. */
  solidColors: {
    shore: '#a8b15c',
    forest: '#3c9a28',
    hills: '#8c6a32',
    mountain: '#8b919c',
    path: '#c9a066',
    meadow: '#5cb83a',
    snow: '#eef2f6',
  },
  /** Unused by the solid-color shader — kept so leftover displacement uniforms still init. */
  biomes: {
    shore: { tileRepeat: 0.055, detailDisplacement: 0.4, normalStrength: 1, roughness: 1 },
    forest: { tileRepeat: 0.15, detailDisplacement: 0.3, normalStrength: 2, roughness: 1.1 },
    hills: { tileRepeat: 0.1, detailDisplacement: 0.9, normalStrength: 0.65, roughness: 0.7 },
    mountain: { tileRepeat: 0.05, detailDisplacement: 1, normalStrength: 1, roughness: 0.5 },
    path: { tileRepeat: 0.12, detailDisplacement: 0.07, normalStrength: 1.2, roughness: 0.85 },
    meadow: { tileRepeat: 0.2, detailDisplacement: 0, normalStrength: 2, roughness: 1.3 },
    snow: { tileRepeat: 0.065, detailDisplacement: 0.2, normalStrength: 1, roughness: 0.25 },
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
  displacementEnabled: false,
  /** worldNormal.y below this → full tangent normals for lighting. */
  plateauFlatnessStart: 0.9,
  /** worldNormal.y above this → geometric normal for lighting (reduces plateau shimmer). */
  plateauFlatnessEnd: 0.97,
  /** Grid-cell blur radius when baking painted biome weights (0 = hard one-hot cells). */
  biomeBlendRadiusCells: 0,
  /** Sculpted terrain mesh draws into the sun shadow map (hill → valley shadows). */
  castShadow: true,
  /** Play-mode fine center + coarse macro meshes — macro step = meshSegments / farStepMul. */
  lod: {
    /** Play mesh vertex step multiplier vs finest reference (`meshSegments`). */
    farStepMul: 8,
    /** CPU-baked shadow caster resolution — match play `meshSegments` so umbras follow facets. */
    shadowMeshSegments: 128,
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
