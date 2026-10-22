// src/world/village/model/buildings.ts — small questions about buildings that several systems ask
// (pure: no DOM, node-runnable)

import { VILLAGE } from '../../../config/village.ts';
import type { Building } from './types.ts';

/** The village's temple, or undefined before one exists. */
export const templeOf = (buildings: readonly Building[]): Building | undefined =>
  buildings.find((b) => b.type === 'temple');

/** Houses of any size (`house_*`). */
export const isHouse = (b: Pick<Building, 'type'>): boolean => b.type.startsWith('house_');

/** Built (stage 2); the opposite of `isOpenSite` in sim/construction. */
export const isFinished = (b: Building): boolean => b.stage >= 2;

/** Beds a house gains from its upgrade level (0 for any other building). */
export const levelBeds = (b: Pick<Building, 'type' | 'level'>): number =>
  isHouse(b) ? (b.level - 1) * VILLAGE.UPGRADES.BEDS_PER_LEVEL : 0;

/** Factor on a store building's capacity from its upgrade level. */
export const levelCapFactor = (b: Pick<Building, 'level'>): number =>
  1 + (b.level - 1) * VILLAGE.UPGRADES.STORE_CAP_SHARE;

/**
 * Beds a building gives: only a finished one has any. `houseExtra` is the beds a skill adds to every house;
 * a house's upgrade level adds its own.
 */
export const bedsOf = (b: Building, houseExtra = 0): number =>
  isFinished(b)
    ? (VILLAGE.VILLAGERS.BEDS[b.type] ?? 0) + (isHouse(b) ? houseExtra + levelBeds(b) : 0)
    : 0;
