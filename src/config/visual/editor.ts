// src/config/visual/editor.ts — map editor sculpt (DEV)

export const editor = {
  sculpt: {
    smoothStrength: 0.08,
  },
  /** Quilez ridge brush — play ignores; sliders don't rewrite the map. */
  terrainShape: {
    seed: 1,
    heightScale: 100,
    frequency: 0.008,
    octaves: 5,
    erosion: 0.7,
    warp: 0.35,
    valleyBias: 1.2,
    seaLevel: 0.15,
    talus: 1,
    talusPasses: 12,
  },
} as const;
