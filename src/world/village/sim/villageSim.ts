// src/world/village/sim/villageSim.ts — village state and growth: founding, faith, sites, people, construction

import { VILLAGE } from '../../../config/village.ts';
import type { VillageAssetMeta, VillageStage } from '../model/assetKeys.ts';
import type { VillageSeed } from '../model/seed.ts';
import type { Building, Field, VillageEvent, Villagers, WorkSpot } from '../model/types.ts';
import { type AgentInputs, type AgentStats, type AgentsState, createAgents } from './agents.ts';
import { applyWork, isOpenSite } from './construction.ts';
import {
  createFaithState,
  type FaithInputs,
  type FaithState,
  siteCost,
  stepFaith,
} from './faith.ts';
import { localToWorld } from './geometry.ts';
import { createPathfinder, type Pathfinder, type PathfinderStats } from './pathfind.ts';
import { createPathinessSync } from './pathiness.ts';
import {
  createPathNetwork,
  type PathNetwork,
  type PathNetworkState,
  type PathNetworkStats,
} from './pathNetwork.ts';
import { type BuildingKind, chooseNextKind, type PlanContext, planBuilding } from './planner.ts';
import { createPopulation } from './population.ts';
import { createRingModel, measureContour, type RingModel } from './ringModel.ts';
import {
  createSiteGrid,
  OCCUPANT,
  type SiteGrid,
  siteGridSize,
  stampBuilding,
  stampFootprint,
} from './siteGrid.ts';
import { seatBuilding } from './siting.ts';
import { createSupportBuildings, FIELD_BLOCK_MARGIN_M, type SupportState } from './support.ts';
import type { TerrainSampler } from './terrainSampler.ts';
import { createVillageRngs, type RngState } from './villageRng.ts';
import {
  createVillagerPool,
  restoreVillagers,
  serializeVillagers,
  type VillagersState,
  villagersStateProblem,
} from './villagerPool.ts';
import { createWearField, type WearField, type WearState, wearFieldSize } from './wearField.ts';
import { createWorkSpots, type TreePoint, type WorkSpots } from './workSpots.ts';

/**
 * The whole sim as a save keeps it: plain structured-clone data. What is left out is rebuilt from the
 * map and the seed (site grid terrain, walkable regions, ring model, work spots) or from this state
 * (pathfinder blocks, residents, work-slot claims).
 */
export type VillageSimState = {
  /** The village seed's id: a save only fits the village it was made in. */
  seedId: number;
  nextId: number;
  planTimer: number;
  spawnTimer: number;
  wearSync: number;
  failedPasses: number;
  reliefRelax: number;
  ringFails: number[];
  buildings: Building[];
  fields: Field[];
  faith: FaithState;
  villagers: VillagersState;
  /** Site-grid occupancy: buildings, fields, the plaza and the reserved well spot. */
  occupant: Int32Array;
  /** What the searches currently read; it lags the wear by up to one sync. */
  pathiness: Float32Array | null;
  wear: WearState;
  network: PathNetworkState;
  support: SupportState;
  agents: AgentsState;
  rng: { plan: RngState; agents: RngState };
};

/**
 * Why a saved village cannot continue on this map and seed, or null when it can. Pure, so the game
 * can refuse a save before it changes anything (the map or the tunables may have changed since).
 */
export function villageStateProblem(state: VillageSimState, seed: VillageSeed): string | null {
  if (state.seedId !== seed.id) return 'this save belongs to a different village seed';
  const cells = siteGridSize(seed.radiusM, VILLAGE.PLAN.CELL_M) ** 2;
  const wearCells = wearFieldSize(seed.radiusM + VILLAGE.WEAR.MARGIN_M) ** 2;
  if (
    state.occupant.length !== cells ||
    (state.pathiness !== null && state.pathiness.length !== cells) ||
    state.wear.data.length !== wearCells ||
    state.wear.floor.length !== wearCells ||
    state.ringFails.length !== VILLAGE.RINGS.COUNT ||
    state.network.roadNodes.length !== VILLAGE.RINGS.COUNT
  ) {
    return 'this save does not fit the map it is loaded onto';
  }
  return villagersStateProblem(state.villagers);
}

