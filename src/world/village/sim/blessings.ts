// src/world/village/sim/blessings.ts — what the Blessing power has made faster, and for how long
// (pure: no DOM, no three, node-runnable)
//
// A blessing is on a field (it grows faster), a house (its residents work faster) or a tree (it is chopped,
// or grows back, faster). Each runs down in village time and goes; blessing the same thing again renews it.

import { VILLAGE } from '../../../config/village.ts';
import { isNum } from '../../../core/guards.ts';

const B = VILLAGE.BUILDER_POWERS.BLESSING;

export type BlessKind = 'field' | 'house' | 'tree';
const KINDS: readonly BlessKind[] = ['field', 'house', 'tree'];

export interface Blessing {
  kind: BlessKind;
  id: number;
  /** Seconds left. */
  left: number;
}

export interface Blessings {
  readonly list: readonly Blessing[];
  /** Bless (or renew) a thing for `seconds`. */
  add: (kind: BlessKind, id: number, seconds: number) => void;
  /** 1 for a thing not blessed, the blessing's boost for one that is. */
  boost: (kind: BlessKind, id: number) => number;
  /** Counts the blessings down and drops the ones that ran out. */
  update: (dt: number) => void;
  serialize: () => Blessing[];
  restore: (state: readonly Blessing[]) => void;
}

/** Why saved blessings cannot be used, or null. */
export function blessingsProblem(state: unknown): string | null {
  const bad = 'saved village: the blessings are damaged';
  if (!Array.isArray(state)) return bad;
  for (const b of state as Partial<Blessing>[]) {
    if (!b || !KINDS.includes(b.kind as BlessKind)) return bad;
    if (!Number.isInteger(b.id) || (b.id as number) < 0) return bad;
    if (!isNum(b.left) || b.left <= 0) return bad;
    if (b.left > B.SECONDS * 4) return bad;
  }
  return null;
}

export function createBlessings(): Blessings {
  const list: Blessing[] = [];
  const find = (kind: BlessKind, id: number) => list.find((b) => b.kind === kind && b.id === id);
  return {
    list,
    add: (kind, id, seconds) => {
      const have = find(kind, id);
      if (have) have.left = Math.max(have.left, seconds);
      else list.push({ kind, id, left: seconds });
    },
    boost: (kind, id) => (find(kind, id) ? B.BOOST : 1),
    update: (dt) => {
      for (let i = list.length - 1; i >= 0; i--) {
        list[i]!.left -= dt;
        if (list[i]!.left <= 0) list.splice(i, 1);
      }
    },
    serialize: () => list.map((b) => ({ ...b })),
    restore: (state) => {
      list.length = 0;
      for (const b of state) list.push({ ...b });
    },
  };
}
