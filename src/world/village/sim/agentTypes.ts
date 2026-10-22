// src/world/village/sim/agentTypes.ts — what the villagers' behaviour is given, reports and saves (types only)

import type { VillageAssetMeta } from '../model/assetKeys.ts';
import type { Building, Field, RemoteSite, Villagers } from '../model/types.ts';
import type { Pathfinder } from './pathfind.ts';
import type { SitePlan } from './planner.ts';
import type { WorkSpots } from './workSpots.ts';

export interface AgentInputs {
  /** Day-cycle phase 0..1 (0.25 sunrise, 0.75 sunset). */
  dayPhase: number;
  /** Phase 0: the sun never rises, so some people keep vigil at night. */
  vigil: boolean;
  /** Orb presence 0..1, which speeds builders up. */
  boost01: number;
  /** Hunger has made everyone weak: slower, and only the food gatherers still work (at half rate). */
  weak: boolean;
  /**
   * Rain 0..1: at `SHELTER.RAIN_ON` everyone but the priests goes home, and stays there until it falls
   * below `RAIN_OFF` (a villager already at home is the memory, so a drizzle at the edge does not flicker).
   */
  rain01: number;
  /** The graveyard has graves, so priests mourn there at dusk. */
  mourning: boolean;
}

export interface AgentStats {
  asleep: number;
  praying: number;
  working: number;
  wandering: number;
  /** At a meal, at home out of the weather, or at the graves. */
  eating: number;
  sheltering: number;
  mourning: number;
  walking: number;
  pathQueue: number;
}

export interface AgentsOptions {
  pool: Villagers;
  pathfinder: Pathfinder;
  rng: () => number;
  /** Live building list (the sim appends to it). */
  buildings: readonly Building[];
  /** Live field list (the sim appends to it). */
  fields: readonly Field[];
  metaOf: (type: Building['type']) => Pick<VillageAssetMeta, 'door' | 'workSlots'>;
  /** Trees and shores where woodcutters and fishermen stand. */
  spots: WorkSpots;
  /** A fisherman at the shore made `amount` of food in a step. */
  onFish: (amount: number) => void;
  /** Whether a tree (its index in the forest) still stands. */
  isStanding: (tree: number) => boolean;
  /**
   * A woodcutter chops a tree for `dt` seconds, the tree falling toward (dirX, dirZ) when the last hit lands.
   * True once it has fallen.
   */
  onChop: (tree: number, dt: number, dirX: number, dirZ: number) => boolean;
  /** A villager sits down to a meal of round `round` (1 midday, 2 evening); the sim takes the food from the larder. */
  onEat: (villager: number, round: number) => void;
  /** The graveyard plot, or null when there is none. */
  graveSite: () => SitePlan | null;
  /** Multiplies how fast builders build (a skill). */
  builderRateMul: () => number;
  /** How much faster this villager works: a blessing on their house (1 when none). */
  workBoost: (villager: number) => number;
  /** Builder-seconds delivered to a site. */
  onWork: (site: Building, seconds: number) => void;
  /** Live list of remote sites (the sim appends to it). */
  remoteSites: readonly RemoteSite[];
  /** Builder-seconds delivered to a remote site by its camped crew. */
  onRemoteWork: (site: RemoteSite, seconds: number) => void;
  /** A villager walked `distance` m and now stands at (x, z). */
  onWalk: (x: number, z: number, distance: number) => void;
}

/** What agents keep apart from the villager pool (which a save holds itself). */
export interface AgentsState {
  /** Villagers waiting for a path, oldest first. */
  pathQueue: number[];
}

export interface Agents {
  /** Once per fixed update: remember positions for render interpolation. */
  beginStep: () => void;
  update: (dt: number, inputs: AgentInputs) => void;
  /**
   * Holds a villager still, facing (x, z), for `seconds` (the orb's powers do this): they drop whatever
   * they were doing for the moment and take it up again afterwards. Nothing is kept in a save. False for
   * someone indoors.
   */
  notice: (villager: number, x: number, z: number, seconds: number) => boolean;
  /** Sends up to `max` free builders to a remote site; returns how many went (they leave their routine until it is done). */
  recruitCrew: (site: RemoteSite, max: number) => number;
  /** Builders on the crew of a remote site. */
  crewSize: (site: RemoteSite) => number;
  /** A villager begins to die: they drop what they were doing and fall; the sim removes them later. */
  startDying: (villager: number) => void;
  /**
   * Take a villager out of the pool and follow the move of the last one into their slot: the path queue,
   * the notices and the work claims. Returns the old index of the villager who moved (see `removeVillager`).
   */
  remove: (villager: number) => number;
  stats: () => AgentStats;
  serialize: () => AgentsState;
  /** Call after the pool is restored: it also rebuilds the work-slot and spot claims from the pool. */
  restore: (state: AgentsState) => void;
}
