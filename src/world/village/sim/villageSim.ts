// src/world/village/sim/villageSim.ts — village state and growth: founding, faith, sites, people, construction

import { VILLAGE } from '../../../config/village.ts';
import { smoothstep01 } from '../../../core/math/scalar.ts';
import type { VillageAssetMeta, VillageStage } from '../assets/villageAssetKeys.ts';
import type { VillageSeed } from '../model/seed.ts';
import { type AgentInputs, type AgentStats, createAgents } from './agents.ts';
import { applyWork, isOpenSite } from './construction.ts';
import {
  createFaithState,
  type FaithInputs,
  type FaithState,
  siteCost,
  stepFaith,
} from './faith.ts';
import { seatBuilding } from './founding.ts';
import { localToWorld } from './geometry.ts';
import { createPathfinder, type Pathfinder, type PathfinderStats } from './pathfind.ts';
import { createPathNetwork, type PathNetwork, type PathNetworkStats } from './pathNetwork.ts';
import {
  type BuildingKind,
  chooseNextKind,
  type PlanContext,
  planBuilding,
  planField,
  planWell,
} from './planner.ts';
import { createRingModel, measureContour, type RingModel } from './ringModel.ts';
import {
  createSiteGrid,
  fieldOccupant,
  OCCUPANT,
  type SiteGrid,
  stampBuilding,
  stampFootprint,
} from './siteGrid.ts';
import type { TerrainSampler } from './terrainSampler.ts';
import { createVillageRngs } from './villageRng.ts';
import { createVillagerPool, spawnVillager } from './villagerPool.ts';
import { type Building, type Field, Role, type RoleId, type Villagers } from './villageTypes.ts';
import { createWearField, type WearField } from './wearField.ts';

export type VillageEvent =
  | { kind: 'siteStarted'; building: Building }
  | { kind: 'fieldStarted'; field: Field }
  | { kind: 'stageCompleted'; building: Building; stage: VillageStage };

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
}

type MetaOf = (
  type: Building['type'],
) => Pick<VillageAssetMeta, 'footprint' | 'door' | 'workSlots'>;

interface VillageSimOptions {
  sampler: TerrainSampler;
  metaOf: MetaOf;
  seed: VillageSeed;
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
  const wear = createWearField(seed.x, seed.z, seed.radiusM + VILLAGE.TERRAIN.MARGIN_M);
  const pathWear = new Float32Array(grid.size * grid.size);
  let wearSync = 0;
  const faith = createFaithState();
  const villagers = createVillagerPool();
  const buildings: Building[] = [];
  const residents = new Map<number, number>();
  const fields: Field[] = [];
  let nextFieldId = 1;
  let nextId = 1;
  let planTimer = 0;
  let spawnTimer = 0;
  let failedPasses = 0;
  let reliefRelax = 1;
  /** Events emitted while agents work are appended here (set at the start of each update). */
  let sink: VillageEvent[] = [];

  const agents = createAgents({
    pool: villagers,
    pathfinder,
    rng: rngs.agents,
    buildings,
    fields,
    metaOf,
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
    radialDistance: (x, z) => network.radialDistance(x, z),
  });

