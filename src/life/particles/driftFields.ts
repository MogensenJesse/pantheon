// src/life/particles/driftFields.ts — the fields of drifting specks the world has, and what decides how many show
//
// Once a frame: reads the wind and the time of day (rendering/ambience), how wooded the camera's place is
// (life/habitat.ts) and the weather, turns them into a share of each field (life/driftRules.ts) and hands that
// to the fields.
import { type PerspectiveCamera, type Scene, Vector3 } from 'three';
import { life } from '../../config/visual/life';
import { ambience } from '../../rendering/ambience/ambienceState';
import { weatherLook } from '../../rendering/weather/weatherLook';
import { creatureState } from '../creatureState';
import { type DriftWorld, fireflyShare, leafShare, pollenShare, shoreness } from '../driftRules';
import type { TreeGrid } from '../habitat';
import { followTarget } from '../windGust';
import { createDriftField, type DriftField } from './driftField';
import { orbNoticeUniforms } from './speckMaterial';

/** Seconds the pull toward the orb takes to build once creatures notice it. */
const ORB_PULL_SMOOTH_S = 1.5;

export interface DriftFieldsOptions {
  scene: Scene;
  camera: PerspectiveCamera;
  /** Where the trees are (life/habitat.ts). */
  trees: TreeGrid;
  /** The height of the ground at a place, and of the water (shores are where the two are close). */
  groundY: (x: number, z: number) => number;
  waterLevelM: number;
  /** Where the orb is. */
  orbPosition: () => { x: number; y: number; z: number };
  /** True from Phase 1: living things (fireflies) notice the orb. */
  creaturesNotice: () => boolean;
}

export interface DriftFields {
  /** Once a frame, after the ambience is set. */
  update: (frameDelta: number) => void;
  dispose: () => void;
}

export function createDriftFields(options: DriftFieldsOptions): DriftFields {
  const { scene, camera, trees, groundY, waterLevelM, orbPosition, creaturesNotice } = options;
  const leaves = createDriftField('driftLeaves', life.LEAVES);
  const pollen = createDriftField('driftPollen', life.POLLEN);
  const fireflies = createDriftField('driftFireflies', life.FIREFLIES);
  const fields: DriftField[] = [leaves, pollen, fireflies];
  for (const field of fields) scene.add(field.mesh);

  const centre = new Vector3();
  let woods = -1;
  let birch = 0;
  let shore = 0;
  let pull = 0;

  return {
    update: (frameDelta) => {
      const { x, z } = camera.position;
      // how wooded the camera's place is: eased, so crossing a glade does not flicker the count
      const woodsNow = trees.density(x, z);
      woods =
        woods < 0 ? woodsNow : followTarget(woods, woodsNow, frameDelta, life.HABITAT.FOLLOW_S);
      birch = followTarget(birch, trees.birchShare(x, z), frameDelta, life.HABITAT.FOLLOW_S);

      const ground = groundY(x, z);
      shore = followTarget(
        shore,
        shoreness(ground, waterLevelM),
        frameDelta,
        life.HABITAT.FOLLOW_S,
      );

      // creatures notice the orb only once the world is alive; the pull eases in so none snaps toward it
      const orb = orbPosition();
      creatureState.orbX = orb.x;
      creatureState.orbY = orb.y;
      creatureState.orbZ = orb.z;
      creatureState.notices = creaturesNotice();
      pull = followTarget(pull, creatureState.notices ? 1 : 0, frameDelta, ORB_PULL_SMOOTH_S);
      orbNoticeUniforms.uOrb.value.set(orb.x, orb.y, orb.z);
      orbNoticeUniforms.uOrbPull.value = pull;

      const world: DriftWorld = {
        shore01: shore,
        woods01: woods,
        windBoost: ambience.windBoost,
        rain01: weatherLook.rain01,
        night01: ambience.night01,
        golden01: ambience.golden01,
      };
      centre.set(x, ground, z);
      const wind = {
        centre,
        windDirX: ambience.windDirX,
        windDirZ: ambience.windDirZ,
        windBoost: ambience.windBoost,
        windClock: ambience.windClock,
        alt: birch,
      };
      leaves.update({ ...wind, density: leafShare(world) });
      pollen.update({ ...wind, density: pollenShare(world) });
      fireflies.update({ ...wind, alt: 0, density: fireflyShare(world) });
    },
    dispose: () => {
      for (const field of fields) {
        scene.remove(field.mesh);
        field.dispose();
      }
    },
  };
}
