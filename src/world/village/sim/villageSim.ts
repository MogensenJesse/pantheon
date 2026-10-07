// src/world/village/sim/villageSim.ts — village state and growth: founding, faith, site planning, construction
import { VILLAGE } from '../../../config/village.ts';
import type { VillageStage } from '../assets/villageAssetKeys.ts';
import { applyWork, ghostWorkPerSite, isOpenSite } from './construction.ts';
import {
  createFaithState,
  type FaithInputs,
  type FaithState,
  siteCost,
  stepFaith,
} from './faith.ts';
import { seatBuilding } from './founding.ts';
import { chooseNextType, type PlanContext, pickSpokes, planSite, type Spoke } from './planner.ts';
import { createSiteGrid, type SiteGrid, stampBuilding } from './siteGrid.ts';
import type { TerrainSampler } from './terrainSampler.ts';
import { createVillageRngs } from './villageRng.ts';
import type { Building, FootprintOf } from './villageTypes.ts';

export interface VillageSeed {
  x: number;
  z: number;
  rotY: number;
  radiusM: number;
  /** RNG seed. */
  id: number;
}

export type VillageEvent =
  | { kind: 'siteStarted'; building: Building }
  | { kind: 'stageCompleted'; building: Building; stage: VillageStage };

export interface VillageStats {
  buildings: number;
  openSites: number;
  finished: number;
  faith: number;
  rate: number;
  boost01: number;
  dwell01: number;
  reliefRelax: number;
  failedPasses: number;
}

export interface VillageSim {
  readonly seed: VillageSeed;
  readonly buildings: readonly Building[];
  readonly faith: FaithState;
  readonly grid: SiteGrid;
  readonly spokes: readonly Spoke[];
  /** Advance by dt seconds of village time; new events are appended to `events`. */
  update: (dt: number, inputs: FaithInputs, events: VillageEvent[]) => void;
  stats: () => VillageStats;
  /** DEV helpers. */
  addFaith: (amount: number) => void;
  startSiteNow: (events: VillageEvent[]) => boolean;
  completeOpenSites: (events: VillageEvent[]) => void;
}

interface VillageSimOptions {
  sampler: TerrainSampler;
  footprintOf: FootprintOf;
  seed: VillageSeed;
}

const { PLAN } = VILLAGE;

export function createVillageSim(options: VillageSimOptions): VillageSim {
  const { sampler, footprintOf, seed } = options;
  const rngs = createVillageRngs(seed.id);
  const grid = createSiteGrid(sampler, seed.x, seed.z, seed.radiusM, PLAN.CELL_M);
  const spokes = pickSpokes(rngs.plan, seed.rotY, seed.radiusM);
  const faith = createFaithState();
  const buildings: Building[] = [];
  let nextId = 1;
  let planTimer = 0;
  let failedPasses = 0;
  let reliefRelax = 1;

  const context = (): PlanContext => ({
    sampler,
    grid,
    centerX: seed.x,
    centerZ: seed.z,
    radiusM: seed.radiusM,
    spokes,
    buildings,
    footprintOf,
    rng: rngs.plan,
    reliefRelax,
  });

  const homesCount = () => buildings.filter((b) => b.type !== 'temple').length;

  const place = (
    type: Building['type'],
    stage: VillageStage,
    x: number,
    z: number,
    rotY: number,
  ) => {
    const building = seatBuilding(sampler, footprintOf, nextId++, type, stage, x, z, rotY);
    buildings.push(building);
    stampBuilding(grid, building, PLAN.SPACING_M);
    return building;
  };

  /** One planner pass; returns the new site or null (and tracks failures to relax the relief limit). */
  const plan = (type: Building['type'], stage: VillageStage): Building | null => {
    const site = planSite(context(), type);
    if (site) {
      failedPasses = 0;
      reliefRelax = Math.max(1, reliefRelax / PLAN.RELIEF_RELAX_STEP);
    } else {
      failedPasses++;
      if (failedPasses % PLAN.FAILS_PER_RELAX === 0) {
        const cap = PLAN.RELIEF_RELAX_CAP_M / PLAN.MAX_RELIEF_M;
        reliefRelax = Math.min(cap, reliefRelax * PLAN.RELIEF_RELAX_STEP);
      }
      return null;
    }
    return place(type, stage, site.x, site.z, site.rotY);
  };

  const planWithRetries = (type: Building['type'], stage: VillageStage, attempts: number) => {
    for (let attempt = 0; attempt < attempts; attempt++) {
      if (plan(type, stage)) return;
    }
  };

  const openSites = () => buildings.filter(isOpenSite);

  const startSite = (events: VillageEvent[], free: boolean): boolean => {
    if (openSites().length >= PLAN.MAX_ACTIVE_SITES || buildings.length >= PLAN.MAX_BUILDINGS) {
      return false;
    }
    const cost = siteCost(homesCount());
    if (!free && faith.faith < cost) return false;
    const building = plan(chooseNextType(buildings, rngs.plan), 0);
    if (!building) return false;
    if (!free) faith.faith -= cost;
    events.push({ kind: 'siteStarted', building });
    return true;
  };

  const complete = (site: Building, events: VillageEvent[]) => {
    for (const done of applyWork(site, Number.POSITIVE_INFINITY)) {
      events.push({ kind: 'stageCompleted', building: done.building, stage: done.stage });
    }
  };

  // Founding: the temple stands finished on the seed, one house beside it, one site under way.
  const temple = place('temple', 2, seed.x, seed.z, seed.rotY);
  stampBuilding(grid, temple, PLAN.PLAZA_M);
  planWithRetries('house_a', 2, 6);
  planWithRetries('house_b', 0, 6);

  return {
    seed,
    buildings,
    faith,
    grid,
    spokes,
    update: (dt, inputs, events) => {
      stepFaith(faith, dt, inputs);
      const work = ghostWorkPerSite(openSites().length, dt, faith.boost01);
      for (const site of openSites()) {
        for (const done of applyWork(site, work)) {
          events.push({ kind: 'stageCompleted', building: done.building, stage: done.stage });
        }
      }
      planTimer += dt;
      if (planTimer >= PLAN.INTERVAL_S) {
        planTimer = 0;
        startSite(events, false);
      }
    },
    stats: () => ({
      buildings: buildings.length,
      openSites: openSites().length,
      finished: buildings.filter((b) => b.stage === 2).length,
      faith: faith.faith,
      rate: faith.rate,
      boost01: faith.boost01,
      dwell01: faith.dwell01,
      reliefRelax,
      failedPasses,
    }),
    addFaith: (amount) => {
      faith.faith += amount;
    },
    startSiteNow: (events) => startSite(events, true),
    completeOpenSites: (events) => {
      for (const site of openSites()) complete(site, events);
    },
  };
}
