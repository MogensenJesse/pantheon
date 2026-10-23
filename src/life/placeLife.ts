// src/life/placeLife.ts — the life at the story's places: clouds of specks and flocks of birds, each shown by a level
//
// Everything is built at the start with no place yet (a level of 0 draws nothing), so the pipelines are compiled with
// the rest of the scene and no place waking later causes a hitch. A place is then "sited" (given its spot and the level
// it begins at); `update` eases each level toward its target and hands the share to the cloud and the flock. What
// decides the targets is `ambientLife.ts`; what each kind of place has is `lifeRules.ts`.
import { type Scene, Vector3 } from 'three';
import { life } from '../config/visual/life';
import type { LandmarkKind } from '../map/MapTypes';
import { ambience } from '../rendering/ambience/ambienceState';
import type { Animals } from './animals/animals';
import { type BirdFlock, recentreBirdFlock } from './animals/birdSim';
import {
  cloudRadiusM,
  easeLevel,
  fireflyGate,
  isFireflyCloud,
  LIFE_KINDS,
  lifeOf,
  type PlaceLifeSpec,
} from './lifeRules';
import { type CloudField, createCloudField } from './particles/cloudField';

const C = life.CLOUDS;
const PL = life.PLACES;

type CloudKind = NonNullable<PlaceLifeSpec['cloud']>;

/** The look of each cloud and whether its specks sit on a ring (the radius is per place: `cloudRadiusM`). */
const CLOUDS: Record<
  CloudKind,
  { look: typeof C.FIREFLY_SWIRL | typeof C.DUST_RISE | typeof C.LEAF_SHED; ring: boolean }
> = {
  leaves: { look: C.LEAF_SHED, ring: false },
  fireflies: { look: C.FIREFLY_SWIRL, ring: false },
  'ring-fireflies': { look: C.FIREFLY_SWIRL, ring: true },
  motes: { look: C.DUST_RISE, ring: false },
};

interface Site {
  x: number;
  z: number;
  /** The level now, and the level it heads for. */
  level: number;
  target: number;
  /** DEV: a level held in place of the target (null = follow the story). */
  override: number | null;
}

export interface PlaceLifeView {
  kind: LandmarkKind;
  x: number;
  z: number;
  level: number;
  target: number;
  override: number | null;
}

export interface PlaceLife {
  /** Gives a place its spot and the level it begins at (no fade: a load shows it as it was). */
  site: (kind: LandmarkKind, x: number, z: number, level: number) => void;
  /** Takes a place away; its life shows nothing at once. */
  unsite: (kind: LandmarkKind) => void;
  setTarget: (kind: LandmarkKind, target: number) => void;
  /** DEV: hold a place at a level whatever the story says (null lets go). */
  setOverride: (kind: LandmarkKind, level: number | null) => void;
  /** Once a frame, after the ambience is set. */
  update: (frameDelta: number) => void;
  /** What there is and how much of it shows (DEV and checks). */
  list: () => PlaceLifeView[];
  dispose: () => void;
}

export interface PlaceLifeOptions {
  scene: Scene;
  groundY: (x: number, z: number) => number;
  waterLevelM: number;
  animals: Pick<Animals, 'addBirdFlock'>;
}

export function createPlaceLife(options: PlaceLifeOptions): PlaceLife {
  const { scene, groundY, waterLevelM, animals } = options;
  const sites = new Map<LandmarkKind, Site>();
  const clouds = new Map<LandmarkKind, CloudField>();
  const flocks = new Map<LandmarkKind, BirdFlock>();

  for (const kind of LIFE_KINDS) {
    const spec = lifeOf(kind);
    if (spec.cloud) {
      const def = CLOUDS[spec.cloud];
      const field = createCloudField(`placeCloud_${kind}`, def.look, { ring: def.ring });
      scene.add(field.mesh);
      clouds.set(kind, field);
    }
    if (spec.flock) {
      const tuning = spec.flock === 'dove' ? PL.TEMPLE : PL.TREE;
      flocks.set(
        kind,
        animals.addBirdFlock({
          model: spec.flock,
          place: true,
          cx: 0,
          cz: 0,
          count: tuning.BIRDS,
          orbitM: tuning.ORBIT_M,
          altitudeM: tuning.ALTITUDE_M,
          seed: kind,
          level: 0,
        }),
      );
    }
  }

  const centre = new Vector3();
  const hide = (kind: LandmarkKind) => {
    const flock = flocks.get(kind);
    if (flock) flock.level = 0;
    clouds.get(kind)?.update({
      centre,
      level: 0,
      windDirX: ambience.windDirX,
      windDirZ: ambience.windDirZ,
      windBoost: ambience.windBoost,
    });
  };

  return {
    site: (kind, x, z, level) => {
      sites.set(kind, { x, z, level, target: level, override: null });
      const flock = flocks.get(kind);
      if (flock) recentreBirdFlock(flock, x, z, groundY(x, z), level);
    },
    unsite: (kind) => {
      sites.delete(kind);
      hide(kind);
    },
    setTarget: (kind, target) => {
      const site = sites.get(kind);
      if (site) site.target = target;
    },
    setOverride: (kind, level) => {
      const site = sites.get(kind);
      if (site) site.override = level;
    },
    update: (frameDelta) => {
      for (const [kind, site] of sites) {
        site.level = easeLevel(site.level, site.override ?? site.target, frameDelta);

        const flock = flocks.get(kind);
        if (flock) flock.level = site.level;

        const cloud = clouds.get(kind);
        if (!cloud) continue;
        const spec = lifeOf(kind);
        const gate = isFireflyCloud(spec.cloud)
          ? fireflyGate(ambience.night01, ambience.golden01)
          : 1;
        // fireflies at the sunken ruin hover over the water, not under it
        centre.set(site.x, Math.max(groundY(site.x, site.z), waterLevelM), site.z);
        cloud.update({
          centre,
          level: site.level * gate,
          spreadM: cloudRadiusM(kind),
          windDirX: ambience.windDirX,
          windDirZ: ambience.windDirZ,
          windBoost: ambience.windBoost,
        });
      }
    },
    list: () =>
      [...sites].map(([kind, s]) => ({
        kind,
        x: s.x,
        z: s.z,
        level: s.level,
        target: s.target,
        override: s.override,
      })),
    dispose: () => {
      for (const field of clouds.values()) {
        scene.remove(field.mesh);
        field.dispose();
      }
      clouds.clear();
      flocks.clear();
      sites.clear();
    },
  };
}