  const homesCount = () => buildings.filter((b) => b.type !== 'temple').length;
  const openSites = () => buildings.filter(isOpenSite);
  const bedsOf = (b: Building) => (b.stage === 2 ? (VILLAGERS.BEDS[b.type] ?? 0) : 0);
  const totalBeds = () => buildings.reduce((sum, b) => sum + bedsOf(b), 0);
  const temple = () => buildings.find((b) => b.type === 'temple');

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
    // A footpath appears as the site starts; the temple gets its plaza loop at founding instead.
    if (type !== 'temple') {
      if (ring >= 0) growMainRoad(ring);
      network.linkBuilding(building);
    }
    return building;
  };

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
    const cost = siteCost(homesCount());
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

  /** First finished building with a free bed (the temple takes the overflow). */
  const assignHome = (): number => {
    for (const b of buildings) {
      if (b.type !== 'temple' && (residents.get(b.id) ?? 0) < bedsOf(b)) return b.id;
    }
    return temple()?.id ?? 0;
  };

  const pickRole = (): RoleId => {
    const pop = villagers.count;
    let priests = 0;
    let builders = 0;
    let farmers = 0;
    for (let i = 0; i < pop; i++) {
      if (villagers.role[i] === Role.Priest) priests++;
      else if (villagers.role[i] === Role.Builder) builders++;
      else if (villagers.role[i] === Role.Farmer) farmers++;
    }
    if (priests * VILLAGERS.PEOPLE_PER_PRIEST < pop + 1) return Role.Priest;
    if (builders < Math.ceil((pop + 1) * VILLAGERS.BUILDER_SHARE)) return Role.Builder;
    const farmerQuota = Math.ceil((pop + 1) * VILLAGE.FIELDS.FARMER_SHARE);
    return fields.length > 0 && farmers < farmerQuota ? Role.Farmer : Role.Idler;
  };

  const houseCount = () => buildings.filter((b) => b.type.startsWith('house_')).length;

  /** When a field appears, idlers take up farming until the quota is met. */
  const promoteFarmers = () => {
    let farmers = 0;
    for (let i = 0; i < villagers.count; i++) if (villagers.role[i] === Role.Farmer) farmers++;
    const quota = Math.ceil(villagers.count * VILLAGE.FIELDS.FARMER_SHARE);
    for (let i = 0; i < villagers.count && farmers < quota; i++) {
      if (villagers.role[i] === Role.Idler) {
        villagers.role[i] = Role.Farmer;
        farmers++;
      }
    }
  };

  const startField = (events: VillageEvent[]): boolean => {
    const { FIELDS } = VILLAGE;
    const site = planField(context());
    if (!site) return false;
    const field: Field = {
      id: nextFieldId++,
      x: site.x,
      z: site.z,
      rotY: site.rotY,
      halfW: FIELDS.WIDTH_M / 2,
      halfD: FIELDS.DEPTH_M / 2,
      crop: (fields.length % 2) as 0 | 1,
      growth: 0,
      tenders: 0,
    };
    fields.push(field);
    stampFootprint(
      grid,
      fieldOccupant(field.id),
      field.x,
      field.z,
      field.rotY,
      field.halfW,
      field.halfD,
      PLAN.SPACING_M,
    );
    pathfinder.blockRect(field.x, field.z, field.rotY, field.halfW, field.halfD, 0.4);
    network.linkField(field);
    events.push({ kind: 'fieldStarted', field });
    promoteFarmers();
    return true;
  };

  /** Where the well will go, picked at founding and kept clear until it is dug. */
  let wellSite: ReturnType<typeof planWell> = null;
  const reserveWell = () => {
    wellSite = planWell(context(), footprintOf('well'));
    if (!wellSite) return;
    const [w, d] = footprintOf('well');
    stampFootprint(
      grid,
      OCCUPANT.WELL,
      wellSite.x,
      wellSite.z,
      wellSite.rotY,
      w / 2,
      d / 2,
      PLAN.SPACING_M,
    );
  };

  /** The well is dug at once (no building stages): it appears finished on the plaza edge. */
  const startWell = (events: VillageEvent[]): boolean => {
    if (buildings.some((b) => b.type === 'well')) return false;
    if (!wellSite) reserveWell();
    const site = wellSite;
    if (!site) return false;
    events.push({ kind: 'siteStarted', building: place('well', 2, site.x, site.z, site.rotY) });
    return true;
  };

  /** Fields and the well follow the growth of the village. */
  const growSupportBuildings = (events: VillageEvent[]) => {
    const { FIELDS, WELL } = VILLAGE;
    const houses = houseCount();
    const wantedFields = Math.min(FIELDS.MAX, Math.floor(houses / FIELDS.HOUSES_PER_FIELD));
    if (fields.length < wantedFields && faith.faith >= FIELDS.COST && startField(events)) {
      faith.faith -= FIELDS.COST;
    }
    if (houses >= WELL.HOUSES_NEEDED && faith.faith >= WELL.COST && startWell(events)) {
      faith.faith -= WELL.COST;
    }
  };

  /** World position `out` metres in front of a building's door. */
  const doorstep = (b: Building, out: number): [number, number] => {
    const [dx, dz] = metaOf(b.type).door;
    return localToWorld(b, dx, dz + out);
  };

  /** How much like a path worn ground reads to walkers: 0 open ground, 1 a path. */
  const pathiness = (worn: number) => {
    const { LO, HI } = VILLAGE.PATHS.PATHINESS;
    return smoothstep01((worn - LO) / (HI - LO));
  };

  /** Copy the 1 m wear into the pathfinder's 2 m cost grid (max over each cell's four quarters). */
  const syncPathWear = () => {
    const { size, cellM, originX, originZ } = grid;
    const q = cellM / 4;
    for (let j = 0; j < size; j++) {
      for (let i = 0; i < size; i++) {
        const x = originX + (i + 0.5) * cellM;
        const z = originZ + (j + 0.5) * cellM;
        const worn = Math.max(
          wear.sample(x - q, z - q),
          wear.sample(x + q, z - q),
          wear.sample(x - q, z + q),
          wear.sample(x + q, z + q),
        );
        pathWear[j * size + i] = pathiness(worn);
      }
    }
    pathfinder.setPathiness(pathWear);
  };

  /** The main road reaches this ring so far (-1: not laid yet) and ends at this point. */
  let mainRoadRing = -1;
  let roadEndX = 0;
  let roadEndZ = 0;

  /** Main road: from the temple door along its axis, out to the outermost ring with houses, already worn in. */
  const growMainRoad = (ring: number) => {
    if (ring <= mainRoadRing) return;
    const t = temple();
    if (!t) return;
    const [sx, sz] = mainRoadRing < 0 ? doorstep(t, VILLAGE.PATH.DOORSTEP_M) : [roadEndX, roadEndZ];
    const reach = rings.radiusAt(ring, rings.doorYaw) + VILLAGE.RINGS.ROAD_OVERSHOOT_M;
    const waypoints = new Float32Array(VILLAGE.PATH.MAX_WAYPOINTS * 2);
    const n = pathfinder.find(
      sx,
      sz,
      seed.x + Math.sin(rings.doorYaw) * reach,
      seed.z + Math.cos(rings.doorYaw) * reach,
      waypoints,
      0,
      VILLAGE.PATH.MAX_WAYPOINTS,
    );
    // Reached or not, do not search again for this ring.
    mainRoadRing = ring;
    let px = sx;
    let pz = sz;
    const road = [sx, sz];
    for (let k = 0; k < n; k++) {
      const x = waypoints[k * 2]!;
      const z = waypoints[k * 2 + 1]!;
      road.push(x, z);
      wear.paintLine(
        px,
        pz,
        x,
        z,
        VILLAGE.WEAR.OLD_ROAD,
        VILLAGE.WEAR.OLD_ROAD_RADIUS_M,
        VILLAGE.WEAR.OLD_ROAD_FLOOR,
      );
      px = x;
      pz = z;
    }
    roadEndX = px;
    roadEndZ = pz;
    network.layAxisRoad(road);
  };

  /** A newcomer appears at the temple door and heads for a bed. */
  const spawn = (): boolean => {
    const t = temple();
    if (!t) return false;
    const role = pickRole();
    const home = role === Role.Priest ? t.id : assignHome();
    residents.set(home, (residents.get(home) ?? 0) + 1);
    const [x, z] = doorstep(t, VILLAGE.PATH.DOORSTEP_M + 1);
    return spawnVillager(villagers, rngs.agents, x, z, role, home) >= 0;
  };

  const network = createPathNetwork({
    pathfinder,
    wear,
    rings,
    rng: rngs.plan,
    doorstepOf: (b) => doorstep(b, VILLAGE.PATH.DOORSTEP_M),
    onLaid: syncPathWear,
  });

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
  reserveWell();
  // Plaza loop and the main road to the first ring first, so the first houses' paths join them.
  network.layPlaza(temple0);
  growMainRoad(0);
  syncPathWear();
  planWithRetries('house', 2, 6);
  planWithRetries('house', 0, 6);
  for (let n = 0; n < VILLAGERS.START; n++) spawn();
  syncPathWear();

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
    beginStep: agents.beginStep,
    isOccupied: (buildingId) =>
      buildings.find((b) => b.id === buildingId)?.type === 'temple' ||
      (residents.get(buildingId) ?? 0) > 0,
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
        growSupportBuildings(events);
      }
      spawnTimer += dt;
      if (spawnTimer >= SPAWN_CHECK_S) {
        spawnTimer = 0;
        const room = villagers.count < VILLAGERS.MAX && villagers.count < totalBeds();
        if (room && faith.faith >= VILLAGE.FAITH.VILLAGER_COST && spawn()) {
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
      beds: totalBeds(),
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
    },
    startSiteNow: (events) => startSite(events, true),
    completeOpenSites: (events) => {
      for (const site of openSites()) complete(site, events);
    },
    spawnVillagers: (count) => {
      let made = 0;
      for (let n = 0; n < count && spawn(); n++) made++;
      return made;
    },
  };
}
