// src/world/village/model/types.ts — village simulation state shapes (pure, no three)
import type { VillageBuildingType, VillageStage } from './assetKeys.ts';

export interface Building {
  id: number;
  type: VillageBuildingType;
  x: number;
  z: number;
  rotY: number;
  /** Half footprint (m) in the building's local x / z. */
  halfW: number;
  halfD: number;
  /**
   * Floor height (y = 0 of the model): the mean original ground under the pad, which the terrain is
   * levelled to while the building is built. The base is the lowest original ground under the pad.
   * (Named for the stone plinth they once sized.)
   */
  plinthTopY: number;
  plinthBaseY: number;
  stage: VillageStage;
  /** Builder-seconds of work into the current stage (0 once finished). */
  progress: number;
  /** Upgrade level, 1 (as built) to `UPGRADES.MAX_LEVEL`. */
  level: number;
  /** Builder-seconds still needed by the upgrade under way (the building stays finished); 0 when none. */
  upgrade: number;
  /** Ring the building stands on (0 innermost); -1 for the temple, the well and other off-ring pieces. */
  ring: number;
}

/** Footprint inside the walls (m): local x by z. */
export type FootprintOf = (type: VillageBuildingType) => readonly [number, number];

/** What a villager is doing (or wants to be doing). */
export const Activity = {
  Sleep: 0,
  Pray: 1,
  Work: 2,
  Wander: 3,
  /** A meal, at home or (without a home) on the plaza. */
  Eat: 4,
  /** At home, awake, out of the rain or the dusk. */
  Shelter: 5,
  /** A priest at the graves. */
  Mourn: 6,
} as const;
export type ActivityId = (typeof Activity)[keyof typeof Activity];

export const Role = {
  Builder: 0,
  Priest: 1,
  Idler: 2,
  Farmer: 3,
  /** Ambient: chops trees near the village. */
  Woodcutter: 4,
  /** Ambient: fishes from the shore. */
  Fisherman: 5,
} as const;
export type RoleId = (typeof Role)[keyof typeof Role];
export const ROLE_COUNT = 6;

export const Sex = { Male: 0, Female: 1 } as const;
export type SexId = (typeof Sex)[keyof typeof Sex];

/** Which pose the figure shows; the vertex shader blends between them. Work, Chop, Hoe and Fish show the tool. */
export const Anim = {
  Idle: 0,
  Walk: 1,
  Work: 2,
  Pray: 3,
  Carry: 4,
  Chop: 5,
  Hoe: 6,
  Fish: 7,
  /** A villager falling over as they die (the last pose; earlier ids never change). */
  Collapse: 8,
} as const;
export type AnimId = (typeof Anim)[keyof typeof Anim];

/** The pose a role shows while working. */
export const WORK_ANIM: Readonly<Record<number, AnimId>> = {
  [Role.Farmer]: Anim.Hoe,
  [Role.Woodcutter]: Anim.Chop,
  [Role.Fisherman]: Anim.Fish,
};

/** Movement state machine of one villager. */
export const Mode = {
  /** Standing at nowhere in particular; decides next. */
  Free: 0,
  /** A path is requested and not computed yet. */
  Pending: 1,
  Walking: 2,
  /** Arrived: praying, working or pausing for `timer` seconds. */
  Acting: 3,
  /** Walking the last stretch to or through the door; goes indoors when the path ends. */
  Entering: 4,
} as const;

/** Villagers as parallel typed arrays (struct of arrays); slots 0..count-1 are live. */
export interface Villagers {
  count: number;
  x: Float32Array;
  z: Float32Array;
  /** Position at the start of the current fixed step, for render interpolation. */
  prevX: Float32Array;
  prevZ: Float32Array;
  yaw: Float32Array;
  /** Stride cycle phase 0..1, advanced by distance walked. */
  stride: Float32Array;
  anim: Uint8Array;
  animPrev: Uint8Array;
  animBlend: Float32Array;
  indoors: Uint8Array;
  /** Look seed 0..255: the shader picks the tunic, hair and skin colours from it. */
  variant: Uint8Array;
  /** Body type of the figure (`Sex`). */
  sex: Uint8Array;
  /** Per-person schedule shift (day-cycle phase) so the village does not move as one. */
  offset: Float32Array;
  /** 0..1, fixed: low values join optional prayers. */
  piety: Float32Array;
  /** 0..1, rises through the orb's powers; at 1 the villager believes (a convert). */
  belief: Float32Array;
  /** Seconds since this villager began to die (0 while alive); they are removed once the collapse and the fade are over. */
  dying: Float32Array;
  /** Phase 0 night: 0 sleeps, 1 works, 2 prays. */
  nightOwl: Uint8Array;
  role: Uint8Array;
  /** Building id of the bed (0 none). */
  home: Int32Array;
  activity: Uint8Array;
  /** Routine bits done in the current window: the midday meal, the evening meal, the mourning (`Done` in routine.ts). */
  done: Uint8Array;
  mode: Uint8Array;
  /**
   * What the current journey is for: a building id (site, temple or home), minus a field id for field
   * work, or at most `-WORK_SPOT_ID_BASE` for a tree or shore spot (`sim/workSpots.ts`).
   */
  target: Int32Array;
  /** Work slot claimed at `target`, -1 none. */
  slot: Int8Array;
  timer: Float32Array;
  think: Float32Array;
  destX: Float32Array;
  destZ: Float32Array;
  /** How strongly the current journey prefers paths (rolled per journey). */
  affinity: Float32Array;
  /** Waypoints, MAX_WAYPOINTS x/z pairs per villager. */
  waypoints: Float32Array;
  pathLen: Uint8Array;
  pathCur: Uint8Array;
  /** The remote site this builder is on the crew of (`RemoteSite.id`), 0 for none. */
  crew: Uint8Array;
  /** Where the crew member is in the trip (`CrewPhase`). */
  crewPhase: Uint8Array;
  /** How far along the site's route: the next point to load going out, the points still to walk coming back. */
  routeCur: Uint16Array;
}

