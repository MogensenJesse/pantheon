// src/landmarks/landmarkStandIns.ts — the props that stand where a landmark is until its own model exists
//
// Each landmark kind maps to props of the existing asset set, spawned through the normal prop pipeline
// (instanced LODs, shadows, reflections). The final models arrive as their own asset keys: swap the keys here.
// (pure and node-runnable)

import type { LandmarkEntity, LandmarkKind, MapEntity } from '../map/MapTypes.ts';

type PropEntity = Extract<MapEntity, { type: 'prop' }>;

type StandIn = {
  key: string;
  scale: number;
  /** Offset (m) from the landmark, rotated with it. */
  dx?: number;
  dz?: number;
  /** Raises (+) or sinks (-) the prop. */
  surfaceLift?: number;
  /** Extra turn (rad). */
  rotY?: number;
};

/** A ring of runic stones, a great pine, a standing church, a hut up to its eaves in the ground and a tall rock. */
export const LANDMARK_STAND_INS: Record<LandmarkKind, readonly StandIn[]> = {
  runestones: [
    { key: 'stone_runic_1', scale: 1.2, dx: 2.6, dz: 0 },
    { key: 'stone_runic_3', scale: 1.1, dx: -1.3, dz: 2.25, rotY: 2.1 },
    { key: 'stone_runic_5', scale: 1.3, dx: -1.3, dz: -2.25, rotY: 4.2 },
  ],
  tree: [{ key: 'pine_big_1', scale: 1.7 }],
  temple_ruin: [{ key: 'stave_church', scale: 1.1 }],
  sunken_ruin: [{ key: 'nordic_hut', scale: 2.2, surfaceLift: -2.4 }],
  monolith: [{ key: 'stone_big_1', scale: 3.6 }],
};

/** The stand-in props of one landmark, as map prop entities. */
export function standInProps(landmark: LandmarkEntity): PropEntity[] {
  const cos = Math.cos(landmark.rotY ?? 0);
  const sin = Math.sin(landmark.rotY ?? 0);
  return LANDMARK_STAND_INS[landmark.kind].map((s) => {
    const dx = s.dx ?? 0;
    const dz = s.dz ?? 0;
    return {
      type: 'prop',
      key: s.key,
      x: landmark.x + dx * cos + dz * sin,
      z: landmark.z - dx * sin + dz * cos,
      rotY: (landmark.rotY ?? 0) + (s.rotY ?? 0),
      scale: s.scale,
      ...(s.surfaceLift ? { surfaceLift: s.surfaceLift } : {}),
    };
  });
}

/** `entities` with the stand-in props of its landmarks added (the same list when the map has none). */
export function withLandmarkStandIns(entities: readonly MapEntity[]): MapEntity[] {
  const extra = entities.flatMap((e) => (e.type === 'landmark' ? standInProps(e) : []));
  return extra.length === 0 ? [...entities] : [...entities, ...extra];
}
