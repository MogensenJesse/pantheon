// src/config/visual/editor.ts — map editor sculpt tools (DEV)

export const editor = {
  sculpt: {
    /** Box-blur soften strength (Alt / Soften checkbox). */
    smoothStrength: 0.08,
  },
  /**
   * Live TerrainGenerator-style shape stack for sculpt.
   * Sculpt base is the massing envelope; Seed + Generate fills a full Quilez field
   * (sandbox-style start map), then sculpt edits the envelope.
   */
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
