// src/world/WorldConfig.ts
import { Color } from 'three';
// Ground textures: Poly Haven 2K glTF packs under public/textures/terrain/{biome}/ — see terrainTextureManifest.ts.
import { alongPath, JOURNEY_WAYPOINTS, positionBesidePath } from './JourneyPath';

export const WORLD = {
  SEED: 'aethon-world-1',
  SIZE: 800,
  SEGMENTS: 512,
  // Raised from 16 → 64 so sculpted mountains can reach dramatic heights.
  // All biome thresholds, snow, and player-speed normalise against this value
  // automatically (they use worldY / HEIGHT_SCALE) so no other tuning changes.
  HEIGHT_SCALE: 128,
  /** @deprecated Use {@link playWaterPlaneDiameter} in `water/waterExtent.ts` at runtime. */
  WATER_PLANE_SIZE: 3200,
  BIOMES: {
    WATER: { max: 0.08, color: new Color(0x1a3d7a) },
    SHORE: { max: 0.42, color: new Color(0x8a9a5b) },
    FOREST: { max: 1.1, color: new Color(0x2d7020) },
    HILLS: { max: 1.9, color: new Color(0x8c6c35) },
    MOUNTAIN: { max: Infinity, color: new Color(0xa09080) },
  },

  JOURNEY: {
    WAYPOINTS: JOURNEY_WAYPOINTS,
    PATH_HALF_WIDTH: 14,
    PATH_SURFACE: {
      WIDTH: 2.6,
      /** Metres of soft blend from path edge into surrounding biomes. */
      BLEND_SOFT: 1.6,
      COLOR: 0x8a7658,
      /** Fallback path roughness/AO when path ORM texture is missing. */
      ROUGHNESS: 0.72,
      AO: 0.88,
    },
    PATH_EXCLUSION_RADIUS: 3.8,
  },

  PLAYER_START: { xz: positionBesidePath(alongPath(0.04), -1, 10) as [number, number] },

  FOREST_CLUSTER: {
    center: positionBesidePath(alongPath(0.58), 1, 10) as [number, number],
    radius: 22,
  },
} as const;
