// src/world/village/sim/villageSimTypes.ts — the shapes of the village sim: its saved state, inputs, stats and API
// (types only; `villageSim.ts` builds the sim and re-exports these)

import type { Modifiers } from '../../../skills/modifiers.ts';
import type { VillageAssetMeta } from '../model/assetKeys.ts';
import type { VillageSeed } from '../model/seed.ts';
import type { Building, Field, Grave, VillageEvent, Villagers } from '../model/types.ts';
import type { AgentStats, AgentsState } from './agents.ts';
import type { Blessing, BlessKind } from './blessings.ts';
import type { Economy, EconomyState } from './economy.ts';
import type { FaithInputs, FaithState } from './faith.ts';
import type { Forest, ForestCounts, ForestState, TreeInfo } from './forest.ts';
import type { GraveyardState } from './graveyard.ts';
import type { HungerStage, HungerState } from './hunger.ts';
import type { Pathfinder, PathfinderStats } from './pathfind.ts';
import type { PathNetwork, PathNetworkState, PathNetworkStats } from './pathNetwork.ts';
import type { RingModel } from './ringModel.ts';
import type { SiteGrid } from './siteGrid.ts';
import type { SupportState } from './support.ts';
import type { TerrainSampler } from './terrainSampler.ts';
import type { RngState } from './villageRng.ts';
import type { VillagersState } from './villagerPool.ts';
import type { WearField, WearState } from './wearField.ts';
import type { WorkSpots } from './workSpots.ts';

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
  /** Wood and food in store. */
  economy: EconomyState;
  /** How long the larder has been empty, in the way that matters (see hunger.ts). */
  hunger: HungerState;
  /** The graveyard's plot and the graves in it. */
  graveyard: GraveyardState;
  /** Trees that fell or are growing back, and the chopping done on the others. */
  forest: ForestState;
  /** What the Blessing power is speeding up, and for how long (M9). */
  blessings: Blessing[];
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
  /** Growth is open: always in a sandbox village, once converted in a hamlet. */
  converted: boolean;
  /** Villager index of the elder (the first priest), or -1. */
  elder: number;
};

/**
 * hamlet: the game's village, a finished hamlet that does not grow, bring newcomers or earn faith until
 * it is converted. sandbox: the village grows by itself from the start (headless checks, DEV `?sandbox`).
 */
export type VillageMode = 'hamlet' | 'sandbox';

export interface VillageSimInputs extends FaithInputs {
  /** Day-cycle phase 0..1 (0.25 sunrise). */
  dayPhase: number;
  /** Phase 0: the sun never rises, so some people keep vigil through the night. */
  vigil: boolean;
  /** Rain 0..1: villagers go indoors at `SHELTER.RAIN_ON` and come out below `RAIN_OFF`. */
  rain01: number;
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
  /** Villagers who believe. */
  believers: number;
  converted: boolean;
  beds: number;
  fields: number;
  /** Wood and food in store, what the stores hold at most, and food eaten per game day. */
  wood: number;
  food: number;
  woodCap: number;
  foodCap: number;
  foodPerDay: number;
  /** Meals eaten whole, and meals the larder could not fill (since the sim began or was loaded). */
  mealsServed: number;
  mealsMissed: number;
  /** Hunger: fed, the larder ran out, weak, or losing people. */
  hunger: HungerStage;
  /** Villagers dying right now, and graves so far. */
  dying: number;
  graves: number;
  /** The map's trees: standing, falling, stumps, saplings. */
  forest: ForestCounts;
  agents: AgentStats;
  path: PathfinderStats;
  /** Laid footpaths: links, connectivity to the plaza. */
  network: PathNetworkStats;
  /** Buildings per ring, innermost first. */
  ringCounts: number[];
}

export interface VillageSim {
  readonly seed: VillageSeed;
  readonly mode: VillageMode;
  /** Growth is open (see `VillageSimState.converted`). */
  readonly converted: boolean;
  /** Villager index of the elder, or -1. */
  readonly elder: number;
  readonly buildings: readonly Building[];
  readonly villagers: Villagers;
  readonly fields: readonly Field[];
  readonly faith: FaithState;
  /** Wood and food (M4). */
  readonly economy: Economy;
  /** The map's trees as the village sees them (M6). */
  readonly forest: Forest;
  /** The dead's resting place (M5). */
  readonly graves: readonly Grave[];
  /** Hunger's build-up, in seconds (0 fed .. the point where deaths begin). */
  readonly hunger: Readonly<HungerState>;
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
  /** Add faith (Echo's trail, a power's cost as a negative amount, the DEV cheats). */
  addFaith: (amount: number) => void;
  /** DEV: fell the `n` standing trees nearest (x, z), each falling away from it; returns how many fell. */
  fellNear: (x: number, z: number, n: number, events: VillageEvent[]) => number;
  /** DEV: empty the larder and make everyone weak at once. */
  starve: (events: VillageEvent[]) => void;
  /** DEV: a villager dies now (the one hunger would pick); returns their index or -1. */
  killOne: (events: VillageEvent[]) => number;
  startSiteNow: (events: VillageEvent[]) => boolean;
  completeOpenSites: (events: VillageEvent[]) => void;
  spawnVillagers: (count: number) => number;
  /** Villagers who believe, and the share of the village that does (0..1). */
  believers: () => number;
  beliefShare: () => number;
  /**
   * Raises a villager's belief (the orb's powers do this). True when it just reached 1; the events carry
   * the convert. What converts the village is `convertVillage`.
   */
  addBelief: (villager: number, amount: number, events: VillageEvent[]) => boolean;
  /**
   * Converts the hamlet: growth opens and the event is reported (the conversion quest ends with this).
   * False when it already is converted, and in a sandbox village.
   */
  convertVillage: (events: VillageEvent[]) => boolean;
  /** Holds a villager still, facing (x, z), for a few seconds (the powers do this); false for someone indoors. */
  notice: (villager: number, x: number, z: number, seconds: number) => boolean;
  /**
   * The builder powers (M9). Blessing: a field, a finished house or a standing tree or sapling works or grows
   * faster for `seconds`; false when there is no such thing. Kindle: finishes the current stage of an open
   * site. Provide: puts food in the larder, false when it is full.
   */
  bless: (kind: BlessKind, id: number, seconds: number) => boolean;
  isBlessed: (kind: BlessKind, id: number) => boolean;
  kindle: (siteId: number, events: VillageEvent[]) => boolean;
  provide: (food: number) => boolean;
  /** What the Blessing power is speeding up now. */
  readonly blessings: readonly Blessing[];
  /** A copy of the whole sim state (see `VillageSimState`); safe to keep while the sim runs on. */
  serialize: () => VillageSimState;
}

export type MetaOf = (
  type: Building['type'],
) => Pick<VillageAssetMeta, 'footprint' | 'door' | 'workSlots'>;

export interface VillageSimOptions {
  sampler: TerrainSampler;
  metaOf: MetaOf;
  seed: VillageSeed;
  /** The map's trees (the index is the tree's id): woodcutters chop the ones in the village's reach. */
  trees?: readonly TreeInfo[];
  /** Continue a saved village instead of founding a new one (same map and seed). */
  restore?: VillageSimState;
  /** Default 'sandbox' (the village grows by itself); the game passes 'hamlet'. */
  mode?: VillageMode;
  /** What the skills have changed (the live record the game keeps); default: that record. */
  modifiers?: Modifiers;
}
