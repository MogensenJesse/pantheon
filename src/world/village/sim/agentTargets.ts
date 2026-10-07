// src/world/village/sim/agentTargets.ts — where villagers go: work slots, fields, the temple and wander spots
import { VILLAGE } from '../../../config/village.ts';
import type { VillageAssetMeta } from '../model/assetKeys.ts';
import type { Building, Field, Villagers } from '../model/types.ts';
import { localToWorld } from './geometry.ts';
import type { Pathfinder } from './pathfind.ts';

const { VILLAGERS: V } = VILLAGE;
/** Each farmer already at a field counts like this many extra metres of walking. */
const FIELD_LOAD_COST_M = 12;

export interface AgentTargetsOptions {
  pool: Villagers;
  pathfinder: Pathfinder;
  rng: () => number;
  /** Live building list (the sim appends to it). */
  buildings: readonly Building[];
  /** Live field list (the sim appends to it). */
  fields: readonly Field[];
  metaOf: (type: Building['type']) => Pick<VillageAssetMeta, 'door' | 'workSlots'>;
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
  prayerSpot: () => [number, number] | null;
  /** A walkable spot to stroll to, on or beside a path most of the time. */
  wanderSpot: (fromX: number, fromZ: number) => [number, number] | null;
}

export function createAgentTargets(o: AgentTargetsOptions): AgentTargets {
  const { pool, pathfinder, rng, buildings, fields, metaOf } = o;
  const byId = new Map<number, Building>();
  const syncIndex = () => {
    if (byId.size === buildings.length) return;
    for (const b of buildings) byId.set(b.id, b);
  };
  /** Work-slot owners per site: villager index + 1, 0 = free. */
  const slotOwners = new Map<number, Int32Array>();
  const temple = () => buildings.find((b) => b.type === 'temple');
  const buildingOf = (id: number) => {
    syncIndex();
    return byId.get(id);
  };

  const doorWorld = (b: Building, out = 0): [number, number] => {
    const [dx, dz] = metaOf(b.type).door;
    return localToWorld(b, dx, dz + out);
  };

  const releaseSlot = (i: number) => {
    const slot = pool.slot[i]!;
    if (slot >= 0) {
      const owners = slotOwners.get(pool.target[i]!);
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

  const prayerSpot = (): [number, number] | null => {
    const t = temple();
    if (!t) return null;
    const [, doorZ] = metaOf(t.type).door;
    return localToWorld(t, (rng() - 0.5) * 7, doorZ + 2.2 + rng() * 3);
  };

  const wanderSpot = (fromX: number, fromZ: number): [number, number] | null => {
    const anchor = buildings[Math.floor(rng() * buildings.length)];
    const here = pathfinder.regionOf(fromX, fromZ);
    if (!anchor) return null;
    // Most strolls head for a spot on or beside a path; the rest go anywhere walkable.
    const wantPath = rng() < VILLAGE.PATHS.WANDER_ON_PATH_SHARE;
    for (const onPathOnly of wantPath ? [true, false] : [false]) {
      for (let attempt = 0; attempt < (onPathOnly ? 10 : 6); attempt++) {
        const angle = rng() * Math.PI * 2;
        const r = 4 + rng() * (V.WANDER.RADIUS_M * 0.35);
        const x = anchor.x + Math.sin(angle) * r;
        const z = anchor.z + Math.cos(angle) * r;
        if (!pathfinder.isWalkable(x, z)) continue;
        if (pathfinder.regionOf(x, z) !== here) continue;
        if (onPathOnly && pathfinder.pathinessAt(x, z) < 0.5) continue;
        return [x, z];
      }
    }
    return null;
  };

  return {
    temple,
    buildingOf,
    doorWorld,
    releaseSlot,
    claimSlot,
    claimField,
    prayerSpot,
    wanderSpot,
  };
}
