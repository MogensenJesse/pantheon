// src/world/village/sim/villageSim.ts — village state and growth: founding, faith, sites, people, construction

import { VILLAGE } from '../../../config/village.ts';
import { modifiers } from '../../../skills/modifiers.ts';
import type { VillageStage } from '../model/assetKeys.ts';
import { isFinished, isHouse, PLOT_TYPES, templeOf } from '../model/buildings.ts';
import {
  type Building,
  type Field,
  type RemoteSite,
  Role,
  type VillageEvent,
  type WorkSpot,
} from '../model/types.ts';
import { type AgentInputs, createAgents } from './agents.ts';
import { beliefShare, believerIncome, believes, countBelievers, raiseBelief } from './belief.ts';
import { createBlessings } from './blessings.ts';
import { findCoarseRoute, routeFromGate } from './coarseRoute.ts';
import { applyWork, isOpenSite, remainingWork } from './construction.ts';
import {
  CHEAPEST_WOOD_COST,
  createEconomy,
  foodPerDay,
  housingOf,
  maxOpenSites,
  pressureAllowsSite,
  woodCostOf,
} from './economy.ts';
import { createFaithState, type FaithInputs, siteCost, stepFaith } from './faith.ts';
import { createForest, forestProblem, type TreeInfo, TreeState } from './forest.ts';
import { doorWorld as doorWorldOf } from './geometry.ts';
import { createGraveyard } from './graveyard.ts';
import { createHearten, type HeartenResult } from './hearten.ts';
import {
  createHungerState,
  type HungerStage,
  hungerChange,
  isWeak,
  pickVictim,
  stageOf,
  stepHunger,
  weakAtS,
} from './hunger.ts';
import {
  type OutpostKind,
  type OutpostWorld,
  outpostOf,
  outpostPlaceProblem,
  outpostSiteKind,
  outputOf,
  outputPerSec,
} from './outposts.ts';
import { createPathfinder } from './pathfind.ts';
import { createPathinessSync } from './pathiness.ts';
import { createPathNetwork } from './pathNetwork.ts';
import {
  type BuildingKind,
  chooseNextKind,
  type PlanContext,
  planBuilding,
  plotFacing,
  validatePlot,
} from './planner.ts';
import { createPopulation } from './population.ts';
import {
  createPrayersState,
  type Prayer,
  type PrayerWorld,
  removeVillager,
  restoreBelief,
  restorePrayers,
  serializePrayers,
  stepPrayers,
} from './prayers.ts';
import { createRingModel, measureContour } from './ringModel.ts';
import { cellIndex, createSiteGrid, OCCUPANT, stampBuilding, stampFootprint } from './siteGrid.ts';
import { seatBuilding } from './siting.ts';
import { createSupportBuildings, FIELD_BLOCK_MARGIN_M } from './support.ts';
import {
  applyUpgradeWork,
  beginUpgrade,
  checkUpgrade,
  tierCeiling,
  upgradeCost,
} from './upgrades.ts';
import { createVillageRngs } from './villageRng.ts';
import {
  createVillagerPool,
  followMove,
  restoreVillagers,
  serializeVillagers,
} from './villagerPool.ts';
import { villageStateProblem } from './villageSave.ts';
import type {
  PlotResult,
  UpgradeStart,
  VillageMode,
  VillageSim,
  VillageSimOptions,
  VillageSimState,
} from './villageSimTypes.ts';
import { createWearField } from './wearField.ts';
import { createWorkSpots, type WorkSpots } from './workSpots.ts';

export type {
  VillageMode,
  VillageSim,
  VillageSimInputs,
  VillageSimState,
  VillageStats,
} from './villageSimTypes.ts';
export { villageStateProblem };

const { PLAN, VILLAGERS, HAMLET } = VILLAGE;
const SPAWN_CHECK_S = 2;
/** The crew of a remote site leaves the village's paths at this share of the village radius. */
const GATE_SHARE = 0.8;

