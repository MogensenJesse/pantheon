// src/world/village/sim/hearten.ts — a touch on one villager: lifted for a while, belief restored (pure)
//
// Hearten is the hand of this game: the player touches a villager from the info panel (nothing is picked up
// or thrown). It costs faith, lifts that villager's work rate for `DURATION_DAYS`, restores their belief
// (answering a prayer they voiced) and cannot be repeated on them for `COOLDOWN_DAYS`. Villagers are
// indices that move when someone is removed, so the list follows `removeVillager`.

import { VILLAGE } from '../../../config/village.ts';
import { isCount, isInt, isRecord } from '../../../core/guards.ts';
import { followMove } from './villagerPool.ts';

const H = VILLAGE.HEARTEN;
const DAY_S = VILLAGE.ECONOMY.DAY_S;

export interface Heartened {
  villager: number;
  /** Seconds of lift left. */
  left: number;
  /** Seconds until they can be touched again. */
  cool: number;
}

export type HeartenResult = 'ok' | 'unknown' | 'faith' | 'cooldown';

export interface Hearten {
  readonly list: readonly Heartened[];
  /** Work rate factor for a villager (1 when not lifted). */
  boost: (villager: number) => number;
  /** Seconds of lift and of cooldown left for a villager. */
  leftOf: (villager: number) => { left: number; cool: number };
  /** Begin the lift; false when still cooling down. */
  touch: (villager: number) => boolean;
  update: (dt: number) => void;
  remove: (villager: number, moved: number) => void;
  serialize: () => Heartened[];
  restore: (saved: readonly Heartened[]) => void;
}

export function createHearten(): Hearten {
  let list: Heartened[] = [];
  const find = (villager: number) => list.find((h) => h.villager === villager);
  return {
    get list() {
      return list;
    },
    boost: (villager) => ((find(villager)?.left ?? 0) > 0 ? H.BOOST : 1),
    leftOf: (villager) => {
      const h = find(villager);
      return { left: Math.max(0, h?.left ?? 0), cool: Math.max(0, h?.cool ?? 0) };
    },
    touch: (villager) => {
      const have = find(villager);
      if (have && have.cool > 0) return false;
      if (have) {
        have.left = H.DURATION_DAYS * DAY_S;
        have.cool = H.COOLDOWN_DAYS * DAY_S;
      } else {
        list.push({
          villager,
          left: H.DURATION_DAYS * DAY_S,
          cool: H.COOLDOWN_DAYS * DAY_S,
        });
      }
      return true;
    },
    update: (dt) => {
      for (const h of list) {
        h.left = Math.max(0, h.left - dt);
        h.cool = Math.max(0, h.cool - dt);
      }
      list = list.filter((h) => h.left > 0 || h.cool > 0);
    },
    remove: (villager, moved) => {
      list = list.filter((h) => h.villager !== villager);
      for (const h of list) h.villager = followMove(h.villager, villager, moved);
    },
    serialize: () => list.map((h) => ({ ...h })),
    restore: (saved) => {
      list = saved.map((h) => ({ ...h }));
    },
  };
}

/** Why a saved list of heartened villagers cannot be used, or null. */
export function heartenProblem(state: unknown, count: number): string | null {
  const bad = 'saved village: the heartened villagers are missing or damaged';
  if (!Array.isArray(state)) return bad;
  const seen = new Set<number>();
  for (const h of state) {
    if (!isRecord(h) || !isInt(h.villager) || h.villager < 0 || h.villager >= count) return bad;
    if (!isCount(h.left) || !isCount(h.cool) || seen.has(h.villager)) return bad;
    if (h.left > H.DURATION_DAYS * DAY_S || h.cool > H.COOLDOWN_DAYS * DAY_S) return bad;
    seen.add(h.villager);
  }
  return null;
}
