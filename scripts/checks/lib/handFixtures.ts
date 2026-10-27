// scripts/checks/lib/handFixtures.ts — what the checks of the orb's hand share: a hamlet, a hand on it, and the
// stand-ins for its ports (an energy meter, the farm's sheep, a view that writes down what it is asked)
import assert from 'node:assert/strict';
import type { HandAnimals, HandPorts } from '../../../src/hand/handPorts.ts';
import { createHandRuntime } from '../../../src/hand/handRuntime.ts';
import type { HandCandidate, HandEnergy } from '../../../src/hand/handTypes.ts';
import {
  type AnimalEnv,
  addAnimal,
  animalsWithin,
  createFlock,
  liftAnimal,
  releaseAnimal,
  stepFlock,
} from '../../../src/life/animals/animalSim.ts';
import type { CarriedPose } from '../../../src/world/village/model/carried.ts';
import type { Building, RemoteSite, VillageEvent } from '../../../src/world/village/model/types.ts';
import type { VillageSim } from '../../../src/world/village/sim/villageSim.ts';
import { convertVillage, loadMap, makeSim, stepSim } from './villageHeadless.ts';

let mapCache: ReturnType<typeof loadMap> | undefined;
const map = () => {
  mapCache ??= loadMap('island-mountain');
  return mapCache;
};

/** A hamlet, stepped `seconds` into a morning (villagers out and about, the fields growing). */
export function morningHamlet(seconds = 0): VillageSim {
  const sim = makeSim(map(), { mode: 'hamlet' });
  if (seconds > 0) stepSim(sim, { seconds, phase: () => 0.4 });
  return sim;
}

/** A converted hamlet stepped until the builders open a site, and that site. */
export function openSite(): { sim: VillageSim; site: Building } {
  const sim = convertVillage(makeSim(map(), { mode: 'hamlet' }));
  const opened: Building[] = [];
  stepSim(sim, {
    seconds: 3600,
    onStep: () => {
      const b = sim.buildings.find((x) => x.stage < 2);
      if (b) opened.push(b);
      return opened.length === 0;
    },
  });
  assert.ok(opened[0], 'a site opened');
  return { sim, site: opened[0] };
}

/** An energy meter that starts at `start`; the hand spends from it and gives back to it. */
export const meter = (start: number) => {
  const state = { energy: start };
  const energy: HandEnergy = {
    amount: () => state.energy,
    spend: (n) => {
      state.energy -= n;
    },
    refund: (n) => {
      state.energy += n;
    },
  };
  return { state, energy };
};

export const building = (over: Partial<Building>): Building => ({
  id: 1,
  type: 'house_a',
  x: 0,
  z: 0,
  rotY: 0,
  halfW: 2,
  halfD: 2,
  plinthTopY: 0,
  plinthBaseY: 0,
  stage: 2,
  progress: 0,
  level: 1,
  upgrade: 0,
  ring: 0,
  ...over,
});

export const tree = (id: number, x: number, z = 0): HandCandidate => ({ kind: 'tree', id, x, z });

/** A remote site (a restoration or an outpost) as the hand sees it: only where it is and how far along. */
export const remoteSite = (over: Partial<RemoteSite>): RemoteSite => ({
  id: 1,
  kind: 'tree',
  x: 540,
  z: 0,
  campX: 500,
  campZ: 0,
  stage: 0,
  progress: 0,
  route: [],
  ...over,
});

export const templeOf = (sim: VillageSim) => sim.buildings.find((b) => b.type === 'temple')!;

/** The `n` standing trees nearest the temple. */
export const treesNearTemple = (sim: VillageSim, n: number): number[] => {
  const temple = templeOf(sim);
  return sim.forest.nearest(temple.x, temple.z, n) as number[];
};

/** The standing tree nearest the temple. */
export const treeNearTemple = (sim: VillageSim): number => treesNearTemple(sim, 1)[0]!;

/** A ripe field of the hamlet (the farmers are not at work yet unless the sim has been stepped). */
export function ripeField(sim: VillageSim, growth = 1) {
  const field = sim.fields[0]!;
  field.growth = growth;
  return field;
}

/** Four grown sheep grazing round the temple, and the hand's view of them. */
export function farmOf(sim: VillageSim) {
  const t = templeOf(sim);
  const env: AnimalEnv = { walkable: () => true, scare: null };
  const flock = createFlock('sheep', t.x + 12, t.z, 6, 'hand-check');
  for (let i = 0; i < 4; i++) addAnimal(flock, env);
  for (let k = 0; k < 200; k++) stepFlock(flock, 0.02, env);
  const log: string[] = [];
  const animals: HandAnimals = {
    sheepWithin: (x, z, r, out) => animalsWithin(flock, x, z, r, out),
    lift: (id) => liftAnimal(flock, id),
    pose: (p) => log.push(`pose:${p.scale}:${p.y}`),
    release: (how) => {
      log.push(`release:${how}`);
      releaseAnimal(flock, how);
    },
    holding: () => flock.held !== null,
  };
  return { flock, env, animals, log };
}

/** A hamlet with a hand on it. Every call the hand makes to the view is written to `log`. */
export function handOn(sim: VillageSim, over: Partial<HandPorts> = {}, energy = 100) {
  const events: VillageEvent[] = [];
  const log: string[] = [];
  const poses: CarriedPose[] = [];
  const m = meter(energy);
  let orb = { x: 0, z: 0 };
  const ports: HandPorts = {
    energy: m.energy,
    orb: () => orb,
    village: {
      sim,
      uprootTree: (id) => sim.uprootTree(id, events),
      takeHarvest: (id) => sim.takeHarvest(id),
      haul: (siteId, wood) => sim.haul(siteId, wood, events),
      haulRemote: (siteId, wood) => sim.haulRemote(siteId, wood, events),
      carry: {
        lift: (what, id) => {
          log.push(`lift:${what}:${id}`);
          return true;
        },
        pose: (what, id, pose) => {
          log.push(`pose:${what}:${id}`);
          poses.push(pose);
        },
        release: (what, id, putBack) => {
          log.push(`release:${what}:${id}:${putBack}`);
        },
      },
    },
    deeds: {
      villagers: sim.villagers,
      addBelief: (i, amount) => sim.addBelief(i, amount, events),
      notice: sim.notice,
    },
    ...over,
  };
  const hand = createHandRuntime(ports);
  const standing = (id: number) => sim.forest.isStanding(id);
  const treeAt = (id: number) => {
    const t = sim.forest.info(id);
    return { x: t.x, z: t.z };
  };
  return {
    sim,
    hand,
    log,
    poses,
    events,
    state: m.state,
    standing,
    treeAt,
    moveTo: (at: { x: number; z: number }) => {
      orb = at;
    },
  };
}
