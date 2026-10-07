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
  /** Plinth top is the floor (y = 0 of the model); the base sinks below the lowest ground. */
  plinthTopY: number;
  plinthBaseY: number;
  stage: VillageStage;
  /** Builder-seconds of work into the current stage (0 once finished). */
  progress: number;
  /** Ring the building stands on (0 innermost); -1 for the temple, the well and other off-ring pieces. */
  ring: number;
}

/** Footprint inside the walls (m): local x by z. */
export type FootprintOf = (type: VillageBuildingType) => readonly [number, number];

/** What a villager is doing (or wants to be doing). */
export const Activity = { Sleep: 0, Pray: 1, Work: 2, Wander: 3 } as const;
export type ActivityId = (typeof Activity)[keyof typeof Activity];

export const Role = { Builder: 0, Priest: 1, Idler: 2, Farmer: 3 } as const;
export type RoleId = (typeof Role)[keyof typeof Role];

/** Which pose the figure shows; the vertex shader blends between them. */
export const Anim = { Idle: 0, Walk: 1, Work: 2, Pray: 3, Carry: 4 } as const;
export type AnimId = (typeof Anim)[keyof typeof Anim];

/** Movement state machine of one villager. */
export const Mode = {
  /** Standing at nowhere in particular; decides next. */
  Free: 0,
  /** A path is requested and not computed yet. */
  Pending: 1,
  Walking: 2,
  /** Arrived: praying, working or pausing for `timer` seconds. */
  Acting: 3,
  /** Walking through the door; goes indoors when `timer` runs out. */
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
  variant: Uint8Array;
  /** Per-person schedule shift (day-cycle phase) so the village does not move as one. */
  offset: Float32Array;
  /** 0..1, fixed: low values join optional prayers. */
  piety: Float32Array;
  /** Phase 0 night: 0 sleeps, 1 works, 2 prays. */
  nightOwl: Uint8Array;
  role: Uint8Array;
  /** Building id of the bed (0 none). */
  home: Int32Array;
  activity: Uint8Array;
  mode: Uint8Array;
  /** Building id of the current target (site, temple or home). */
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
}

/** A tilled plot beside the village; rows are drawn as crops that grow and ripen. */
export interface Field {
  id: number;
  x: number;
  z: number;
  rotY: number;
  halfW: number;
  halfD: number;
  /** Which crop mesh (0 gold, 1 green). */
  crop: 0 | 1;
  /** 0 freshly planted .. 1 ripe. */
  growth: number;
  /** Farmers at work this step (reset every step). */
  tenders: number;
}

/** What the sim reports to its view: a building or field began, or a building finished a stage. */
export type VillageEvent =
  | { kind: 'siteStarted'; building: Building }
  | { kind: 'fieldStarted'; field: Field }
  | { kind: 'stageCompleted'; building: Building; stage: VillageStage };