export function createVillageSim(options: VillageSimOptions): VillageSim {
  const { sampler, metaOf, seed } = options;
  const mode: VillageMode = options.mode ?? 'sandbox';
  /** Growth (new sites, newcomers, fields, the well) runs once this is true. */
  let converted = mode === 'sandbox';
  let elder = -1;
  /** The shepherd girl the quests lean on (a villager who cannot die of hunger), or -1. */
  let aera = -1;
  const faithInputs: FaithInputs = { playerDistM: null, presenceActive: false };
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
  const treeList = options.trees ?? [];
  /** What the skills change, read live (the game replaces the record's numbers in place). */
  const mods = options.modifiers ?? modifiers;
  /** How much rain speeds growth, from the base rate of the thing that grows (Rain-reader and Downpour change it). */
  const rainBoostOf = (base: number) => Math.max(0, (base + mods.rainBoostAdd) * mods.rainBoostMul);
  const blessings = createBlessings();
  const prayers = createPrayersState();
  const hearten = createHearten();
  const forest = createForest(treeList, {
    woodAdd: () => mods.woodPerTreeAdd,
    stumpWaitMul: () => mods.stumpWaitMul,
    evergreen: () => mods.evergreen > 0,
    rainBoost: () => rainBoostOf(VILLAGE.FOREST.RAIN_BOOST),
    treeBoost: (id) => blessings.boost('tree', id),
  });
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
  const economy = createEconomy(options.restore?.economy, () => mods.storageCapAdd);
  const villagers = createVillagerPool();
  const buildings: Building[] = [];
  const fields: Field[] = [];
  const remoteSites: RemoteSite[] = [];
  let nextId = 1;
  let planTimer = 0;
  let spawnTimer = 0;
  let failedPasses = 0;
  let reliefRelax = 1;
  /** Events emitted while agents work are appended here (set at the start of each update). */
  let sink: VillageEvent[] = [];

  const temple = () => templeOf(buildings);

  /** World position `out` metres in front of a building's door. */
  const doorstep = (b: Building, out: number): [number, number] =>
    doorWorldOf(b, metaOf(b.type).door, out);

  const population = createPopulation({
    villagers,
    buildings,
    fields,
    rng: rngs.agents,
    doorstep,
    spots: workSpots,
    houseExtra: () => mods.bedsPerHouseAdd,
    keepIdle: () => aera,
  });

  const network = createPathNetwork({
    pathfinder,
    wear,
    rings,
    rng: rngs.plan,
    doorstepOf: (b) => doorstep(b, VILLAGE.PATH.DOORSTEP_M),
    onLaid: syncPathWear,
  });

  let mealsServed = 0;
  let mealsMissed = 0;

  /** Builder-seconds into a remote site; a finished stage is reported, and the crew goes home after the last. */
  const applyRemoteWork = (site: RemoteSite, seconds: number) => {
    const table = outpostOf(site.kind)
      ? VILLAGE.OUTPOSTS.SITE_WORK_S
      : VILLAGE.RESTORATION.SITE_WORK_S;
    const workFor = (stage: VillageStage) =>
      stage === 2 ? Number.POSITIVE_INFINITY : table[stage]!;
    site.progress += seconds;
    while (site.stage < 2 && site.progress >= workFor(site.stage)) {
      site.progress -= workFor(site.stage);
      site.stage = (site.stage + 1) as VillageStage;
      sink.push({ kind: 'remoteStageCompleted', site, stage: site.stage });
    }
    if (site.stage === 2) site.progress = 0;
  };

  /** Builder work on a site: it moves a stage on, or an upgrade under way towards its level. */
  const workOn = (site: Building, seconds: number, out: VillageEvent[]) => {
    if (site.stage < 2) {
      for (const done of applyWork(site, seconds)) {
        out.push({ kind: 'stageCompleted', building: done.building, stage: done.stage });
      }
    } else if (applyUpgradeWork(site, seconds)) {
      out.push({ kind: 'upgradeCompleted', building: site, level: site.level });
    }
  };

  const agents = createAgents({
    pool: villagers,
    pathfinder,
    rng: rngs.agents,
    buildings,
    fields,
    metaOf,
    spots: workSpots,
    onWalk: wear.walk,
    onFish: (amount) => economy.addFood(amount * mods.fishMul),
    onEat: (_villager, round) => {
      if (economy.eat(round)) mealsServed++;
      else mealsMissed++;
    },
    graveSite: () => graveyard.site(),
    isStanding: forest.isStanding,
    builderRateMul: () => mods.builderRateMul,
    workBoost: (i) => blessings.boost('house', villagers.home[i]!) * hearten.boost(i),
    onChop: (tree, dt, dirX, dirZ) => {
      // A full wood store: the woodcutter waits at the tree rather than fell it for nothing.
      if (economy.stock.wood >= economy.caps().wood - 1e-6) return false;
      const wood = forest.chop(tree, dt, dirX, dirZ, sink);
      if (wood <= 0) return false;
      economy.addWood(wood);
      return true;
    },
    onWork: (site, seconds) => workOn(site, seconds, sink),
    remoteSites,
    onRemoteWork: applyRemoteWork,
  });

  /** A crew sets out for a new remote site along `route` (the caller has checked the route and the crew). */
  const beginRemote = (
    kind: string,
    x: number,
    z: number,
    route: NonNullable<ReturnType<typeof findCoarseRoute>>,
    events: VillageEvent[],
  ) => {
    const site: RemoteSite = {
      id: remoteSites.length + 1,
      kind,
      x,
      z,
      campX: route.endX,
      campZ: route.endZ,
      stage: 0,
      progress: 0,
      route: routeFromGate(route.points, seed.x, seed.z, GATE_SHARE * seed.radiusM),
    };
    remoteSites.push(site);
    agents.recruitCrew(site, VILLAGE.RESTORATION.CREW.MAX);
    events.push({ kind: 'remoteStarted', site });
  };

  /** Builders not already on a crew. */
  const freeBuilderCount = (): number => {
    let n = 0;
    for (let i = 0; i < villagers.count; i++) {
      if (villagers.role[i] === Role.Builder && villagers.crew[i] === 0 && villagers.dying[i] === 0)
        n++;
    }
    return n;
  };

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

  const outpostWorld = (): OutpostWorld => ({
    centerX: seed.x,
    centerZ: seed.z,
    radiusM: seed.radiusM,
    sampler,
    forest,
    sites: remoteSites,
  });

  const openSites = () => buildings.filter(isOpenSite);
  const dyingCount = () => {
    let n = 0;
    for (let i = 0; i < villagers.count; i++) if (villagers.dying[i]! > 0) n++;
    return n;
  };

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

  /** A stump may grow a sapling where nothing stands: the site grid says so (outside it, anywhere). */
  const forestInputs = {
    rain01: 0,
    canRegrow: (tree: TreeInfo) => {
      const cell = cellIndex(grid, tree.x, tree.z);
      return cell < 0 || grid.occupant[cell] === OCCUPANT.FREE;
    },
  };
  const hunger = createHungerState();
  const graveyard = createGraveyard({ grid, context, fields });
  let lastStage: HungerStage = 'fed';

  /** A planner pass for a `kind` of building; tracks failures to relax the relief limit. */
  const findSite = (kind: BuildingKind) => {
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
    }
    return site;
  };

  /** One planner pass; returns the new site or null. */
  const plan = (kind: BuildingKind, stage: VillageStage): Building | null => {
    const site = findSite(kind);
    return site ? place(site.type!, stage, site.x, site.z, site.rotY, site.ring) : null;
  };

  const planWithRetries = (kind: BuildingKind, stage: VillageStage, attempts: number) => {
    for (let attempt = 0; attempt < attempts; attempt++) {
      if (plan(kind, stage)) return;
    }
  };

  /**
   * Start a site. It costs faith and wood, and the village has to be short of beds: building runs
   * ahead of the people only as far as the wood and the housing allow. `free` (DEV) skips all three.
   */
  const startSite = (events: VillageEvent[], free: boolean): boolean => {
    if (buildings.length >= Math.floor(PLAN.MAX_BUILDINGS * mods.buildingCapMul)) return false;
    const open = openSites().length;
    if (free) {
      if (open >= PLAN.MAX_ACTIVE_SITES) return false;
    } else {
      const housing = housingOf(buildings, villagers.count, mods.bedsPerHouseAdd);
      if (open >= maxOpenSites(housing, PLAN.MAX_ACTIVE_SITES) || !pressureAllowsSite(housing)) {
        return false;
      }
      if (faith.faith < siteCost(buildings.filter((b) => b.type !== 'temple').length)) return false;
      // Not even the cheapest building is affordable: nothing to plan yet.
      if (economy.stock.wood < CHEAPEST_WOOD_COST) return false;
    }
    const site = findSite(chooseNextKind(buildings, rngs.plan));
    if (!site) return false;
    if (!free) {
      if (!economy.spendWood(woodCostOf(site.type!))) return false;
      faith.faith -= siteCost(buildings.filter((b) => b.type !== 'temple').length);
    }
    const building = place(site.type!, 0, site.x, site.z, site.rotY, site.ring);
    events.push({ kind: 'siteStarted', building });
    return true;
  };

  /**
   * What putting a building of `type` at (x, z) would come to, with no effect: the village must be converted
   * and have room for another site, the spot must hold the planner's own rules, and the wood and faith must
   * be there. `free` (DEV) skips the cap and the cost.
   */
  const plotCheck = (
    type: Building['type'],
    x: number,
    z: number,
    rotY: number,
    free = false,
  ): PlotResult => {
    if (!PLOT_TYPES.includes(type)) return 'type';
    if (!converted) return 'not-converted';
    if (buildings.length >= Math.floor(PLAN.MAX_BUILDINGS * mods.buildingCapMul)) return 'full';
    if (!free && openSites().length >= PLAN.MAX_ACTIVE_SITES) return 'cap';
    const spot = validatePlot(context(), type, x, z, rotY);
    if (!spot.ok) return spot.reason;
    if (!free) {
      if (economy.stock.wood < woodCostOf(type)) return 'wood';
      if (faith.faith < siteCost(buildings.filter((b) => b.type !== 'temple').length)) {
        return 'faith';
      }
    }
    return 'ok';
  };

  /** The player marks a plot: a site starts there and the builders come to it. */
  const placePlot = (
    type: Building['type'],
    x: number,
    z: number,
    rotY: number,
    events: VillageEvent[],
    free = false,
  ): PlotResult => {
    const result = plotCheck(type, x, z, rotY, free);
    if (result !== 'ok') return result;
    const spot = validatePlot(context(), type, x, z, rotY);
    if (!free) {
      economy.spendWood(woodCostOf(type));
      faith.faith -= siteCost(buildings.filter((b) => b.type !== 'temple').length);
    }
    const ring = spot.ok ? spot.ring : -1;
    events.push({ kind: 'siteStarted', building: place(type, 0, x, z, rotY, ring) });
    return 'ok';
  };

  const activeUpgrades = () => buildings.filter((b) => isFinished(b) && b.upgrade > 0).length;

  /**
   * Begin the next upgrade of a finished building: it costs wood and faith, the tree must allow the level and
   * only `UPGRADES.MAX_ACTIVE` upgrades run at once. `free` (DEV) skips the cost and the cap.
   */
  const upgradeBuilding = (id: number, events: VillageEvent[], free = false): UpgradeStart => {
    const b = buildings.find((x) => x.id === id);
    if (!b) return 'unsupported';
    const check = checkUpgrade(b, mods);
    if (!check.ok) return check.reason;
    if (!free) {
      if (activeUpgrades() >= VILLAGE.UPGRADES.MAX_ACTIVE) return 'cap';
      const cost = upgradeCost(b);
      if (faith.faith < cost.faith) return 'faith';
      if (economy.stock.wood < cost.wood) return 'wood';
      economy.spendWood(cost.wood);
      faith.faith -= cost.faith;
    }
    beginUpgrade(b);
    events.push({ kind: 'upgradeStarted', building: b });
    return 'ok';
  };

  /** The planner's choice: the lowest level first, houses before stores, then the oldest. No random draw. */
  const nextUpgrade = (): Building | null => {
    let best: Building | null = null;
    for (const b of buildings) {
      if (!checkUpgrade(b, mods).ok) continue;
      if (
        !best ||
        b.level < best.level ||
        (b.level === best.level && Number(isHouse(best)) < Number(isHouse(b)))
      ) {
        best = b;
      }
    }
    return best;
  };

  const complete = (site: Building, events: VillageEvent[]) => {
    for (const done of applyWork(site, Number.POSITIVE_INFINITY)) {
      events.push({ kind: 'stageCompleted', building: done.building, stage: done.stage });
    }
  };

  // Founding: the temple and its plaza, the well's spot and the plaza loop.
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
    syncPathWear();
  };

  // A sandbox village: the first houses (the first one built, the second a foundation), and the first
  // villagers.
  const foundVillage = () => {
    foundTemple();
    planWithRetries('house', 2, 6);
    planWithRetries('house', 0, 6);
    graveyard.reserve();
    for (let n = 0; n < VILLAGERS.START; n++) population.spawn();
    syncPathWear();
  };

  // A hamlet: everything finished at once (the houses, the fields, the well), and the people with no
  // builders among them, since there is nothing to build until the village converts. The first priest
  // is the elder.
  const foundHamlet = () => {
    foundTemple();
    for (let n = 0; n < HAMLET.HOUSES; n++) planWithRetries('house', 2, 6);
    support.seedHamlet([], HAMLET.FIELDS);
    graveyard.reserve();
    for (let n = 0; n < HAMLET.VILLAGERS; n++) population.spawn({ builders: false });
    syncPathWear();
    for (let i = 0; i < villagers.count; i++) {
      if (villagers.role[i] === Role.Priest) {
        elder = i;
        break;
      }
    }
    // Aera is the first idler (the youngest hand with no trade), whoever else the village holds.
    for (let i = 0; i < villagers.count; i++) {
      if (i !== elder && villagers.role[i] === Role.Idler) {
        aera = i;
        break;
      }
    }
  };

  /** Put a saved village back. Everything founding would build is in the state, so nothing is laid again. */
  const restoreState = (s: VillageSimState) => {
    const problem = villageStateProblem(s, seed) ?? forestProblem(s.forest, treeList.length);
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
    for (const r of s.remoteSites) remoteSites.push({ ...r, route: [...r.route] });
    grid.occupant.set(s.occupant);
    // Blocked cells are exactly the union of these footprints, in any order.
    for (const b of buildings) pathfinder.blockBuilding(b);
    for (const f of fields) {
      pathfinder.blockRect(f.x, f.z, f.rotY, f.halfW, f.halfD, FIELD_BLOCK_MARGIN_M);
    }
    Object.assign(faith, s.faith);
    Object.assign(hunger, s.hunger);
    forest.restore(s.forest);
    graveyard.restore(s.graveyard);
    blessings.restore(s.blessings);
    restorePrayers(prayers, s.prayers);
    hearten.restore(s.hearten);
    lastStage = stageOf(hunger, false, mods.hungerGraceMul);
    restoreVillagers(villagers, s.villagers);
    wear.restore(s.wear);
    pathfinder.setPathiness(s.pathiness ? s.pathiness.slice() : null);
    network.restore(s.network, buildings);
    support.restore(s.support);
    population.rebuildResidents();
    agents.restore(s.agents);
    rngs.plan.importState(s.rng.plan);
    rngs.agents.importState(s.rng.agents);
    converted = mode === 'sandbox' || s.converted;
    elder = s.elder;
    aera = s.aera;
  };

  if (options.restore) restoreState(options.restore);
  else if (mode === 'hamlet') foundHamlet();
  else foundVillage();

  const believerCount = () => countBelievers(villagers.belief, villagers.count);

  /** A villager begins to die: hunger's toll in faith, then the collapse. */
  const beginDying = (i: number, events: VillageEvent[]) => {
    faith.faith = Math.max(0, faith.faith - VILLAGE.HUNGER.DEATH_FAITH_COST * mods.deathFaithMul);
    agents.startDying(i);
    events.push({ kind: 'villagerDying', villager: i });
  };

  /** The collapse and the fade are over: the grave, the pool, and everything that held their index. */
  const removeDead = (i: number, events: VillageEvent[]) => {
    const grave = graveyard.add();
    if (grave) events.push({ kind: 'graveAdded', grave });
    const moved = agents.remove(i);
    elder = followMove(elder, i, moved);
    aera = followMove(aera, i, moved);
    population.rebuildResidents();
    removeVillager(prayers, i, moved);
    hearten.remove(i, moved);
    events.push({ kind: 'villagerDied', villager: i, moved });
  };

  const prayerWorld: PrayerWorld = {
    count: 0,
    belief: villagers.belief,
    dying: villagers.dying,
    role: villagers.role,
    home: villagers.home,
    foodShort: false,
    hasFields: false,
    rain01: 0,
  };

  /** A prayer is answered by whatever means: it pays and closes (the state change is the caller's). */
  const answerPrayer = (prayer: Prayer, events: VillageEvent[]) => {
    prayers.open = prayers.open.filter((p) => p !== prayer);
    prayers.answered++;
    faith.faith += VILLAGE.PRAYERS.ANSWER_FAITH;
    faith.earned += VILLAGE.PRAYERS.ANSWER_FAITH;
    events.push({ kind: 'prayerAnswered', villager: prayer.villager, need: prayer.kind });
  };

  /**
   * Gives back what a lapsed villager lost and answers the prayer they voiced. A villager who never believed
   * is left alone: belief is won through the conversion quest, not restored. True when something changed.
   */
  const restoreBeliefOf = (villager: number, events: VillageEvent[]): boolean => {
    const prayer = prayers.open.find((p) => p.villager === villager);
    const lapsed = restoreBelief(prayers, villagers, villager, true);
    if (prayer) answerPrayer(prayer, events);
    return lapsed || !!prayer;
  };

  /** Report a change of hunger's stage once. */
  const noteHunger = (events: VillageEvent[]) => {
    const stage = stageOf(hunger, economy.hungry, mods.hungerGraceMul);
    const change = hungerChange(lastStage, stage);
    if (change) events.push({ kind: 'hunger', stage: change });
    lastStage = stage;
  };

  return {
    seed,
    mode,
    get converted() {
      return converted;
    },
    get elder() {
      return elder;
    },
    get aera() {
      return aera;
    },
    buildings,
    villagers,
    fields,
    faith,
    economy,
    forest,
    get graves() {
      return graveyard.graves;
    },
    get hunger() {
      return hunger;
    },
    grid,
    rings,
    pathfinder,
    wear,
    network,
    workSpots,
    remoteSites,
    startRemoteSite: (kind, x, z, events) => {
      if (remoteSites.some((r) => r.kind === kind)) return 'busy';
      const route = findCoarseRoute(options.sampler, seed.x, seed.z, x, z);
      if (!route) return 'no-route';
      if (freeBuilderCount() < VILLAGE.RESTORATION.CREW.MIN) return 'no-crew';
      beginRemote(kind, x, z, route, events);
      return 'ok';
    },
    outpostCheck: (kind, x, z) => outpostPlaceProblem(kind, x, z, outpostWorld()),
    startOutpost: (kind, x, z, events, free = false) => {
      if (!converted) return 'not-converted';
      const problem = outpostPlaceProblem(kind, x, z, outpostWorld());
      if (problem) return problem;
      if (!free && remoteSites.filter((r) => outpostOf(r.kind)).length >= VILLAGE.OUTPOSTS.MAX) {
        return 'limit';
      }
      const route = findCoarseRoute(options.sampler, seed.x, seed.z, x, z);
      if (!route) return 'no-route';
      if (freeBuilderCount() < VILLAGE.RESTORATION.CREW.MIN) return 'no-crew';
      if (!free) {
        if (economy.stock.wood < VILLAGE.OUTPOSTS.WOOD) return 'wood';
        if (faith.faith < VILLAGE.OUTPOSTS.FAITH) return 'faith';
        economy.spendWood(VILLAGE.OUTPOSTS.WOOD);
        faith.faith -= VILLAGE.OUTPOSTS.FAITH;
      }
      beginRemote(outpostSiteKind(kind as OutpostKind), x, z, route, events);
      return 'ok';
    },
    completeRemoteSite: (kind, events) => {
      const site = remoteSites.find((r) => r.kind === kind);
      if (!site || site.stage >= 2) return false;
      sink = events;
      applyRemoteWork(site, Number.POSITIVE_INFINITY);
      return true;
    },
    beginStep: agents.beginStep,
    isOccupied: population.isOccupied,
    update: (dt, inputs, events) => {
      sink = events;
      for (const field of fields) field.tenders = 0;
      faithInputs.playerDistM = inputs.playerDistM;
      faithInputs.presenceActive = inputs.presenceActive;
      // A hamlet earns only from its believers; a sandbox village earns the flat base rate.
      faithInputs.baseRate = mode === 'hamlet' ? believerIncome(believerCount()) : undefined;
      stepFaith(faith, dt, faithInputs);
      economy.update(buildings);
      if (stepHunger(hunger, dt, economy.hungry, mods.hungerGraceMul)) {
        const victim = pickVictim(villagers, elder, converted, aera);
        if (victim >= 0) beginDying(victim, events);
      }
      noteHunger(events);
      const rain = inputs.rain01;
      prayerWorld.count = villagers.count;
      prayerWorld.foodShort = economy.hungry;
      prayerWorld.hasFields = fields.length > 0;
      prayerWorld.rain01 = rain;
      for (const o of stepPrayers(prayers, dt, prayerWorld, converted)) {
        if (o.kind === 'answered') {
          faith.faith += VILLAGE.PRAYERS.ANSWER_FAITH;
          faith.earned += VILLAGE.PRAYERS.ANSWER_FAITH;
        }
        events.push({
          kind:
            o.kind === 'opened'
              ? 'prayerOpened'
              : o.kind === 'answered'
                ? 'prayerAnswered'
                : 'prayerLapsed',
          villager: o.prayer.villager,
          need: o.prayer.kind,
        });
      }
      forestInputs.rain01 = rain;
      forest.update(dt, forestInputs, events);
      blessings.update(dt);
      hearten.update(dt);
      for (const site of remoteSites) {
        const outpost = outpostOf(site.kind);
        if (!outpost || site.stage < 2) continue;
        const amount = outputPerSec(outpost) * dt;
        if (outputOf(outpost) === 'wood') economy.addWood(amount);
        else economy.addFood(amount * mods.fishMul);
      }
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
        weak: isWeak(hunger, mods.hungerGraceMul),
        rain01: rain,
        mourning: graveyard.graves.length > 0 && graveyard.site() !== null,
        gathering: inputs.gathering,
      } satisfies AgentInputs);
      // A crew that lost members to hunger is made up from the free builders.
      for (const site of remoteSites) {
        const size = agents.crewSize(site);
        if (site.stage < 2 && size < VILLAGE.RESTORATION.CREW.MIN) {
          agents.recruitCrew(site, VILLAGE.RESTORATION.CREW.MAX - size);
        }
      }
      for (let i = villagers.count - 1; i >= 0; i--) {
        if (villagers.dying[i]! >= VILLAGE.HUNGER.COLLAPSE_S + VILLAGE.HUNGER.FADE_S) {
          removeDead(i, events);
        }
      }
      for (const field of fields) {
        const rainBoost = rainBoostOf(VILLAGE.FIELDS.RAIN_BOOST);
        const boost =
          (1 + VILLAGE.FIELDS.TEND_BOOST * Math.min(3, field.tenders)) *
          (1 + rainBoost * rain) *
          blessings.boost('field', field.id);
        field.growth = Math.min(1, field.growth + (dt / VILLAGE.FIELDS.GROW_S) * boost);
        // A tended, ripe field is harvested and replanted.
        if (field.growth >= 1 && field.tenders > 0) {
          field.growth = 0;
          economy.addFood(VILLAGE.ECONOMY.FIELD_YIELD + mods.fieldYieldAdd);
        }
      }
      // A hamlet that is not converted yet does not grow.
      if (!converted) return;
      planTimer += dt;
      if (planTimer >= PLAN.INTERVAL_S) {
        planTimer = 0;
        if (!startSite(events, false)) {
          const candidate = nextUpgrade();
          if (candidate) upgradeBuilding(candidate.id, events);
        }
        support.grow(events);
      }
      spawnTimer += dt;
      if (spawnTimer >= SPAWN_CHECK_S) {
        spawnTimer = 0;
        if (
          population.hasRoom() &&
          faith.faith >= VILLAGE.FAITH.VILLAGER_COST &&
          // A newcomer needs a day of food in the larder for everyone, themselves included.
          economy.canFeed(villagers.count + 1) &&
          // Newcomers to a converted hamlet arrive believing.
          population.spawn({ belief: mode === 'hamlet' ? 1 : 0 })
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
      believers: believerCount(),
      converted,
      beds: population.totalBeds(),
      fields: fields.length,
      wood: economy.stock.wood,
      food: economy.stock.food,
      woodCap: economy.caps().wood,
      foodCap: economy.caps().food,
      foodPerDay: foodPerDay(villagers.count),
      mealsServed,
      mealsMissed,
      hunger: stageOf(hunger, economy.hungry, mods.hungerGraceMul),
      dying: dyingCount(),
      graves: graveyard.graves.length,
      forest: forest.counts(),
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
    bless: (kind, id, seconds) => {
      const ok =
        kind === 'field'
          ? fields.some((f) => f.id === id)
          : kind === 'house'
            ? buildings.some((b) => b.id === id && isHouse(b) && isFinished(b))
            : id >= 0 &&
              id < forest.count &&
              (forest.state(id) === TreeState.Standing || forest.state(id) === TreeState.Sapling);
      if (!ok) return false;
      blessings.add(kind, id, seconds);
      return true;
    },
    isBlessed: (kind, id) => blessings.boost(kind, id) > 1,
    blessings: blessings.list,
    prayers,
    hearten: hearten.list,
    heartenLeft: hearten.leftOf,
    heartenVillager: (villager, events, free = false) => {
      if (villager < 0 || villager >= villagers.count || villagers.dying[villager]! > 0) {
        return 'unknown';
      }
      if (hearten.leftOf(villager).cool > 0) return 'cooldown';
      if (!free && faith.faith < VILLAGE.HEARTEN.FAITH) return 'faith';
      if (!free) faith.faith -= VILLAGE.HEARTEN.FAITH;
      hearten.touch(villager);
      const mended = restoreBeliefOf(villager, events);
      events.push({ kind: 'villagerHeartened', villager, mended, aera: villager === aera });
      return 'ok' satisfies HeartenResult;
    },
    restoreBelief: (villager, events) => {
      if (villager < 0 || villager >= villagers.count || villagers.dying[villager]! > 0) {
        return false;
      }
      return restoreBeliefOf(villager, events);
    },
    plotCheck: (type, x, z, rotY) => plotCheck(type, x, z, rotY),
    placePlot: (type, x, z, rotY, events) => placePlot(type, x, z, rotY, events),
    plotFacing: (x, z) => plotFacing(context(), x, z),
    upgrade: (id, events) => upgradeBuilding(id, events),
    upgradeCeiling: (id) => {
      const b = buildings.find((x) => x.id === id);
      return b ? tierCeiling(b, mods) : 1;
    },
    kindle: (siteId, events) => {
      const site = buildings.find((b) => b.id === siteId);
      if (!site || !isOpenSite(site)) return false;
      workOn(site, remainingWork(site), events);
      return true;
    },
    provide: (food) => economy.addFood(food) > 0,
    uprootTree: (id, events) => forest.uproot(id, events),
    takeHarvest: (fieldId) => {
      const field = fields.find((f) => f.id === fieldId);
      if (!field || field.growth < VILLAGE.HAND.WHEAT.MIN_RIPE) return 0;
      const food = (VILLAGE.ECONOMY.FIELD_YIELD + mods.fieldYieldAdd) * field.growth;
      field.growth = 0;
      return food;
    },
    haul: (siteId, wood, events) => {
      const site = buildings.find((b) => b.id === siteId);
      if (!site || !isOpenSite(site) || !(wood > 0)) return 0;
      const seconds = wood * VILLAGE.HAND.WORK_PER_WOOD_S;
      workOn(site, seconds, events);
      return seconds;
    },
    fellNear: (x, z, n, events) => {
      let felled = 0;
      for (const id of forest.nearest(x, z, n)) {
        const tree = forest.info(id);
        const len = Math.hypot(tree.x - x, tree.z - z) || 1;
        if (forest.fell(id, (tree.x - x) / len, (tree.z - z) / len, events) > 0) felled++;
      }
      return felled;
    },
    starve: (events) => {
      economy.drainFood();
      hunger.level = Math.max(hunger.level, weakAtS(mods.hungerGraceMul));
      noteHunger(events);
    },
    killOne: (events) => {
      const victim = pickVictim(villagers, elder, converted, aera);
      if (victim >= 0) beginDying(victim, events);
      return victim;
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
    believers: believerCount,
    gatheredShare: (radiusM) => {
      const t = temple();
      if (!t || villagers.count === 0) return 0;
      let here = 0;
      for (let i = 0; i < villagers.count; i++) {
        if (!believes(villagers.belief, villagers.dying, i) || villagers.indoors[i]) continue;
        if (Math.hypot(villagers.x[i]! - t.x, villagers.z[i]! - t.z) <= radiusM) here++;
      }
      return here / villagers.count;
    },
    notice: agents.notice,
    convertVillage: (events) => {
      if (mode !== 'hamlet' || converted) return false;
      converted = true;
      events.push({ kind: 'villageConverted' });
      return true;
    },
    beliefShare: () => beliefShare(villagers.belief, villagers.count),
    addBelief: (villager, amount, events) => {
      if (villager < 0 || villager >= villagers.count || villagers.dying[villager]! > 0)
        return false;
      const crossed = raiseBelief(villagers.belief, villager, amount);
      if (crossed) {
        events.push({ kind: 'villagerConverted', villager, converts: believerCount() });
      }
      return crossed;
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
      remoteSites: remoteSites.map((r) => ({ ...r, route: [...r.route] })),
      faith: { ...faith },
      economy: economy.serialize(),
      hunger: { ...hunger },
      graveyard: graveyard.serialize(),
      forest: forest.serialize(),
      blessings: blessings.serialize(),
      prayers: serializePrayers(prayers),
      hearten: hearten.serialize(),
      villagers: serializeVillagers(villagers),
      occupant: grid.occupant.slice(),
      pathiness: pathfinder.getPathiness()?.slice() ?? null,
      wear: wear.serialize(),
      network: network.serialize(),
      support: support.serialize(),
      agents: agents.serialize(),
      rng: { plan: rngs.plan.exportState(), agents: rngs.agents.exportState() },
      converted,
      elder,
      aera,
    }),
  };
}
