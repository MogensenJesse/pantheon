// src/world/village/sim/agentTargets.ts — where villagers go: work slots, fields, the temple and wander spots
import { VILLAGE } from '../../../config/village.ts';
import type { VillageAssetMeta } from '../model/assetKeys.ts';
import { templeOf } from '../model/buildings.ts';
import {
  type Building,
  type Field,
  type Villagers,
  WORK_SPOT_ID_BASE,
  type WorkSpot,
} from '../model/types.ts';
import { doorWorld as doorWorldOf, localToWorld, TWO_PI } from './geometry.ts';
import type { Pathfinder } from './pathfind.ts';
import type { SitePlan } from './planner.ts';
import type { WorkSpots } from './workSpots.ts';

const { VILLAGERS: V } = VILLAGE;
/** Each farmer already at a field counts like this many extra metres of walking. */
const FIELD_LOAD_COST_M = 12;
/** The same for a worker already at a tree or shore, plus a roll so workers spread over the nearest few. */
const SPOT_LOAD_COST_M = 12;
const SPOT_ROLL_M = 20;

export interface AgentTargetsOptions {
  pool: Villagers;
  pathfinder: Pathfinder;
  rng: () => number;
  /** Live building list (the sim appends to it). */
  buildings: readonly Building[];
  /** Live field list (the sim appends to it). */
  fields: readonly Field[];
  metaOf: (type: Building['type']) => Pick<VillageAssetMeta, 'door' | 'workSlots'>;
  /** Trees and shores where ambient workers stand. */
  spots: WorkSpots;
  /** Whether a tree (its index in the forest) is standing: only those can be claimed, and by one woodcutter. */
  isStanding: (tree: number) => boolean;
  /** The graveyard plot, or null when there is none (priests have nothing to mourn at). */
  graveSite: () => SitePlan | null;
}

export interface AgentTargets {
  temple: () => Building | undefined;
  buildingOf: (id: number) => Building | undefined;
  /** World position `out` metres in front of a building's door. */
  doorWorld: (building: Building, out?: number) => [number, number];
  /** Free the work slot a villager holds. */
  releaseSlot: (i: number) => void;
  /** Nearest open site with a free work slot; claims it and returns the slot's world position. */
  claimSlot: (i: number) => [number, number] | null;
  /** A spot just outside the nearest field's rows, where a farmer stands to tend it. */
  claimField: (i: number) => [number, number] | null;
  /** A reachable standing spot at a tree (woodcutter) or on the shore (fisherman); claims it. */
  claimTree: (i: number) => [number, number] | null;
  claimShore: (i: number) => [number, number] | null;
  /** The point a working villager faces: its site, field, tree or water. */
  focusOf: (i: number) => [number, number] | null;
  /** The tree or shore spot a villager is working at, or undefined. */
  spotOf: (i: number) => WorkSpot | undefined;
  prayerSpot: () => [number, number] | null;
  /** A walkable spot to stroll to, on or beside a path most of the time. */
  wanderSpot: (fromX: number, fromZ: number) => [number, number] | null;
  /** A walkable spot on the plaza around the temple (idlers' strolls, and a meal for someone without a home). */
  plazaSpot: (fromX: number, fromZ: number) => [number, number] | null;
  /** A walkable spot in the graveyard plot, where a priest stands to mourn; null with no plot or no way in. */
  mournSpot: (fromX: number, fromZ: number) => [number, number] | null;
  /**
   * Work out who holds which slot and spot from the pool (`slot` and `target` of each villager). The
   * claims are exactly that, so a save only keeps the pool and calls this after restoring it.
   */
  rebuildClaims: () => void;
}

