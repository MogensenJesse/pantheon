// src/world/village/sim/population.ts — who lives in the village: roles, beds and newcomers
import { VILLAGE } from '../../../config/village.ts';
import { bedsOf, templeOf } from '../model/buildings.ts';
import {
  type Building,
  type Field,
  ROLE_COUNT,
  Role,
  type RoleId,
  type Villagers,
} from '../model/types.ts';
import { spawnVillager } from './villagerPool.ts';
import type { WorkSpots } from './workSpots.ts';

export interface PopulationOptions {
  villagers: Villagers;
  /** Live building list (the sim appends to it). */
  buildings: readonly Building[];
  /** Live field list (the sim appends to it). */
  fields: readonly Field[];
  rng: () => number;
  /** World position `out` metres in front of a building's door. */
  doorstep: (building: Building, out: number) => [number, number];
  /** Trees and shores to work at: a role is only handed out when its workplace exists. */
  spots: WorkSpots;
}

export interface Population {
  /**
   * A newcomer appears at the temple door and is given a bed; false when nobody can be added. A hamlet
   * with nothing to build has no builders (`builders: false`); `belief` 1 makes the newcomer a believer.
   */
  spawn: (options?: { builders?: boolean; belief?: number }) => boolean;
  totalBeds: () => number;
  /** Below the population cap and with a free bed. */
  hasRoom: () => boolean;
  /** When a field appears, idlers take up farming until the quota is met. */
  promoteFarmers: () => void;
  /** Whether anyone lives in the building (the temple always counts): lit windows follow this. */
  isOccupied: (buildingId: number) => boolean;
  /** Count residents per building from the pool's `home`; call after the pool is restored. */
  rebuildResidents: () => void;
}

const { VILLAGERS } = VILLAGE;

export function createPopulation(o: PopulationOptions): Population {
  const { villagers, buildings, fields, rng, doorstep, spots } = o;
  /** Residents per building id. */
  const residents = new Map<number, number>();

  const temple = () => templeOf(buildings);
  const totalBeds = () => buildings.reduce((sum, b) => sum + bedsOf(b), 0);

  /** First finished building with a free bed (the temple takes the overflow). */
  const assignHome = (): number => {
    for (const b of buildings) {
      if (b.type !== 'temple' && (residents.get(b.id) ?? 0) < bedsOf(b)) return b.id;
    }
    return temple()?.id ?? 0;
  };

  const pickRole = (builders: boolean): RoleId => {
    const pop = villagers.count;
    const count = new Array<number>(ROLE_COUNT).fill(0);
    for (let i = 0; i < pop; i++) count[villagers.role[i]!]!++;
    const quota = (share: number) => Math.ceil((pop + 1) * share);
    if (count[Role.Priest]! * VILLAGERS.PEOPLE_PER_PRIEST < pop + 1) return Role.Priest;
    if (builders && count[Role.Builder]! < quota(VILLAGERS.BUILDER_SHARE)) return Role.Builder;
    if (fields.length > 0 && count[Role.Farmer]! < quota(VILLAGE.FIELDS.FARMER_SHARE)) {
      return Role.Farmer;
    }
    if (spots.trees.length > 0 && count[Role.Woodcutter]! < quota(VILLAGERS.WOODCUTTER_SHARE)) {
      return Role.Woodcutter;
    }
    if (spots.shores.length > 0 && count[Role.Fisherman]! < quota(VILLAGERS.FISHERMAN_SHARE)) {
      return Role.Fisherman;
    }
    return Role.Idler;
  };

  return {
    totalBeds,
    rebuildResidents: () => {
      residents.clear();
      for (let i = 0; i < villagers.count; i++) {
        const home = villagers.home[i]!;
        residents.set(home, (residents.get(home) ?? 0) + 1);
      }
    },
    hasRoom: () => villagers.count < VILLAGERS.MAX && villagers.count < totalBeds(),
    isOccupied: (buildingId) =>
      buildings.find((b) => b.id === buildingId)?.type === 'temple' ||
      (residents.get(buildingId) ?? 0) > 0,
    promoteFarmers: () => {
      let farmers = 0;
      for (let i = 0; i < villagers.count; i++) if (villagers.role[i] === Role.Farmer) farmers++;
      const quota = Math.ceil(villagers.count * VILLAGE.FIELDS.FARMER_SHARE);
      for (let i = 0; i < villagers.count && farmers < quota; i++) {
        if (villagers.role[i] === Role.Idler) {
          villagers.role[i] = Role.Farmer;
          farmers++;
        }
      }
    },
    spawn: (options) => {
      const t = temple();
      if (!t) return false;
      const role = pickRole(options?.builders ?? true);
      const home = role === Role.Priest ? t.id : assignHome();
      residents.set(home, (residents.get(home) ?? 0) + 1);
      const [x, z] = doorstep(t, VILLAGE.PATH.DOORSTEP_M + 1);
      return spawnVillager(villagers, rng, x, z, role, home, options?.belief ?? 0) >= 0;
    },
  };
}
