// src/world/village/sim/forest.ts — the map's trees as the village sees them: standing, falling, a stump,
// a sapling growing back (pure: no DOM, no three, node-runnable)
//
//   Standing --(chopped for yield x CHOP_S_PER_WOOD seconds)--> Falling --FALL_S--> Stump
//   Stump --(REGROW_DAYS, a free spot, room for a sapling)--> Sapling --(GROW_DAYS)--> Standing
//
// Every tree of the map is in the registry (the index in the list the map gave is its id). Only the ones
// a woodcutter can walk to are ever chopped by the village; DEV can fell any of them.

import { VILLAGE } from '../../../config/village.ts';
import { isCount } from '../../../core/guards.ts';
import type { VillageEvent } from '../model/types.ts';

const F = VILLAGE.FOREST;
const DAY_S = VILLAGE.ECONOMY.DAY_S;

export interface TreeInfo {
  x: number;
  z: number;
  /** The prop key (`fir_1`, `birch_web`, `pine_large_2` ...). */
  key: string;
  /** The authored scale of this tree. */
  scale: number;
}

export const TreeState = { Standing: 0, Falling: 1, Stump: 2, Sapling: 3 } as const;
export type TreeStateId = (typeof TreeState)[keyof typeof TreeState];

/** The table's yield for a tree key (the exact key, else the family), found once per key. */
const baseYields = new Map<string, number>();
function baseYieldOf(key: string): number {
  let base = baseYields.get(key);
  if (base === undefined) {
    const table = F.YIELD;
    base =
      table[key] ?? table[key.replace(/_\d+$/, '')] ?? table[key.split('_')[0]!] ?? F.DEFAULT_YIELD;
    baseYields.set(key, base);
  }
  return base;
}

/** Wood a standing tree gives: its key's table entry (the exact key, else the family) times its scale, at least 1. */
export function yieldOf(tree: Pick<TreeInfo, 'key' | 'scale'>): number {
  return Math.max(1, Math.round(baseYieldOf(tree.key) * tree.scale));
}

/** Seconds of chopping a tree takes. */
export const chopSecondsOf = (tree: Pick<TreeInfo, 'key' | 'scale'>): number =>
  yieldOf(tree) * F.CHOP_S_PER_WOOD;

/** What a save keeps: every tree that is not simply standing, and the chopping already done on the rest. */
export interface ForestState {
  /** Trees (ids) that fell or regrow, with their state and the seconds in it. */
  ids: number[];
  states: number[];
  timers: number[];
  /** Standing trees with some chopping done, and how much (seconds). */
  chopIds: number[];
  chopSeconds: number[];
}

export interface ForestInputs {
  /** 0..1, rain on the village: it speeds the saplings up. */
  rain01: number;
  /** A stump may grow back where nothing stands now. */
  canRegrow: (tree: TreeInfo) => boolean;
}

export interface ForestCounts {
  trees: number;
  standing: number;
  falling: number;
  stumps: number;
  saplings: number;
}

export interface Forest {
  readonly count: number;
  info: (id: number) => TreeInfo;
  state: (id: number) => TreeStateId;
  isStanding: (id: number) => boolean;
  /** 0.1 .. 1 for a sapling, 1 otherwise. */
  growth: (id: number) => number;
  /**
   * Chop for `dt` seconds. Returns the wood once the last hit lands (the tree then falls toward
   * (dirX, dirZ), the event is appended), else 0.
   */
  chop: (id: number, dt: number, dirX: number, dirZ: number, events: VillageEvent[]) => number;
  /** Fell a standing tree at once (DEV, tests); returns the wood it would give, 0 when it was not standing. */
  fell: (id: number, dirX: number, dirZ: number, events: VillageEvent[]) => number;
  /** Advance falls, stumps and saplings. */
  update: (dt: number, inputs: ForestInputs, events: VillageEvent[]) => void;
  /** Trees (ids) that are not standing: the view shows these as stumps, saplings or falling trees. */
  readonly changed: ReadonlySet<number>;
  /** The `n` standing trees nearest a point. */
  nearest: (x: number, z: number, n: number) => number[];
  counts: () => ForestCounts;
  serialize: () => ForestState;
  restore: (state: ForestState) => void;
}

