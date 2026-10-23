// src/world/village/sim/villageSimTypes.ts — the shapes of the village sim: its saved state, inputs, stats and API
// (types only; `villageSim.ts` builds the sim and re-exports these)

import type { Modifiers } from '../../../skills/modifiers.ts';
import type { VillageAssetMeta, VillageBuildingType } from '../model/assetKeys.ts';
import type { VillageSeed } from '../model/seed.ts';
import type {
  Building,
  Field,
  Grave,
  RemoteSite,
  VillageEvent,
  Villagers,
} from '../model/types.ts';
import type { AgentStats, AgentsState } from './agents.ts';
import type { Economy, EconomyState } from './economy.ts';
import type { FaithInputs, FaithState } from './faith.ts';
import type { Forest, ForestCounts, ForestState, TreeInfo } from './forest.ts';
import type { GraveyardState } from './graveyard.ts';
import type { Heartened, HeartenResult } from './hearten.ts';
import type { HungerStage, HungerState } from './hunger.ts';
import type { OutpostRefusal } from './outposts.ts';
import type { Pathfinder, PathfinderStats } from './pathfind.ts';
import type { PathNetwork, PathNetworkState, PathNetworkStats } from './pathNetwork.ts';
import type { PlotRefusal } from './planner.ts';
import type { PrayersState } from './prayers.ts';
import type { RingModel } from './ringModel.ts';
import type { SiteGrid } from './siteGrid.ts';
import type { SupportState } from './support.ts';
import type { TerrainSampler } from './terrainSampler.ts';
import type { UpgradeRefusal } from './upgrades.ts';
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
  /** Places of power the village is restoring (or has restored), far outside the site grid. */
  remoteSites: RemoteSite[];
  faith: FaithState;
  /** Wood and food in store. */
  economy: EconomyState;
  /** How long the larder has been empty, in the way that matters (see hunger.ts). */
  hunger: HungerState;
  /** The graveyard's plot and the graves in it. */
  graveyard: GraveyardState;
  /** Trees that fell or are growing back, and the chopping done on the others. */
  forest: ForestState;
  /** Open prayers, the lapsed and the count of answered ones. */
  prayers: PrayersState;
  /** Villagers lifted by a Hearten, and their cooldowns. */
  hearten: Heartened[];
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
  /** Villager index of Aera, the protected shepherd girl, or -1. */
  aera: number;
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
  /** The whole village gathers to pray at dusk (the story's last night). */
  gathering: boolean;
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
  /** Villager index of Aera (never a famine victim), or -1. */
  readonly aera: number;
  readonly buildings: readonly Building[];
  readonly villagers: Villagers;
  readonly fields: readonly Field[];
  /** Restorations of places of power far outside the village. */
  readonly remoteSites: readonly RemoteSite[];
  readonly faith: FaithState;
  /** Wood and food. */
  readonly economy: Economy;
  /** The map's trees as the village sees them. */
  readonly forest: Forest;
  /** The dead's resting place. */
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
  /**
   * A crew sets out to restore the place of power of this `kind` at (x, z): 'ok', or why not ('busy' it was
   * begun already, 'no-route' it cannot be reached on foot in time, 'no-crew' too few free builders).
   */
  startRemoteSite: (
    kind: string,
    x: number,
    z: number,
    events: VillageEvent[],
  ) => 'ok' | 'busy' | 'no-route' | 'no-crew';
  /**
   * Whether an outpost of this kind may stand at (x, z): cheap, no route search ('inside' the village, 'near'
   * another outpost, no 'resource' close, not a known 'type'), or null when it may.
   */
  outpostCheck: (kind: string, x: number, z: number) => OutpostRefusal | null;
  /**
   * The player marks an outpost beyond the village: a crew sets out, paid in wood and faith (free skips the
   * cost and the limit, for DEV). Says why not when it cannot.
   */
  startOutpost: (
    kind: string,
    x: number,
    z: number,
    events: VillageEvent[],
    free?: boolean,
  ) => OutpostResult;
  /** DEV: finish a remote site at once; its crew walks home. */
  completeRemoteSite: (kind: string, events: VillageEvent[]) => boolean;
  completeOpenSites: (events: VillageEvent[]) => void;
  spawnVillagers: (count: number) => number;
  /** Villagers who believe, and the share of the village that does (0..1). */
  believers: () => number;
  /** The share of the villagers (0..1) who believe and stand within `radiusM` of the temple. */
  gatheredShare: (radiusM: number) => number;
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
   * The orb's hand (story-mechanics/HAND.md). The village changes only when an item is delivered, so each of
   * these is one call between steps and draws no random number. `uprootTree` pulls a standing tree out of the
   * ground and returns the wood it gave (0 when it was not standing); the caller puts it in the stores.
   * `takeHarvest` reaps a ripe field (growth at least `HAND.WHEAT.MIN_RIPE`) and returns the food (0 when not
   * ripe). `haul` counts wood brought to an open site (or an upgrade under way) as builder work and returns the
   * seconds of work given (0 when there is no such site).
   */
  uprootTree: (id: number, events: VillageEvent[]) => number;
  takeHarvest: (fieldId: number) => number;
  haul: (siteId: number, wood: number, events: VillageEvent[]) => number;
  /** What a plot of `type` at (x, z) facing `rotY` would come to (no effect): `'ok'` or the reason it cannot. */
  plotCheck: (type: VillageBuildingType, x: number, z: number, rotY: number) => PlotResult;
  /** The player marks a plot: a site starts there, paid like any site. */
  placePlot: (
    type: VillageBuildingType,
    x: number,
    z: number,
    rotY: number,
    events: VillageEvent[],
  ) => PlotResult;
  /** The facing a plot gets by default (the door toward the temple). */
  plotFacing: (x: number, z: number) => number;
  /** Begins the next upgrade of a finished building, paying its wood and faith; says why when it cannot. */
  upgrade: (id: number, events: VillageEvent[]) => UpgradeStart;
  /** The highest level the skill tree allows this building now (1 when none). */
  upgradeCeiling: (id: number) => number;
  /** Who is praying for what, who lost their belief, and how many prayers were answered. */
  readonly prayers: Readonly<PrayersState>;
  /** Villagers lifted by a Hearten now, with the seconds of lift and of cooldown they have left. */
  readonly hearten: readonly Heartened[];
  heartenLeft: (villager: number) => { left: number; cool: number };
  /**
   * The player touches a villager: faith is paid (free skips it, for DEV), they work faster for a while,
   * a lapsed belief is restored and a prayer of theirs is answered. Says why not when it cannot.
   */
  heartenVillager: (villager: number, events: VillageEvent[], free?: boolean) => HeartenResult;
  /** A villager's belief is restored at once (answers any prayer of theirs); true when it had lapsed or been low. */
  restoreBelief: (villager: number, events: VillageEvent[]) => boolean;
  /** A copy of the whole sim state (see `VillageSimState`); safe to keep while the sim runs on. */
  serialize: () => VillageSimState;
}

/** What marking an outpost came to: `'ok'` or why not. */
export type OutpostResult =
  | 'ok'
  | OutpostRefusal
  | 'not-converted'
  | 'limit'
  | 'no-route'
  | 'no-crew'
  | 'wood'
  | 'faith';

/** What marking a plot came to: `'ok'` or why not. */
export type PlotResult =
  | 'ok'
  | PlotRefusal
  | 'type'
  | 'not-converted'
  | 'locked'
  | 'full'
  | 'cap'
  | 'wood'
  | 'faith';

/** What starting an upgrade came to: it began, or why not. */
export type UpgradeStart = 'ok' | UpgradeRefusal | 'cap' | 'wood' | 'faith';

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
