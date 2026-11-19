// src/landmarks/landmarkStandIns.ts — the props that stand where a landmark is until its own model exists
//
// Each landmark kind maps to props of the existing asset set, spawned through the normal prop pipeline
// (instanced LODs, shadows, reflections). The final models arrive as their own asset keys: swap the keys here.
// The same goes for what the village adds while it restores a place and when it is restored, and for the crew's
// camp (placeholders too).
// (pure and node-runnable)

import { HOVERING_STONE_PREFIX } from '../assets/assetManifest.ts';
import { landmark as LOOK } from '../config/visual/landmark.ts';
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

/**
 * A ring of floating runic stones, the ancient tree (its own model), a ruined temple, a half-sunken temple (its own model, sunk so its plinth
 * sits in the ground or the water) and a rock arch (the monolith). The runestones hover `LOOK.hover.liftM` over the ground (the lift is in their instance matrix, so their
 * shadows fall at the hover height) and the prop shader bobs them (the key says so: `config/propHover.ts`).
 */
export const LANDMARK_STAND_INS: Record<LandmarkKind, readonly StandIn[]> = {
  runestones: [
    { key: `${HOVERING_STONE_PREFIX}1`, scale: 1.2, dx: 2.6, dz: 0, surfaceLift: LOOK.hover.liftM },
    {
      key: `${HOVERING_STONE_PREFIX}3`,
      scale: 1.1,
      dx: -1.3,
      dz: 2.25,
      rotY: 2.1,
      surfaceLift: LOOK.hover.liftM,
    },
    {
      key: `${HOVERING_STONE_PREFIX}5`,
      scale: 1.3,
      dx: -1.3,
      dz: -2.25,
      rotY: 4.2,
      surfaceLift: LOOK.hover.liftM,
    },
  ],
  // The Sketchfab ancient tree (true size in metres, about 13 x 17 m, 11.5 m tall): half as big again, so it stands over
  // the village. Its root tips hang about 0.7 m under the trunk's foot, so it is sunk by that (times the scale) to put the
  // trunk on the ground; the lift grows with the map's landmark scale. First guess: not yet tuned against a map's ground.
  tree: [{ key: 'ancient_tree', scale: 1.5, surfaceLift: -1 }],
  temple_ruin: [{ key: 'temple_ruin', scale: 1 }],
  // `assets-src/landmarks/sunken_temple_build.py --variant ruin` (true size in metres, about 19 x 26 m, long axis along z, the
  // plinth about 2.5 m behind the middle): its 2.5 m plinth and the causeway's arches are meant to stand 2 m in the ground or
  // the water (the build's GROUND), so it is sunk by that. First guess, not yet fitted to the island-mountain shore.
  sunken_ruin: [{ key: 'sunken_ruin', scale: 1, surfaceLift: -2 }],
  // BlenderKit "Gateway" (true size about 14 x 6.5 m, 12.4 m high, its legs reach 1.25 m under the origin): two thirds, so it
  // is about as tall as the stone it replaces, with the legs sunk into the ground. First guess, not yet tuned on a map.
  monolith: [{ key: 'gateway', scale: 0.67, surfaceLift: -0.85 }],
};

/** `scale` sizes the whole group: the props, their offsets from the origin and their lift. Omit → 1. */
type Origin = { x: number; z: number; rotY?: number; scale?: number };

function toProps(origin: Origin, standIns: readonly StandIn[]): PropEntity[] {
  const cos = Math.cos(origin.rotY ?? 0);
  const sin = Math.sin(origin.rotY ?? 0);
  const size = origin.scale ?? 1;
  return standIns.map((s) => {
    const dx = (s.dx ?? 0) * size;
    const dz = (s.dz ?? 0) * size;
    return {
      type: 'prop',
      key: s.key,
      x: origin.x + dx * cos + dz * sin,
      z: origin.z - dx * sin + dz * cos,
      rotY: (origin.rotY ?? 0) + (s.rotY ?? 0),
      scale: s.scale * size,
      ...(s.surfaceLift ? { surfaceLift: s.surfaceLift * size } : {}),
    };
  });
}

/** `count` copies of a prop on a circle of `radius` m, facing outward. */
function ring(key: string, scale: number, radius: number, count: number): StandIn[] {
  return Array.from({ length: count }, (_, k) => {
    const a = (k / count) * Math.PI * 2;
    return { key, scale, dx: Math.sin(a) * radius, dz: Math.cos(a) * radius, rotY: a };
  });
}

export type RestorePhase = 'inProgress' | 'restored';

/**
 * What stands at a place of power besides its own props while the village restores it and once it is restored.
 * The tree and the monolith are "built around" (the place stays, a shrine and fence or fires are built around
 * it); for the others the restored look will replace the ruin's props when its model exists.
 */