/** Why a saved forest cannot be used for a map with `count` trees, or null. */
export function forestProblem(state: unknown, count: number): string | null {
  const s = state as Partial<ForestState> | null;
  const bad = 'saved village: the forest is missing or damaged';
  if (!s || !Array.isArray(s.ids) || !Array.isArray(s.states) || !Array.isArray(s.timers))
    return bad;
  if (!Array.isArray(s.chopIds) || !Array.isArray(s.chopSeconds)) return bad;
  if (s.ids.length !== s.states.length || s.ids.length !== s.timers.length) return bad;
  if (s.chopIds.length !== s.chopSeconds.length) return bad;
  const idOk = (n: unknown) => Number.isInteger(n) && (n as number) >= 0 && (n as number) < count;
  if (!s.ids.every(idOk) || !s.chopIds.every(idOk)) {
    return 'this save does not fit the map it is loaded onto (the trees differ)';
  }
  if (
    !s.states.every(
      (v) => v === TreeState.Stump || v === TreeState.Sapling || v === TreeState.Falling,
    )
  ) {
    return bad;
  }
  if (![...s.timers, ...s.chopSeconds].every(isCount)) return bad;
  return null;
}

/** What skills and blessings change about the forest (all optional; the defaults leave it as it was). */
export interface ForestRules {
  /** Wood added to what a felled tree gives (Sharp axes). */
  woodAdd?: () => number;
  /** Multiplies how long a stump waits (Seedkeeper). */
  stumpWaitMul?: () => number;
  /** Stumps grow at once while it rains (Evergreen). */
  evergreen?: () => boolean;
  /** What rain adds to growth at full rain (the base plus Rain-reader, times Downpour). */
  rainBoost?: () => number;
  /** Multiplies how fast a tree is chopped, or a sapling grows (a Blessing on it). */
  treeBoost?: (id: number) => number;
}

/** Rain above this counts as raining for Evergreen (the same as sending people indoors). */
const RAINING = VILLAGE.VILLAGERS.SHELTER.RAIN_ON;

