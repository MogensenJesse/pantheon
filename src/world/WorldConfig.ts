// src/world/WorldConfig.ts
import { Color } from 'three';
// Ground textures: public/textures/terrain/{shore,forest,hills,rock,path}.jpg|png|webp
// See terrainTextureManifest.ts for loader paths and recommended 512²–1024² tileable assets.
import {
  alongPath,
  JOURNEY_WAYPOINTS,
  PATH_LANDMARK_OFFSET,
  positionBesidePath,
} from './JourneyPath';

const LM = PATH_LANDMARK_OFFSET;

export const WORLD = {
  SEED: 'aethon-world-1',
  SIZE: 200,
  SEGMENTS: 128,
  HEIGHT_SCALE: 16,
  /** Circular ocean disc (diameter). Radius must exceed the horizon cloud
   *  ring outer edge (~r 500) from any player position so the corner-less
   *  edge always sits behind the fog wall, never against bare HDRI.
   *  Sits over a dark seafloor disc (see TerrainGenerator) that prevents
   *  HDRI bleed-through where the translucent water extends past the 200 m island. */
  WATER_PLANE_SIZE: 1600,
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
      /** Scalar path roughness/AO (no path ORM texture sample in TSL). */
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

/** Cached landmark positions for scatter clearance checks. */
export const LANDMARK_XZ_POSITIONS: ReadonlyArray<readonly [number, number]> = [
  ...WORLD.LANDMARKS.stones.map((s) => s.xz),
  WORLD.LANDMARKS.ancientOak.xz,
  WORLD.LANDMARKS.sacredSpring.xz,
  WORLD.LANDMARKS.drownedTemple.xz,
  WORLD.LANDMARKS.highCairn.xz,
];