export const LANDMARK_RESTORE_PROPS: Record<
  LandmarkKind,
  Record<RestorePhase, readonly StandIn[]>
> = {
  tree: {
    // Outside the roots and crown (about 9 m from the tree's centre across, 13 m along its long side, at 1.5 times its size).
    inProgress: ring('stone_small_2', 0.8, 13, 8),
    restored: [...ring('stone_runic_2', 0.9, 15, 6), ...ring('stone_small_3', 0.9, 13.5, 14)],
  },
  runestones: {
    inProgress: ring('stone_small_2', 0.8, 4, 6),
    restored: ring('stone_runic_4', 1, 5, 5),
  },
  temple_ruin: {
    inProgress: ring('stone_small_2', 0.8, 6, 6),
    restored: ring('stone_mid_2', 1, 8, 6),
  },
  sunken_ruin: {
    // Outside the causeway's tip and the rocks (about 13 m from the model's middle along z, 10 m to the side).
    inProgress: ring('stone_small_2', 0.8, 14, 8),
    restored: ring('stone_mid_3', 1, 15.5, 8),
  },
  monolith: {
    // Outside the arch's legs (about 4.7 m from its centre along the arch, 2.2 m across, at two thirds of its size).
    inProgress: ring('stone_small_2', 0.8, 6, 6),
    restored: [...ring('stone_runic_6', 0.9, 7.5, 6), ...ring('stone_small_4', 0.7, 5.5, 8)],
  },
};

/** The crew's camp: a hut and a ring of fire stones. */
export const CAMP_PROPS: readonly StandIn[] = [
  { key: 'nordic_hut', scale: 0.45, dx: 4, dz: 1, rotY: 1.6 },
  ...ring('stone_small_5', 0.6, 1.2, 7),
];

/** A finished outpost: a larger hut and a ring of stones (placeholders until models; the kind changes the stones). */
export const OUTPOST_PROPS: Record<'lumber' | 'fishing', readonly StandIn[]> = {
  lumber: [
    { key: 'nordic_hut', scale: 0.6, dx: 3, dz: 0, rotY: 1.6 },
    ...ring('stone_small_2', 0.7, 4.5, 8),
  ],
  fishing: [
    { key: 'nordic_hut', scale: 0.6, dx: 3, dz: 0, rotY: 1.6 },
    ...ring('stone_small_3', 0.7, 4.5, 8),
  ],
};

/** The props of an outpost's camp while it is built, or of the finished outpost around (x, z). */
export const outpostProps = (
  kind: 'lumber' | 'fishing',
  x: number,
  z: number,
  finished: boolean,
): PropEntity[] => toProps({ x, z }, finished ? OUTPOST_PROPS[kind] : CAMP_PROPS);

/**
 * The stand-in props of one landmark, as map prop entities. The landmark's own `surfaceLift` (set by hand in the
 * editor, in metres, not scaled) raises all of them; the restoration props stay on the ground.
 */
export function standInProps(landmark: LandmarkEntity): PropEntity[] {
  const props = toProps(landmark, LANDMARK_STAND_INS[landmark.kind]);
  const lift = landmark.surfaceLift ?? 0;
  return lift === 0
    ? props
    : props.map((p) => ({ ...p, surfaceLift: (p.surfaceLift ?? 0) + lift }));
}

/** The props the village adds at a landmark in a phase of its restoration. */
export function restoreProps(landmark: LandmarkEntity, phase: RestorePhase): PropEntity[] {
  return toProps(landmark, LANDMARK_RESTORE_PROPS[landmark.kind][phase]);
}

/** The camp's props around (x, z). */
export const campProps = (x: number, z: number): PropEntity[] => toProps({ x, z }, CAMP_PROPS);

/** `entities` with the stand-in props of its landmarks added (the same list when the map has none). */
export function withLandmarkStandIns(entities: readonly MapEntity[]): MapEntity[] {
  const extra = entities.flatMap((e) => (e.type === 'landmark' ? standInProps(e) : []));
  return extra.length === 0 ? [...entities] : [...entities, ...extra];
}

/** Every prop key a map with these landmarks may need: the stand-ins, the restoration's props and the camp's. */
export function landmarkPropKeys(entities: readonly MapEntity[]): string[] {
  const kinds = new Set(entities.flatMap((e) => (e.type === 'landmark' ? [e.kind] : [])));
  if (kinds.size === 0) return [];
  const keys = new Set<string>(
    [...CAMP_PROPS, ...Object.values(OUTPOST_PROPS).flat()].map((s) => s.key),
  );
  for (const kind of kinds) {
    for (const s of LANDMARK_STAND_INS[kind]) keys.add(s.key);
    for (const phase of ['inProgress', 'restored'] as const) {
      for (const s of LANDMARK_RESTORE_PROPS[kind][phase]) keys.add(s.key);
    }
  }
  return [...keys];
}
