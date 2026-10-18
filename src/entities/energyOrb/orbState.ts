// src/entities/energyOrb/orbState.ts — what a save keeps of the orbs, how to check a stored one, and how
// a saved state is matched to the orbs of the map (pure: no DOM, no three, node-runnable)
//
// Slots are named by their place on the map (their "home"), so a map edited between saves still
// matches: a slot added since starts fresh, one removed is dropped.

import type { AleaState } from 'alea';
import { isCount, isNum, isRecord } from '../../core/guards.ts';
import type { XZ } from '../../core/math/geom.ts';

export interface OrbsState {
  /** Home places of the slots with no live orb. */
  absorbed: XZ[];
  /** Slots whose orb is live at a respawn place instead of at home. */
  relocated: { homeX: number; homeZ: number; x: number; z: number; energy: number }[];
  respawn: {
    /** Seconds until the next orb is due. */
    remainingSec: number;
    /** The respawn random stream's position (null until it has been used). */
    rng: AleaState | null;
  };
}

/** An orb counts as the saved one when it sits this close (m): maps can be edited between saves. */
export const RESTORE_MATCH_M = 0.5;

/** One orb slot as the save sees it. */
export interface OrbSlot {
  /** Where the slot's orb started on the map. */
  home: XZ;
  absorbed: boolean;
  /** Brought back by the respawn rule, so it no longer sits at home. */
  respawned: boolean;
  /** Where the orb is now. */
  x: number;
  z: number;
  energy: number;
}

export function serializeOrbs(slots: readonly OrbSlot[], respawn: OrbsState['respawn']): OrbsState {
  const absorbed: OrbsState['absorbed'] = [];
  const relocated: OrbsState['relocated'] = [];
  for (const slot of slots) {
    if (slot.absorbed) absorbed.push({ x: slot.home.x, z: slot.home.z });
    else if (slot.respawned) {
      relocated.push({
        homeX: slot.home.x,
        homeZ: slot.home.z,
        x: slot.x,
        z: slot.z,
        energy: slot.energy,
      });
    }
  }
  return { absorbed, relocated, respawn };
}

/** What restoring does to one slot. */
export type RestoreAction =
  | { slot: number; kind: 'absorb' }
  | { slot: number; kind: 'relocate'; x: number; z: number; energy: number };

/**
 * The slots a saved state applies to: the saved absorbed places and relocated orbs matched to live
 * slots by their home (the nearest within `RESTORE_MATCH_M`, each slot used once). Saved places with
 * no slot on this map are left out.
 */
export function planRestore(
  homes: readonly XZ[],
  isLive: (slot: number) => boolean,
  saved: Pick<OrbsState, 'absorbed' | 'relocated'>,
): RestoreAction[] {
  const taken = new Set<number>();
  const slotAt = (x: number, z: number): number => {
    let best = -1;
    let bestSq = RESTORE_MATCH_M * RESTORE_MATCH_M;
    for (let i = 0; i < homes.length; i++) {
      if (!isLive(i) || taken.has(i)) continue;
      const d = (homes[i]!.x - x) ** 2 + (homes[i]!.z - z) ** 2;
      if (d <= bestSq) {
        bestSq = d;
        best = i;
      }
    }
    return best;
  };
  const actions: RestoreAction[] = [];
  for (const place of saved.absorbed) {
    const slot = slotAt(place.x, place.z);
    if (slot < 0) continue;
    taken.add(slot);
    actions.push({ slot, kind: 'absorb' });
  }
  for (const orb of saved.relocated) {
    const slot = slotAt(orb.homeX, orb.homeZ);
    if (slot < 0) continue;
    taken.add(slot);
    actions.push({ slot, kind: 'relocate', x: orb.x, z: orb.z, energy: orb.energy });
  }
  return actions;
}

const isPlace = (o: unknown): o is XZ => isRecord(o) && isNum(o.x) && isNum(o.z);
const isRelocated = (o: unknown): o is OrbsState['relocated'][number] =>
  isRecord(o) && isNum(o.homeX) && isNum(o.homeZ) && isNum(o.x) && isNum(o.z) && isCount(o.energy);
const isRngState = (r: unknown): r is AleaState | null =>
  r === null || (Array.isArray(r) && r.length === 4 && r.every(isNum));

/** The stored orbs state as a clean copy, or null when it is damaged. */
export function parseOrbs(raw: unknown): OrbsState | null {
  if (!isRecord(raw)) return null;
  const { absorbed, relocated, respawn } = raw;
  if (!Array.isArray(absorbed) || !absorbed.every(isPlace)) return null;
  if (!Array.isArray(relocated) || !relocated.every(isRelocated)) return null;
  if (!isRecord(respawn) || !isCount(respawn.remainingSec) || !isRngState(respawn.rng)) return null;
  return {
    absorbed: absorbed.map((o) => ({ x: o.x, z: o.z })),
    relocated: relocated.map((o) => ({
      homeX: o.homeX,
      homeZ: o.homeZ,
      x: o.x,
      z: o.z,
      energy: o.energy,
    })),
    respawn: {
      remainingSec: respawn.remainingSec,
      rng: respawn.rng ? ([...respawn.rng] as AleaState) : null,
    },
  };
}
