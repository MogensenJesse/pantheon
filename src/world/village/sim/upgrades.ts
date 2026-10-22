// src/world/village/sim/upgrades.ts — upgrade levels of finished buildings (pure, node-runnable)
//
// A finished house, granary or workshop can rise from level 1 to `MAX_LEVEL`. The skill tree sets how high
// (`houseTier`, `storeTier`); the village then spends wood and faith and its builders work on it while the
// building stays finished and in use. `Building.upgrade` holds the builder-seconds still needed (0 = none).

import { VILLAGE } from '../../../config/village.ts';
import { isFinished } from '../model/buildings.ts';
import type { Building } from '../model/types.ts';
import { woodCostOf } from './economy.ts';

const U = VILLAGE.UPGRADES;

export type UpgradeGroup = 'house' | 'store';

/** Which tier the skill tree opens for a building, or null when it cannot be upgraded. */
export function upgradeGroup(b: Pick<Building, 'type'>): UpgradeGroup | null {
  if (b.type === 'granary' || b.type === 'workshop') return 'store';
  return b.type.startsWith('house_') ? 'house' : null;
}

export interface TierCeilings {
  houseTier: number;
  storeTier: number;
}

/** The highest level the tree allows this building (1 when it allows none). */
export function tierCeiling(b: Pick<Building, 'type'>, tiers: TierCeilings): number {
  const group = upgradeGroup(b);
  if (group === 'house') return Math.min(U.MAX_LEVEL, tiers.houseTier);
  if (group === 'store') return Math.min(U.MAX_LEVEL, tiers.storeTier);
  return 1;
}

export type UpgradeRefusal = 'unsupported' | 'unfinished' | 'busy' | 'maxed' | 'tier';

/** Whether a building can start its next upgrade now (resources and the active cap are checked by the caller). */
export function checkUpgrade(
  b: Building,
  tiers: TierCeilings,
): { ok: true } | { ok: false; reason: UpgradeRefusal } {
  if (upgradeGroup(b) === null) return { ok: false, reason: 'unsupported' };
  if (!isFinished(b)) return { ok: false, reason: 'unfinished' };
  if (b.upgrade > 0) return { ok: false, reason: 'busy' };
  if (b.level >= U.MAX_LEVEL) return { ok: false, reason: 'maxed' };
  if (b.level >= tierCeiling(b, tiers)) return { ok: false, reason: 'tier' };
  return { ok: true };
}

export interface UpgradeCost {
  wood: number;
  faith: number;
  workS: number;
}

/** What the step from the building's level to the next costs. */
export function upgradeCost(b: Pick<Building, 'type' | 'level'>): UpgradeCost {
  const step = Math.min(U.MAX_LEVEL - 1, Math.max(1, b.level)) - 1;
  return {
    wood: Math.ceil(woodCostOf(b.type) * U.WOOD_SHARE[step]!),
    faith: U.FAITH[step]!,
    workS: U.WORK_S[step]!,
  };
}

/** Puts a finished building under upgrade (the cost has been paid). */
export function beginUpgrade(b: Building): void {
  b.upgrade = upgradeCost(b).workS;
}

/** Adds builder work to an upgrade under way; true when it just completed (the level rose). */
export function applyUpgradeWork(b: Building, workSeconds: number): boolean {
  if (b.upgrade <= 0) return false;
  b.upgrade = Math.max(0, b.upgrade - workSeconds);
  if (b.upgrade > 0) return false;
  b.level += 1;
  return true;
}
