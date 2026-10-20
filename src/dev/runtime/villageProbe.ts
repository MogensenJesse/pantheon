// src/dev/runtime/villageProbe.ts — DEV console hook: window.__pantheonVillage

import { VILLAGE } from '../../config/village';
import { templeOf } from '../../world/village/model/buildings';
import {
  Anim,
  type AnimId,
  ROLE_COUNT,
  Role,
  type RoleId,
  Sex,
  type SexId,
  WORK_ANIM,
} from '../../world/village/model/types';
import { kitLook } from '../../world/village/render/villageKitLook';
import type { LineupFigure } from '../../world/village/render/villagerRenderer';
import { localToWorld } from '../../world/village/sim/geometry';
import type { VillageSystemContext } from '../../world/village/VillageSystem';
import { villageDevState } from '../../world/village/villageDevState';
import { installDevHook } from './devHook';

/**
 * Install `window.__pantheonVillage`: inspect the village and drive its time and faith from the
 * console. Returns a disposer that removes the hook.
 */
export function initVillageProbe(village: VillageSystemContext): () => void {
  const round = (v: number) => Math.round(v * 10) / 10;

  const removeHook = installDevHook('__pantheonVillage', {
    stats: () => village.sim.stats(),
    buildings: () =>
      village.sim.buildings.map((b) => ({
        id: b.id,
        type: b.type,
        stage: b.stage,
        progress: round(b.progress),
        x: round(b.x),
        z: round(b.z),
        plinthM: round(b.plinthTopY - b.plinthBaseY),
      })),
    fields: () =>
      village.sim.fields.map((f) => ({
        id: f.id,
        x: round(f.x),
        z: round(f.z),
        rotY: round(f.rotY),
        halfW: f.halfW,
        halfD: f.halfD,
        growth: Math.round(f.growth * 100) / 100,
      })),
    /** Ring layout check: where each building sits against its ring and how far its door is off the temple. */
    layout: () => {
      const { sim } = village;
      const { seed, rings } = sim;
      const deg = (rad: number) => Math.round((rad * 180) / Math.PI);
      const rows = sim.buildings
        .filter((b) => b.ring >= 0)
        .map((b) => {
          const toTemple = Math.atan2(seed.x - b.x, seed.z - b.z);
          const off = Math.atan2(Math.sin(toTemple - b.rotY), Math.cos(toTemple - b.rotY));
          return {
            id: b.id,
            type: b.type,
            ring: b.ring,
            fromTempleM: round(Math.hypot(b.x - seed.x, b.z - seed.z)),
            offRingM: round(rings.nearestRing(b.x, b.z).offset),
            doorOffTempleDeg: deg(off),
          };
        });
      console.table(rows);
      const facing = rows.filter((r) => Math.abs(r.doorOffTempleDeg) <= 30).length;
      return {
        rings: sim.stats().ringCounts,
        facingTemple: `${facing}/${rows.length}`,
        network: sim.stats().network,
      };
    },
    setTimeScale: (scale: number) => {
      villageDevState.timeScale = Math.max(0, Math.min(256, scale));
    },
    forcePresence: (on: boolean) => {
      villageDevState.forcePresence = on;
    },
    /** Force the rain the village feels, 0..1 (above 0.3 everyone but the priests goes home); null follows the weather. */
    setRain: (rain01: number | null) => {
      villageDevState.rain01 = rain01 === null ? null : Math.max(0, Math.min(1, rain01));
    },
    /** The rain the village feels now. */
    rain: () => village.rain(),
    /** Run the village on a day-cycle phase (0 midnight, 0.25 sunrise, 0.5 noon, 0.75 sunset); null follows the sun. */
    setDayPhase: (phase: number | null) => {
      villageDevState.forceDayPhase = phase;
    },
    /** Live look of the modelled kit: shade lift 0..1 and colour gain (no argument = read them). */
    kitLook: (look: { shade?: number; gain?: number } = {}) => {
      if (look.shade !== undefined) kitLook.shade.value = look.shade;
      if (look.gain !== undefined) kitLook.gain.value = look.gain;
      return { shade: kitLook.shade.value, gain: kitLook.gain.value };
    },
    /** Who lives here: villagers per role (and women), plus up to `limit` of one role with their pose and place. */
    people: (role?: number, limit = 8) => {
      const v = village.sim.villagers;
      const perRole = new Array<number>(ROLE_COUNT).fill(0);
      let women = 0;
      const some: Record<string, number | boolean>[] = [];
      for (let i = 0; i < v.count; i++) {
        perRole[v.role[i]!]!++;
        if (v.sex[i] === Sex.Female) women++;
        if (role !== undefined && v.role[i] === role && some.length < limit) {
          some.push({
            i,
            sex: v.sex[i]!,
            anim: v.anim[i]!,
            indoors: v.indoors[i] === 1,
            x: round(v.x[i]!),
            z: round(v.z[i]!),
          });
        }
      }
      return { count: v.count, women, perRole, some };
    },
    /**
     * Stand every figure (each role, men in the front row, women behind) to review the models (`sexes` [0] or [1] for one row only): `pose` 'work' gives
     * each role its own work pose (the default), a number one `Anim` id for all (0 idle, 1 walk, 3 pray ...); null
     * removes the row. The row stands before the temple door, or along x at `at` facing +z (the default camera's
     * view). Returns the number of figures.
     */
    lineup: (
      pose: 'work' | number | null = 'work',
      at?: { x: number; z: number },
      sexes: readonly SexId[] = [Sex.Male, Sex.Female],
    ) => {
      const temple = templeOf(village.sim.buildings);
      if (pose === null || !temple) {
        village.dev.setLineup(null);
        return 0;
      }
      const figures: LineupFigure[] = [];
      for (const sex of sexes) {
        for (let role = 0; role < ROLE_COUNT; role++) {
          const workPose =
            role === Role.Priest
              ? Anim.Pray
              : (WORK_ANIM[role] ?? (role === Role.Idler ? Anim.Idle : Anim.Work));
          const across = (role - (ROLE_COUNT - 1) / 2) * 2.1;
          const [x, z] = at
            ? [at.x + across, at.z + (sex - sexes[0]!) * 2.8]
            : localToWorld(temple, across, 17 + (sex - sexes[0]!) * 2.8);
          figures.push({
            x,
            z,
            yaw: at ? 0 : temple.rotY + Math.PI,
            role: role as RoleId,
            sex,
            anim: pose === 'work' ? workPose : (pose as AnimId),
            variant: ((role * 2 + sex) * 23) % 72,
          });
        }
      }
      village.dev.setLineup(figures);
      return figures.length;
    },
    /** Who believes: counts, the elder, the share, and whether the village is converted. */
    belief: () => {
      const { sim } = village;
      const s = sim.stats();
      return {
        mode: sim.mode,
        converted: sim.converted,
        elder: sim.elder,
        believers: s.believers,
        villagers: s.villagers,
        share: Math.round(sim.beliefShare() * 100) / 100,
        faith: Math.round(sim.faith.faith * 100) / 100,
        rate: Math.round(sim.faith.rate * 1000) / 1000,
      };
    },
    /** Raise one villager's belief (by index); true when it just reached 1. */
    addBelief: village.addBelief,
    /** Convert the hamlet at once (skips the quest): growth opens, phase 2 and the sparks follow. */
    convertNow: village.convert,
    /** Make villagers believe until `count` do: the elder first (or last with `elderFirst` false), then the rest in order. */
    believe: (count: number, elderFirst = true) => {
      const { sim } = village;
      const n = sim.villagers.count;
      const others = [...Array(n).keys()].filter((i) => i !== sim.elder);
      const order = elderFirst ? [sim.elder, ...others] : [...others, sim.elder];
      let done = 0;
      for (const i of order) {
        if (sim.believers() >= count) break;
        if (i >= 0 && village.addBelief(i, 1)) done++;
      }
      return done;
    },
    addFaith: village.dev.addFaith,
    /** Wood and food: what is in store, what the stores hold, and what a day's eating costs. */
    economy: () => {
      const s = village.sim.stats();
      return {
        wood: round(s.wood),
        food: round(s.food),
        woodCap: s.woodCap,
        foodCap: s.foodCap,
        foodPerDay: s.foodPerDay,
        hungry: village.sim.economy.hungry,
      };
    },
    /** Hunger (M5): the stage, the build-up in game days, who is dying, the graves. */
    hunger: () => {
      const s = village.sim.stats();
      return {
        stage: s.hunger,
        days: round(village.sim.hunger.level / VILLAGE.ECONOMY.DAY_S),
        dying: s.dying,
        graves: s.graves,
        villagers: s.villagers,
      };
    },
    graves: () => village.sim.graves.map((g) => ({ x: round(g.x), z: round(g.z) })),
    /** The forest (M6): trees standing, falling, stumps and saplings. */
    forest: () => village.sim.forest.counts(),
    /** Fell the `n` standing trees nearest (x, z) (default: the village centre); returns how many fell. */
    fell: (n = 10, x = village.sim.seed.x, z = village.sim.seed.z) => village.dev.fellNear(x, z, n),
    starve: village.dev.starve,
    killOne: village.dev.killOne,
    addWood: village.dev.addWood,
    addFood: village.dev.addFood,
    spawnVillagers: village.dev.spawnVillagers,
    startSite: village.dev.startSite,
    completeSites: village.dev.completeSites,
  });

  return removeHook;
}
