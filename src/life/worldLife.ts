// src/life/worldLife.ts — the living world as one piece: leaves and fireflies on the wind, sheep, hens and birds,
// and the life at the story's places
//
// The frame loop and `main.ts` see one object. What it fixes is the order (the drifting specks, then the places, then
// the animals draw), the ground-normal adapter the animals stand on, and the warm-up that compiles every pipeline
// before the first frame.

import { type DirectionalLight, type PerspectiveCamera, type Scene, Vector3 } from 'three';
import type { MapTerrainContext } from '../world/MapTerrainBuilder';
import { sampleChiseledWorldNormal } from '../world/terrain/cpu/terrainChiselCpu';
import type { VillageSystemContext } from '../world/village/VillageSystem';
import type { AnimalModel } from './animals/animalModels';
import { type Animals, createAnimals } from './animals/animals';
import { createTreeGrid, woodCentres } from './habitat';
import { createDriftFields } from './particles/driftFields';
import { createPlaceLife, type PlaceLife } from './places/placeLife';

type Orb = { x: number; y: number; z: number };

export interface WorldLifeOptions {
  scene: Scene;
  camera: PerspectiveCamera;
  sun: DirectionalLight;
  terrain: Pick<MapTerrainContext, 'getWorldY' | 'waterLevelM' | 'grids'>;
  /** The village the sheep and hens belong to and whose pipelines are warmed up with ours; null on a map without one. */
  village: Pick<VillageSystemContext, 'sim' | 'beginWarmup' | 'endWarmup'> | null;
  /** The map's trees: where leaves blow from, what animals walk round and where the woods (the birds' places) are. */
  trees: readonly { x: number; z: number; key: string }[];
  /** The modelled animals (`loadAnimalKit`), started early so it loads while the village is built. */
  animalKit: Promise<ReadonlyMap<string, AnimalModel>>;
  /** Where the orb is in the simulation (the animals' fixed step reads it). */
  orb: () => Orb;
  /** True from Phase 1: living things notice the orb. */
  creaturesNotice: () => boolean;
  /** Seeds the flocks, so the same map starts the same way. */
  seed: number;
}

export interface WorldLife {
  /** The sheep, hens and birds (DEV and the probes read them). */
  animals: Animals;
  /** The life at the story's places (the gameplay wakes and stills them). */
  placeLife: PlaceLife;
  /** Fixed step. */
  fixedUpdate: (dt: number) => void;
  /** Once a frame, after the ambience is set, with the orb's centre as it is drawn. */
  update: (frameDelta: number, drawnOrb: Orb) => void;
  /** Once a frame, with the camera position and the interpolation between fixed steps. */
  render: (alpha: number, viewX: number, viewZ: number) => void;
  /** The village's pipelines and ours, compiled before the first frame. */
  warmups: { beginWarmup: () => void; endWarmup: () => void };
  dispose: () => void;
}

const groundNormal = new Vector3();

export async function createWorldLife(options: WorldLifeOptions): Promise<WorldLife> {
  const { scene, camera, sun, terrain, village, trees, orb, creaturesNotice, seed } = options;
  const { getWorldY: groundY, waterLevelM } = terrain;

  const driftFields = createDriftFields({
    scene,
    camera,
    trees: createTreeGrid(trees),
    groundY,
    waterLevelM,
    creaturesNotice,
  });
  const animals = createAnimals({
    scene,
    sun,
    sim: village?.sim ?? null,
    modelled: await options.animalKit,
    getY: groundY,
    getGroundNormal: (x, z, out) => {
      sampleChiseledWorldNormal(terrain.grids, x, z, groundNormal);
      out.x = groundNormal.x;
      out.z = groundNormal.z;
    },
    waterLevelM,
    trees,
    woods: woodCentres(trees),
    orb,
    creaturesNotice,
    seed,
  });
  // Made now, so it is compiled with the rest; it shows once a place has woken.
  const placeLife = createPlaceLife({ scene, groundY, waterLevelM, animals });

  return {
    animals,
    placeLife,
    fixedUpdate: (dt) => animals.update(dt),
    update: (frameDelta, drawnOrb) => {
      driftFields.update(frameDelta, drawnOrb);
      placeLife.update(frameDelta);
    },
    render: (alpha, viewX, viewZ) => animals.render(alpha, viewX, viewZ),
    warmups: {
      beginWarmup: () => {
        village?.beginWarmup();
        animals.beginWarmup();
      },
      endWarmup: () => {
        village?.endWarmup();
        animals.endWarmup();
      },
    },
    dispose: () => {
      placeLife.dispose();
      driftFields.dispose();
      animals.dispose();
    },
  };
}
