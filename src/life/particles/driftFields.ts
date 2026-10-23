// src/life/particles/driftFields.ts — the fields of drifting specks the world has, and what decides how many show
//
// Once a frame: reads the wind and the time of day (rendering/ambience), how wooded the camera's place is
// (life/habitat.ts) and the weather, turns them into a share of each field (life/driftRules.ts) and hands that
// to the fields.
import { type PerspectiveCamera, type Scene, Vector3 } from 'three';
import { life } from '../../config/visual/life';
import { followTarget } from '../../core/math/scalar';
import { ambience } from '../../rendering/ambience/ambienceState';
import { weatherLook } from '../../rendering/weather/weatherLook';
import { type DriftWorld, fireflyShare, leafShare, pollenShare, shoreness } from '../driftRules';
import type { TreeGrid } from '../habitat';
import { createDriftField, type DriftField, type DriftFieldState } from './driftField';
import { orbNoticeUniforms } from './orbNotice';

export interface DriftFieldsOptions {
  scene: Scene;
  camera: PerspectiveCamera;
  /** Where the trees are (life/habitat.ts). */
  trees: TreeGrid;
  /** The height of the ground at a place, and of the water (shores are where the two are close). */
  groundY: (x: number, z: number) => number;
  waterLevelM: number;
  /** True from Phase 1: living things (fireflies) notice the orb. */
  creaturesNotice: () => boolean;
}

export interface DriftFields {
  /** Once a frame, after the ambience is set, with the orb's centre as it is drawn this frame. */
  update: (frameDelta: number, orb: { x: number; y: number; z: number }) => void;
  dispose: () => void;
}

export function createDriftFields(options: DriftFieldsOptions): DriftFields {
  const { scene, camera, trees, groundY, waterLevelM, creaturesNotice } = options;
  const leaves = createDriftField('driftLeaves', life.LEAVES);
  const pollen = createDriftField('driftPollen', life.POLLEN);
  const fireflies = createDriftField('driftFireflies', life.FIREFLIES);
  const fields: DriftField[] = [leaves, pollen, fireflies];
  for (const field of fields) scene.add(field.mesh);

  // one set of numbers rewritten each frame, so a frame allocates nothing
  const world: DriftWorld = {
    shore01: 0,
    woods01: 0,
    windBoost: 1,
    rain01: 0,
    night01: 0,
    golden01: 0,
  };
  const state: DriftFieldState = {
    centre: new Vector3(),
    density: 0,
    alt: 0,
    windDirX: 0,
    windDirZ: 0,
    windBoost: 1,
    windClock: 0,
  };
  const FOLLOW_S = life.HABITAT.FOLLOW_S;
  let woods = -1;
  let birch = 0;
  let shore = 0;
  let pull = 0;

  return {
    update: (frameDelta, orb) => {
      const { x, z } = camera.position;
      // how wooded the camera's place is: eased, so crossing a glade does not flicker the count
      const woodsNow = trees.density(x, z);
      woods = woods < 0 ? woodsNow : followTarget(woods, woodsNow, frameDelta, FOLLOW_S);
      birch = followTarget(birch, trees.birchShare(x, z), frameDelta, FOLLOW_S);

      const ground = groundY(x, z);
      shore = followTarget(shore, shoreness(ground, waterLevelM), frameDelta, FOLLOW_S);

      // creatures notice the orb only once the world is alive; the pull eases in so none snaps toward it
      pull = followTarget(
        pull,
        creaturesNotice() ? 1 : 0,
        frameDelta,
        life.ORB_NOTICE.PULL_SMOOTH_S,
      );
      orbNoticeUniforms.uOrb.value.set(orb.x, orb.y, orb.z);
      orbNoticeUniforms.uOrbPull.value = pull;

      world.shore01 = shore;
      world.woods01 = woods;
      world.windBoost = ambience.windBoost;
      world.rain01 = weatherLook.rain01;
      world.night01 = ambience.night01;
      world.golden01 = ambience.golden01;

      state.centre.set(x, ground, z);
      state.windDirX = ambience.windDirX;
      state.windDirZ = ambience.windDirZ;
      state.windBoost = ambience.windBoost;
      state.windClock = ambience.windClock;
      state.alt = birch;
      state.density = leafShare(world);
      leaves.update(state);
      state.alt = 0;
      state.density = pollenShare(world);
      pollen.update(state);
      state.density = fireflyShare(world);
      fireflies.update(state);
    },
    dispose: () => {
      for (const field of fields) {
        scene.remove(field.mesh);
        field.dispose();
      }
    },
  };
}
