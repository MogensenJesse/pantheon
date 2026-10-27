// src/world/village/sim/founding.ts — how a new village begins (pure, node-runnable)
//
// The temple and its plaza, the well's spot and the plaza loop, then either a sandbox village (the first
// houses and the first villagers) or a hamlet (everything finished at once, and its people). A restored village
// skips all of this: its state holds everything founding would lay.

import { VILLAGE } from '../../../config/village.ts';
import type { VillageStage } from '../model/assetKeys.ts';
import type { VillageSeed } from '../model/seed.ts';
import { type Building, Role, type Villagers } from '../model/types.ts';
import type { Graveyard } from './graveyard.ts';
import type { PathNetwork } from './pathNetwork.ts';
import type { BuildingKind } from './planner.ts';
import type { Population } from './population.ts';
import { OCCUPANT, type SiteGrid, stampBuilding, stampFootprint } from './siteGrid.ts';
import type { SupportBuildings } from './support.ts';

const { PLAN, VILLAGERS, HAMLET } = VILLAGE;

export interface FoundingDeps {
  seed: Pick<VillageSeed, 'x' | 'z' | 'rotY'>;
  grid: SiteGrid;
  villagers: Pick<Villagers, 'count' | 'role'>;
  /** Seats a building and links its footpath. */
  place: (
    type: Building['type'],
    stage: VillageStage,
    x: number,
    z: number,
    rotY: number,
  ) => Building;
  /** Planner passes for a `kind` of building, up to `attempts` times. */
  planWithRetries: (kind: BuildingKind, stage: VillageStage, attempts: number) => void;
  support: Pick<SupportBuildings, 'reserveWell' | 'seedHamlet'>;
  network: Pick<PathNetwork, 'layPlaza'>;
  graveyard: Pick<Graveyard, 'reserve'>;
  population: Pick<Population, 'spawn'>;
  /** Brings the footpaths' wear in step with the paths just laid. */
  syncPathWear: () => void;
}

/** The two villagers a hamlet's story hangs on, as pool indexes (-1 when the pool holds none of that kind). */
export interface HamletFolk {
  elder: number;
  aera: number;
}

export interface Founding {
  /**
   * A sandbox village: the first houses (the first one built, the second a foundation), and the first
   * villagers.
   */
  foundVillage: () => void;
  /**
   * A hamlet: everything finished at once (the houses, the fields, the well), and the people with no
   * builders among them, since there is nothing to build until the village converts. The first priest is
   * the elder; Aera is the first idler (the youngest hand with no trade), whoever else the village holds.
   */
  foundHamlet: () => HamletFolk;
}

export function createFounding(deps: FoundingDeps): Founding {
  const { seed, grid, villagers, place, planWithRetries, support, network, graveyard, population } =
    deps;

  /** The temple and its plaza, the well's spot and the plaza loop. */
  const foundTemple = () => {
    const temple0 = place('temple', 2, seed.x, seed.z, seed.rotY);
    stampFootprint(
      grid,
      OCCUPANT.PLAZA,
      temple0.x,
      temple0.z,
      temple0.rotY,
      temple0.halfW,
      temple0.halfD,
      PLAN.PLAZA_M,
    );
    stampBuilding(grid, temple0, PLAN.SPACING_M);
    support.reserveWell();
    network.layPlaza(temple0);
    deps.syncPathWear();
  };

  return {
    foundVillage: () => {
      foundTemple();
      planWithRetries('house', 2, 6);
      planWithRetries('house', 0, 6);
      graveyard.reserve();
      for (let n = 0; n < VILLAGERS.START; n++) population.spawn();
      deps.syncPathWear();
    },
    foundHamlet: () => {
      foundTemple();
      for (let n = 0; n < HAMLET.HOUSES; n++) planWithRetries('house', 2, 6);
      support.seedHamlet([], HAMLET.FIELDS);
      graveyard.reserve();
      for (let n = 0; n < HAMLET.VILLAGERS; n++) population.spawn({ builders: false });
      deps.syncPathWear();
      let elder = -1;
      let aera = -1;
      for (let i = 0; i < villagers.count; i++) {
        if (villagers.role[i] === Role.Priest) {
          elder = i;
          break;
        }
      }
      for (let i = 0; i < villagers.count; i++) {
        if (i !== elder && villagers.role[i] === Role.Idler) {
          aera = i;
          break;
        }
      }
      return { elder, aera };
    },
  };
}