export interface VillageSimInputs extends FaithInputs {
  /** Day-cycle phase 0..1 (0.25 sunrise). */
  dayPhase: number;
  /** Phase 0: the sun never rises, so some people keep vigil through the night. */
  vigil: boolean;
}

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
  villagers: number;
  beds: number;
  fields: number;
  agents: AgentStats;
  path: PathfinderStats;
  /** Laid footpaths: links, connectivity to the plaza. */
  network: PathNetworkStats;
  /** Buildings per ring, innermost first. */
  ringCounts: number[];
}

export interface VillageSim {
  readonly seed: VillageSeed;
  readonly buildings: readonly Building[];
  readonly villagers: Villagers;
  readonly fields: readonly Field[];
  readonly faith: FaithState;
  readonly grid: SiteGrid;
  readonly rings: RingModel;
  readonly pathfinder: Pathfinder;
  readonly wear: WearField;
  readonly network: PathNetwork;
  /** Where woodcutters and fishermen stand (empty lists when the map has no trees or shore nearby). */
  readonly workSpots: WorkSpots;
  /** Once per fixed update, before its sub-steps: remember positions for render interpolation. */
  beginStep: () => void;
  /** Advance by dt seconds of village time; new events are appended to `events`. */
  update: (dt: number, inputs: VillageSimInputs, events: VillageEvent[]) => void;
  stats: () => VillageStats;
  /** Whether anyone lives in the building (temple always counts): lit windows follow this. */
  isOccupied: (buildingId: number) => boolean;
  /** DEV helpers. */
  addFaith: (amount: number) => void;
  startSiteNow: (events: VillageEvent[]) => boolean;
  completeOpenSites: (events: VillageEvent[]) => void;
  spawnVillagers: (count: number) => number;
  /** A copy of the whole sim state (see `VillageSimState`); safe to keep while the sim runs on. */
  serialize: () => VillageSimState;
}

type MetaOf = (
  type: Building['type'],
) => Pick<VillageAssetMeta, 'footprint' | 'door' | 'workSlots'>;

interface VillageSimOptions {
  sampler: TerrainSampler;
  metaOf: MetaOf;
  seed: VillageSeed;
  /** Positions of the map's trees: woodcutters chop the ones near the village. */
  trees?: readonly TreePoint[];
  /** Continue a saved village instead of founding a new one (same map and seed). */
  restore?: VillageSimState;
}

const { PLAN, VILLAGERS } = VILLAGE;
const SPAWN_CHECK_S = 2;