export function createForest(trees: readonly TreeInfo[], rules: ForestRules = {}): Forest {
  const woodAdd = rules.woodAdd ?? (() => 0);
  const stumpWaitMul = rules.stumpWaitMul ?? (() => 1);
  const evergreen = rules.evergreen ?? (() => false);
  const rainBoost = rules.rainBoost ?? (() => F.RAIN_BOOST);
  const treeBoost = rules.treeBoost ?? (() => 1);
  const n = trees.length;
  const state = new Uint8Array(n);
  /** Seconds in the current state (falling, stump), or game seconds of growth (sapling). */
  const timer = new Float32Array(n);
  const chopped = new Float32Array(n);
  const changed = new Set<number>();
  const partial = new Set<number>();
  const order: number[] = [];
  let saplings = 0;

  const fellTree = (id: number, dirX: number, dirZ: number, events: VillageEvent[]) => {
    state[id] = TreeState.Falling;
    timer[id] = 0;
    chopped[id] = 0;
    partial.delete(id);
    changed.add(id);
    events.push({ kind: 'treeFelled', tree: id, dirX, dirZ });
    return yieldOf(trees[id]!) + woodAdd();
  };

  const setState = (id: number, next: TreeStateId) => {
    if (state[id] === TreeState.Sapling) saplings--;
    state[id] = next;
    timer[id] = 0;
    if (next === TreeState.Sapling) saplings++;
    if (next === TreeState.Standing) changed.delete(id);
  };

  return {
    count: n,
    info: (id) => trees[id]!,
    state: (id) => state[id] as TreeStateId,
    isStanding: (id) => state[id] === TreeState.Standing,
    growth: (id) =>
      state[id] === TreeState.Sapling
        ? Math.min(
            1,
            F.SAPLING_START + ((1 - F.SAPLING_START) * timer[id]!) / (F.GROW_DAYS * DAY_S),
          )
        : 1,
    chop: (id, dt, dirX, dirZ, events) => {
      if (state[id] !== TreeState.Standing) return 0;
      chopped[id] = chopped[id]! + dt * treeBoost(id);
      partial.add(id);
      if (chopped[id]! < chopSecondsOf(trees[id]!)) return 0;
      return fellTree(id, dirX, dirZ, events);
    },
    fell: (id, dirX, dirZ, events) =>
      state[id] === TreeState.Standing ? fellTree(id, dirX, dirZ, events) : 0,
    update: (dt, inputs, events) => {
      // In id order, so a restored forest (saved sorted) goes on exactly like the one that was saved.
      order.length = 0;
      for (const id of changed) order.push(id);
      order.sort((x, y) => x - y);
      for (const id of order) {
        const s = state[id];
        if (s === TreeState.Falling) {
          timer[id] = timer[id]! + dt;
          if (timer[id]! >= F.FALL_S) {
            setState(id, TreeState.Stump);
            events.push({ kind: 'treeStump', tree: id });
          }
        } else if (s === TreeState.Sapling) {
          timer[id] = timer[id]! + dt * (1 + rainBoost() * inputs.rain01) * treeBoost(id);
          if (timer[id]! >= F.GROW_DAYS * DAY_S) {
            setState(id, TreeState.Standing);
            events.push({ kind: 'treeGrown', tree: id });
          }
        } else if (s === TreeState.Stump) {
          timer[id] = timer[id]! + dt;
          const waited =
            timer[id]! >= F.REGROW_DAYS * stumpWaitMul() * DAY_S ||
            (evergreen() && inputs.rain01 >= RAINING);
          if (waited && saplings < F.MAX_SAPLINGS && inputs.canRegrow(trees[id]!)) {
            setState(id, TreeState.Sapling);
            events.push({ kind: 'treeSapling', tree: id });
          }
        }
      }
    },
    changed,
    nearest: (x, z, count) => {
      const found: { id: number; d: number }[] = [];
      for (let id = 0; id < n; id++) {
        if (state[id] !== TreeState.Standing) continue;
        const t = trees[id]!;
        found.push({ id, d: (t.x - x) ** 2 + (t.z - z) ** 2 });
      }
      found.sort((a, b) => a.d - b.d || a.id - b.id);
      return found.slice(0, count).map((f) => f.id);
    },
    counts: () => {
      let falling = 0;
      let stumps = 0;
      for (const id of changed) {
        if (state[id] === TreeState.Falling) falling++;
        else if (state[id] === TreeState.Stump) stumps++;
      }
      return { trees: n, standing: n - changed.size, falling, stumps, saplings };
    },
    serialize: () => {
      const ids = [...changed].sort((a, b) => a - b);
      const chopIds = [...partial]
        .filter((id) => state[id] === TreeState.Standing)
        .sort((a, b) => a - b);
      return {
        ids,
        states: ids.map((id) => state[id]!),
        timers: ids.map((id) => timer[id]!),
        chopIds,
        chopSeconds: chopIds.map((id) => chopped[id]!),
      };
    },
    restore: (s) => {
      state.fill(0);
      timer.fill(0);
      chopped.fill(0);
      changed.clear();
      partial.clear();
      saplings = 0;
      s.ids.forEach((id, k) => {
        const st = s.states[k]! as TreeStateId;
        state[id] = st;
        timer[id] = s.timers[k]!;
        changed.add(id);
        if (st === TreeState.Sapling) saplings++;
      });
      s.chopIds.forEach((id, k) => {
        chopped[id] = s.chopSeconds[k]!;
        partial.add(id);
      });
    },
  };
}
