// src/core/GameState.ts
export const state = {
  energy: 0,
  energyCap: 100,
  stonesFound: new Set<number>(),
  phase: 0,
  memoryFragments: [] as number[],
};

/** Development-only tuning; UI writes here when import.meta.env.DEV */
export const devSettings = {
  movementSpeedMultiplier: 1,
  showFpsCounter: false,
  terrain: {
    textureRepeat: 0.08,
    displacementScale: 0.45,
    displacementEnabled: true,
    normalStrength: 1.0,
    aoStrength: 0.85,
    specularStrength: 0.35,
    slopeRockStart: 0.75,
    pathBlendSoft: 1.6,
  },
};