export function createVillageSim(options: VillageSimOptions): VillageSim {
  const { sampler, metaOf, seed } = options;
  const footprintOf = (type: Building['type']) => metaOf(type).footprint;
  const rngs = createVillageRngs(seed.id);
  const grid = createSiteGrid(sampler, seed.x, seed.z, seed.radiusM, PLAN.CELL_M);
  const rings = createRingModel(
    rngs.plan,
    seed.x,
    seed.z,
    seed.rotY,
    measureContour(sampler.getY, seed.x, seed.z),
  );
  const ringFails = new Array<number>(rings.count).fill(0);
  const pathfinder = createPathfinder(grid);
  /** Walkable region the temple stands in: every site must be reachable from it. */
  const homeRegion = pathfinder.regionOf(seed.x, seed.z);
  /** Only trees and shores the villagers can walk to count as workplaces. */
  const found = createWorkSpots(grid, options.trees ?? [], seed.x, seed.z);
  const reachable = (spot: WorkSpot) =>
    homeRegion < 0 || pathfinder.regionOf(spot.x, spot.z) === homeRegion;
  const workSpots: WorkSpots = {
    trees: found.trees.filter(reachable),
    shores: found.shores.filter(reachable),
  };
  const wear = createWearField(seed.x, seed.z, seed.radiusM + VILLAGE.WEAR.MARGIN_M);
  const syncPathWear = createPathinessSync(grid, wear, pathfinder);
  let wearSync = 0;
  const faith = createFaithState();
  const villagers = createVillagerPool();
  const buildings: Building[] = [];
  const fields: Field[] = [];
  let nextId = 1;
  let planTimer = 0;
  let spawnTimer = 0;
  let failedPasses = 0;
  let reliefRelax = 1;
  /** Events emitted while agents work are appended here (set at the start of each update). */
  let sink: VillageEvent[] = [];

  const temple = () => buildings.find((b) => b.type === 'temple');

  /** World position `out` metres in front of a building's door. */
  const doorstep = (b: Building, out: number): [number, number] => {
    const [dx, dz] = metaOf(b.type).door;
    return localToWorld(b, dx, dz + out);
  };

  const population = createPopulation({
    villagers,
    buildings,
    fields,
    rng: rngs.agents,
    doorstep,
    spots: workSpots,
  });

  const network = createPathNetwork({
    pathfinder,
    wear,
    rings,
    rng: rngs.plan,
    doorstepOf: (b) => doorstep(b, VILLAGE.PATH.DOORSTEP_M),
    onLaid: syncPathWear,
  });

  const agents = createAgents({
    pool: villagers,
    pathfinder,
    rng: rngs.agents,
    buildings,
    fields,
    metaOf,
    spots: workSpots,
    onWalk: wear.walk,
    onWork: (site, seconds) => {
      for (const done of applyWork(site, seconds)) {
        sink.push({ kind: 'stageCompleted', building: done.building, stage: done.stage });
      }
    },
  });

  /** A site is only worth building on if the walk from the temple door is not a huge detour. */
  const walkOk = (x: number, z: number): boolean => {
    const t = temple();
    if (!t) return true;
    const [sx, sz] = doorstep(t, VILLAGE.PATH.DOORSTEP_M);
    const walk = pathfinder.walkEffort(sx, sz, x, z);
    return walk <= PLAN.MAX_WALK_DETOUR * Math.hypot(x - sx, z - sz) + PLAN.WALK_SLACK_M;
  };

  const context = (): PlanContext => ({
    sampler,
    grid,
    centerX: seed.x,
    centerZ: seed.z,
    radiusM: seed.radiusM,
    rings,
    ringFails,
    buildings,
    footprintOf,
    rng: rngs.plan,
    reliefRelax,
    reachable: (x, z) => homeRegion < 0 || pathfinder.regionOf(x, z) === homeRegion,
    walkOk,
    radialDistance: network.radialDistance,
  });

  const openSites = () => buildings.filter(isOpenSite);

  /** Seat a building; its footpath appears at once (the temple gets its plaza loop at founding). */
  const place = (
    type: Building['type'],
    stage: VillageStage,
    x: number,
    z: number,
    rotY: number,
    ring = -1,
  ) => {
    const building = seatBuilding(sampler, footprintOf, nextId++, type, stage, x, z, rotY, ring);
    buildings.push(building);
    stampBuilding(grid, building, PLAN.SPACING_M);
    pathfinder.blockBuilding(building);
    if (type !== 'temple') network.linkBuilding(building);
    return building;
  };

  const support = createSupportBuildings({
    grid,
    pathfinder,
    network,
    buildings,
    fields,
    faith,
    footprintOf,
    context,
    place,
    promoteFarmers: population.promoteFarmers,
  });

  /** One planner pass; returns the new site or null (and tracks failures to relax the relief limit). */
  const plan = (kind: BuildingKind, stage: VillageStage): Building | null => {
    const site = planBuilding(context(), kind);
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
    return place(site.type!, stage, site.x, site.z, site.rotY, site.ring);
  };

  const planWithRetries = (kind: BuildingKind, stage: VillageStage, attempts: number) => {
    for (let attempt = 0; attempt < attempts; attempt++) {
      if (plan(kind, stage)) return;
    }
  };

  const startSite = (events: VillageEvent[], free: boolean): boolean => {
    if (openSites().length >= PLAN.MAX_ACTIVE_SITES || buildings.length >= PLAN.MAX_BUILDINGS) {
      return false;
    }
    const cost = siteCost(buildings.filter((b) => b.type !== 'temple').length);
    if (!free && faith.faith < cost) return false;
    const building = plan(chooseNextKind(buildings, rngs.plan), 0);
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

  // Founding: the temple and its plaza, the well's spot, the plaza loop and main road, the first
  // houses (the first one built, the second a foundation), and the first villagers.
  const foundVillage = () => {
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
    syncPathWear();
    planWithRetries('house', 2, 6);
    planWithRetries('house', 0, 6);
    for (let n = 0; n < VILLAGERS.START; n++) population.spawn();
    syncPathWear();
  };

  /** Put a saved village back. Everything founding would build is in the state, so nothing is laid again. */
  const restoreState = (s: VillageSimState) => {
    const problem = villageStateProblem(s, seed);
    if (problem) throw new Error(problem);
    nextId = s.nextId;
    planTimer = s.planTimer;
    spawnTimer = s.spawnTimer;
    wearSync = s.wearSync;
    failedPasses = s.failedPasses;
    reliefRelax = s.reliefRelax;
    ringFails.splice(0, ringFails.length, ...s.ringFails);
    for (const b of s.buildings) buildings.push({ ...b });
    for (const f of s.fields) fields.push({ ...f });
    grid.occupant.set(s.occupant);
    // Blocked cells are exactly the union of these footprints, in any order.
    for (const b of buildings) pathfinder.blockBuilding(b);
    for (const f of fields) {
      pathfinder.blockRect(f.x, f.z, f.rotY, f.halfW, f.halfD, FIELD_BLOCK_MARGIN_M);
    }
    Object.assign(faith, s.faith);
    restoreVillagers(villagers, s.villagers);
    wear.restore(s.wear);
    pathfinder.setPathiness(s.pathiness ? s.pathiness.slice() : null);
    network.restore(s.network, buildings);
    support.restore(s.support);
    population.rebuildResidents();
    agents.restore(s.agents);
    rngs.plan.importState(s.rng.plan);
    rngs.agents.importState(s.rng.agents);
  };

  if (options.restore) restoreState(options.restore);
  else foundVillage();

  return {
    seed,
    buildings,
    villagers,
    fields,
    faith,
    grid,
    rings,
    pathfinder,
    wear,
    network,
    workSpots,
    beginStep: agents.beginStep,
    isOccupied: population.isOccupied,
    update: (dt, inputs, events) => {
      sink = events;
      for (const field of fields) field.tenders = 0;
      stepFaith(faith, dt, inputs);
      wear.decay(dt);
      wearSync += dt;
      if (wearSync >= VILLAGE.WEAR.PATHFINDER_SYNC_S) {
        wearSync = 0;
        syncPathWear();
      }
      agents.update(dt, {
        dayPhase: inputs.dayPhase,
        vigil: inputs.vigil,
        boost01: faith.boost01,
      } satisfies AgentInputs);
      for (const field of fields) {
        const boost = 1 + VILLAGE.FIELDS.TEND_BOOST * Math.min(3, field.tenders);
        field.growth = Math.min(1, field.growth + (dt / VILLAGE.FIELDS.GROW_S) * boost);
        // A tended, ripe field is harvested and replanted.
        if (field.growth >= 1 && field.tenders > 0) field.growth = 0;
      }
      planTimer += dt;
      if (planTimer >= PLAN.INTERVAL_S) {
        planTimer = 0;
        startSite(events, false);
        support.grow(events);
      }
      spawnTimer += dt;
      if (spawnTimer >= SPAWN_CHECK_S) {
        spawnTimer = 0;
        if (
          population.hasRoom() &&
          faith.faith >= VILLAGE.FAITH.VILLAGER_COST &&
          population.spawn()
        ) {
          faith.faith -= VILLAGE.FAITH.VILLAGER_COST;
        }
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
      villagers: villagers.count,
      beds: population.totalBeds(),
      fields: fields.length,
      agents: agents.stats(),
      path: { ...pathfinder.stats },
      network: network.stats(),
      ringCounts: Array.from(
        { length: rings.count },
        (_, k) => buildings.filter((b) => b.ring === k).length,
      ),
    }),
    addFaith: (amount) => {
      faith.faith += amount;
      faith.earned += Math.max(0, amount);
    },
    startSiteNow: (events) => startSite(events, true),
    completeOpenSites: (events) => {
      for (const site of openSites()) complete(site, events);
    },
    spawnVillagers: (count) => {
      let made = 0;
      for (let n = 0; n < count && population.spawn(); n++) made++;
      return made;
    },
    serialize: () => ({
      seedId: seed.id,
      nextId,
      planTimer,
      spawnTimer,
      wearSync,
      failedPasses,
      reliefRelax,
      ringFails: [...ringFails],
      buildings: buildings.map((b) => ({ ...b })),
      fields: fields.map((f) => ({ ...f })),
      faith: { ...faith },
      villagers: serializeVillagers(villagers),
      occupant: grid.occupant.slice(),
      pathiness: pathfinder.getPathiness()?.slice() ?? null,
      wear: wear.serialize(),
      network: network.serialize(),
      support: support.serialize(),
      agents: agents.serialize(),
      rng: { plan: rngs.plan.exportState(), agents: rngs.agents.exportState() },
    }),
  };
}
