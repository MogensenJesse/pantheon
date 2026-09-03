// src/config/world.ts — map scale, grid, biome height bands
import { Color } from 'three';

export const WORLD = {
  SIZE: 2048,
  SEGMENTS: 2048,
  /** Height grid units → metres; biome/speed thresholds use worldY / HEIGHT_SCALE. */
  HEIGHT_SCALE: 350,
  BIOMES: {
    /** Water plane at max × HEIGHT_SCALE. */
    WATER: { max: 0.04, color: new Color(0x1a3d7a) },
    SHORE: { max: 0.42 },
    FOREST: { max: 1.1 },
    HILLS: { max: 1.9 },
  },
} as const;
