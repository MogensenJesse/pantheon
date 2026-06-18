// src/world/WorldConfig.ts
import { Color } from 'three';
// Ground textures: Poly Haven 2K glTF packs under public/textures/terrain/{biome}/ — see terrainTextureManifest.ts.
import {
  alongPath,
  JOURNEY_WAYPOINTS,
  PATH_LANDMARK_OFFSET,
  positionBesidePath,
} from './JourneyPath';

const LM = PATH_LANDMARK_OFFSET;

export const WORLD = {
  SEED: 'aethon-world-1',
  SIZE: 800,
  SEGMENTS: 512,
  // Raised from 16 → 64 so sculpted mountains can reach dramatic heights.
  // All biome thresholds, snow, and player-speed normalise against this value
  // automatically (they use worldY / HEIGHT_SCALE) so no other tuning changes.
  HEIGHT_SCALE: 64,
  /** Circular ocean disc (diameter). Radius must exceed the horizon cloud
   *  ring outer edge (~r 600) from any player position so the corner-less
   *  edge always sits behind the fog wall, never against bare HDRI.
   *  Sits over a dark seafloor disc that prevents HDRI bleed-through where
   *  the translucent water extends past the 800 m island. */
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

  LANDMARKS: {
    stones: [
      { id: 0, xz: positionBesidePath(alongPath(0.12), 1, LM) },
      { id: 1, xz: positionBesidePath(alongPath(0.38), -1, LM) },
      { id: 2, xz: positionBesidePath(alongPath(0.52), 1, LM) },
      { id: 3, xz: positionBesidePath(alongPath(0.72), -1, LM) },
      { id: 4, xz: positionBesidePath(alongPath(0.9), 1, LM) },
    ],
    ancientOak: { xz: positionBesidePath(alongPath(0.3), -1, LM + 0.15) },
    sacredSpring: { xz: positionBesidePath(alongPath(0.2), 1, LM) },
    drownedTemple: { xz: positionBesidePath(0, -1, 4.8) },
    highCairn: { xz: positionBesidePath(alongPath(0.8), -1, LM + 0.2) },
  },

  /** Start near the ruin, away from drownedTemple approach radius (was same xz as temple). */
  PLAYER_START: { xz: positionBesidePath(alongPath(0.04), -1, 10) as [number, number] },

  FOREST_CLUSTER: {
    center: positionBesidePath(alongPath(0.58), 1, 10) as [number, number],
    radius: 22,
  },
} as const;