/** A crew member's trip to a remote site and back. */
export const CrewPhase = {
  None: 0,
  /** Walking through the village to the start of the route. */
  ToGate: 1,
  /** Walking the route out. */
  Out: 2,
  /** At the camp: working, eating, resting. */
  Camp: 3,
  /** Walking the route back. */
  Back: 4,
} as const;
export type CrewPhaseId = (typeof CrewPhase)[keyof typeof CrewPhase];

/**
 * A restoration of a place of power far outside the village grid. A crew of builders walks `route` out,
 * camps at the end of it and works until the second stage is done. Not a `Building`: it has no footprint,
 * no pad and no place on the site grid.
 */
export interface RemoteSite {
  /** From 1; the crew arrays hold it. */
  id: number;
  /** The landmark kind being restored. */
  kind: string;
  /** The place of power itself. */
  x: number;
  z: number;
  /** The camp: where the route ends, on walkable ground near the place. */
  campX: number;
  campZ: number;
  stage: VillageStage;
  /** Builder-seconds of work into the current stage (0 once finished). */
  progress: number;
  /** x, z pairs from the village's edge (where the crew leaves the local paths) to the camp. */
  route: number[];
}

/** A place where an ambient worker stands (a tree to chop, a shore to fish from) and the point it faces. */
export interface WorkSpot {
  /** At least `WORK_SPOT_ID_BASE`, so `-id` never collides with a field's negative target. */
  id: number;
  /** For a tree spot: the tree's index in the forest. */
  tree?: number;
  x: number;
  z: number;
  faceX: number;
  faceZ: number;
}

export const WORK_SPOT_ID_BASE = 10_000;

/** A plot beside the village; wheat grows in it (drawn by the grass system) and ripens with `growth`. */
export interface Field {
  id: number;
  x: number;
  z: number;
  rotY: number;
  halfW: number;
  halfD: number;
  /** 0 freshly planted .. 1 ripe. */
  growth: number;
  /** Farmers at work this step (reset every step). */
  tenders: number;
}

/**
 * What the sim reports to its view and the bus: sites and fields starting, stages completing, belief,
 * hunger, deaths and graves, and the forest (a tree falling, a stump, a sapling, a tree grown).
 */
export type VillageEvent =
  | { kind: 'siteStarted'; building: Building }
  /** A crew set out to restore a place of power; it is finished when its second stage completes. */
  | { kind: 'remoteStarted'; site: RemoteSite }
  | { kind: 'remoteStageCompleted'; site: RemoteSite; stage: VillageStage }
  | { kind: 'fieldStarted'; field: Field }
  | { kind: 'stageCompleted'; building: Building; stage: VillageStage }
  /** A finished building began an upgrade / finished it and rose to `level`. */
  | { kind: 'upgradeStarted'; building: Building }
  | { kind: 'upgradeCompleted'; building: Building; level: number }
  /** A villager's belief reached 1; `converts` counts everyone who believes now. */
  | { kind: 'villagerConverted'; villager: number; converts: number }
  /** The elder and enough of the village believe: the hamlet is converted and starts to grow. */
  | { kind: 'villageConverted' }
  /** Hunger's stages: the larder is empty, everyone is weak, food is back. */
  | { kind: 'hunger'; stage: 'empty' | 'weak' | 'recovered' }
  /** A villager began to die (hunger); they are removed after the collapse. */
  | { kind: 'villagerDying'; villager: number }
  /**
   * A villager was removed from the pool: `moved` is the index the last villager had before it took the
   * freed slot (-1 when the removed one was the last). Anything that holds a villager index has to follow.
   */
  | { kind: 'villagerDied'; villager: number; moved: number }
  /** A grave appeared in the graveyard. */
  | { kind: 'graveAdded'; grave: Grave }
  /** A woodcutter's last hit landed: the tree falls toward (dirX, dirZ). */
  | { kind: 'treeFelled'; tree: number; dirX: number; dirZ: number }
  /** The fall is over: a stump. */
  | { kind: 'treeStump'; tree: number }
  /** A sapling begins to grow at the stump. */
  | { kind: 'treeSapling'; tree: number }
  /** A sapling reached full size: the tree stands again. */
  | { kind: 'treeGrown'; tree: number };

/** A grave in the graveyard: where it stands and which way its headstone faces. */
export interface Grave {
  x: number;
  z: number;
  yaw: number;
}