export function createAgentTargets(o: AgentTargetsOptions): AgentTargets {
  const { pool, pathfinder, rng, buildings, fields, metaOf, spots, isStanding, graveSite } = o;
  const byId = new Map<number, Building>();
  const syncIndex = () => {
    if (byId.size === buildings.length) return;
    for (const b of buildings) byId.set(b.id, b);
  };
  /** Work-slot owners per site: villager index + 1, 0 = free. */
  const slotOwners = new Map<number, Int32Array>();
  const temple = () => templeOf(buildings);
  const buildingOf = (id: number) => {
    syncIndex();
    return byId.get(id);
  };

  const doorWorld = (b: Building, out = 0): [number, number] =>
    doorWorldOf(b, metaOf(b.type).door, out);

  /** Workers per tree or shore spot id. */
  const spotLoad = new Map<number, number>();
  const spotById = new Map<number, WorkSpot>();
  for (const spot of [...spots.trees, ...spots.shores]) spotById.set(spot.id, spot);
  const isSpotTarget = (target: number) => target <= -WORK_SPOT_ID_BASE;

  const releaseSlot = (i: number) => {
    const slot = pool.slot[i]!;
    const target = pool.target[i]!;
    if (slot >= 0 && isSpotTarget(target)) {
      spotLoad.set(-target, (spotLoad.get(-target) ?? 1) - 1);
    } else if (slot >= 0) {
      const owners = slotOwners.get(target);
      if (owners) owners[slot] = 0;
    }
    pool.slot[i] = -1;
  };

  /** Nearest open site with a free work slot; claims it and returns the slot's world position. */
  const claimSlot = (i: number): [number, number] | null => {
    let best: Building | null = null;
    let bestSlot = -1;
    let bestD = Number.POSITIVE_INFINITY;
    for (const site of buildings) {
      if (site.stage >= 2) continue;
      const owners = slotOwners.get(site.id) ?? new Int32Array(VILLAGE.CONSTRUCTION.SLOTS_PER_SITE);
      slotOwners.set(site.id, owners);
      const free = owners.indexOf(0);
      if (free < 0) continue;
      const d = (site.x - pool.x[i]!) ** 2 + (site.z - pool.z[i]!) ** 2;
      if (d < bestD) {
        bestD = d;
        best = site;
        bestSlot = free;
      }
    }
    if (!best) return null;
    slotOwners.get(best.id)![bestSlot] = i + 1;
    pool.target[i] = best.id;
    pool.slot[i] = bestSlot;
    const slots = metaOf(best.type).workSlots;
    const [lx, lz] = slots[bestSlot % slots.length]!;
    return localToWorld(best, lx, lz);
  };

  /** A spot just outside the nearest field's rows, where a farmer stands to tend it. */
  const claimField = (i: number): [number, number] | null => {
    let best: Field | null = null;
    let bestCost = Number.POSITIVE_INFINITY;
    for (const field of fields) {
      let load = 0;
      for (let k = 0; k < pool.count; k++) {
        if (pool.target[k] === -field.id && pool.slot[k]! >= 0) load++;
      }
      // Distance plus a penalty per farmer already there, so the fields share the work.
      const cost =
        Math.hypot(field.x - pool.x[i]!, field.z - pool.z[i]!) +
        load * FIELD_LOAD_COST_M +
        rng() * 5;
      if (cost < bestCost) {
        bestCost = cost;
        best = field;
      }
    }
    if (!best) return null;
    pool.target[i] = -best.id;
    pool.slot[i] = 0;
    const edge = 1.3;
    const along = rng() * 2 - 1;
    const side = Math.floor(rng() * 4);
    const [lx, lz] =
      side === 0
        ? [along * best.halfW, best.halfD + edge]
        : side === 1
          ? [along * best.halfW, -best.halfD - edge]
          : side === 2
            ? [best.halfW + edge, along * best.halfD]
            : [-best.halfW - edge, along * best.halfD];
    return localToWorld(best, lx, lz);
  };

  /** The spot nearest the villager that it can walk to, with a penalty per worker there and a roll. */
  const claimSpot = (i: number, list: readonly WorkSpot[]): [number, number] | null => {
    const region = pathfinder.regionOf(pool.x[i]!, pool.z[i]!);
    let best: WorkSpot | null = null;
    let bestCost = Number.POSITIVE_INFINITY;
    for (const spot of list) {
      if (spot.tree !== undefined) {
        // A tree is chopped by one woodcutter at a time, and only while it stands.
        if (!isStanding(spot.tree)) continue;
        if ((spotLoad.get(spot.id) ?? 0) > 0) continue;
      }
      const cost =
        Math.hypot(spot.x - pool.x[i]!, spot.z - pool.z[i]!) +
        (spotLoad.get(spot.id) ?? 0) * SPOT_LOAD_COST_M +
        rng() * SPOT_ROLL_M;
      if (cost >= bestCost) continue;
      if (
        !pathfinder.isWalkable(spot.x, spot.z) ||
        pathfinder.regionOf(spot.x, spot.z) !== region
      ) {
        continue;
      }
      bestCost = cost;
      best = spot;
    }
    if (!best) return null;
    spotLoad.set(best.id, (spotLoad.get(best.id) ?? 0) + 1);
    pool.target[i] = -best.id;
    pool.slot[i] = 0;
    return [best.x, best.z];
  };

  const focusOf = (i: number): [number, number] | null => {
    const target = pool.target[i]!;
    if (target > 0) {
      const site = buildingOf(target);
      return site ? [site.x, site.z] : null;
    }
    if (isSpotTarget(target)) {
      const spot = spotById.get(-target);
      return spot ? [spot.faceX, spot.faceZ] : null;
    }
    const field = fields.find((f) => f.id === -target);
    return field ? [field.x, field.z] : null;
  };

  const prayerSpot = (): [number, number] | null => {
    const t = temple();
    if (!t) return null;
    const [, doorZ] = metaOf(t.type).door;
    return localToWorld(t, (rng() - 0.5) * 7, doorZ + 2.2 + rng() * 3);
  };

  /**
   * A spot to stroll to, `minR` to `minR + spanR` metres around (ax, az), in the region the villager is in.
   * Most strolls head for a spot on or beside a path; the rest go anywhere walkable.
   */
  const strollSpot = (
    ax: number,
    az: number,
    minR: number,
    spanR: number,
    fromX: number,
    fromZ: number,
  ): [number, number] | null => {
    const here = pathfinder.regionOf(fromX, fromZ);
    const wantPath = rng() < VILLAGE.PATHS.WANDER_ON_PATH_SHARE;
    for (const onPathOnly of wantPath ? [true, false] : [false]) {
      for (let attempt = 0; attempt < (onPathOnly ? 10 : 6); attempt++) {
        const angle = rng() * TWO_PI;
        const r = minR + rng() * spanR;
        const x = ax + Math.sin(angle) * r;
        const z = az + Math.cos(angle) * r;
        if (!pathfinder.isWalkable(x, z)) continue;
        if (pathfinder.regionOf(x, z) !== here) continue;
        if (onPathOnly && pathfinder.pathinessAt(x, z) < VILLAGE.PATHS.ON_PATH_MIN) continue;
        return [x, z];
      }
    }
    return null;
  };

  const wanderSpot = (fromX: number, fromZ: number): [number, number] | null => {
    const anchor = buildings[Math.floor(rng() * buildings.length)];
    if (!anchor) return null;
    return strollSpot(anchor.x, anchor.z, 4, V.WANDER.RADIUS_M * 0.35, fromX, fromZ);
  };

  const plazaSpot = (fromX: number, fromZ: number): [number, number] | null => {
    const t = temple();
    if (!t) return null;
    return strollSpot(t.x, t.z, 3, V.PLAZA_RADIUS_M - 3, fromX, fromZ);
  };

  const mournSpot = (fromX: number, fromZ: number): [number, number] | null => {
    const site = graveSite();
    if (!site) return null;
    const here = pathfinder.regionOf(fromX, fromZ);
    for (let attempt = 0; attempt < 8; attempt++) {
      const [x, z] = localToWorld(
        site,
        (rng() - 0.5) * VILLAGE.GRAVEYARD.WIDTH_M,
        (rng() - 0.5) * VILLAGE.GRAVEYARD.DEPTH_M,
      );
      if (pathfinder.isWalkable(x, z) && pathfinder.regionOf(x, z) === here) return [x, z];
    }
    return null;
  };

  const rebuildClaims = () => {
    slotOwners.clear();
    spotLoad.clear();
    for (let i = 0; i < pool.count; i++) {
      const slot = pool.slot[i]!;
      if (slot < 0) continue;
      const target = pool.target[i]!;
      if (isSpotTarget(target)) {
        spotLoad.set(-target, (spotLoad.get(-target) ?? 0) + 1);
      } else if (target > 0) {
        const owners =
          slotOwners.get(target) ?? new Int32Array(VILLAGE.CONSTRUCTION.SLOTS_PER_SITE);
        owners[slot] = i + 1;
        slotOwners.set(target, owners);
      }
    }
  };

  return {
    temple,
    buildingOf,
    doorWorld,
    releaseSlot,
    claimSlot,
    claimField,
    claimTree: (i) => claimSpot(i, spots.trees),
    claimShore: (i) => claimSpot(i, spots.shores),
    focusOf,
    spotOf: (i) => {
      const target = pool.target[i]!;
      return isSpotTarget(target) ? spotById.get(-target) : undefined;
    },
    prayerSpot,
    wanderSpot,
    plazaSpot,
    mournSpot,
    rebuildClaims,
  };
}
