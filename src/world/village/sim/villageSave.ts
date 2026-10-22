// src/world/village/sim/villageSave.ts — checking a saved village before it is loaded (pure)

import { VILLAGE } from '../../../config/village.ts';
import { isInt, isNum, isRecord } from '../../../core/guards.ts';
import type { VillageSeed } from '../model/seed.ts';
import { blessingsProblem } from './blessings.ts';
import { stockProblem } from './economy.ts';
import { faithProblem } from './faith.ts';
import { forestProblem } from './forest.ts';
import { graveyardProblem } from './graveyard.ts';
import { hungerProblem } from './hunger.ts';
import { siteGridSize } from './siteGrid.ts';
import { villagersStateProblem } from './villagerPool.ts';
import type { VillageSimState } from './villageSimTypes.ts';
import { wearFieldSize } from './wearField.ts';

/**
 * Why a saved village cannot continue on this map and seed, or null when it can. Pure, so the game
 * can refuse a save before it changes anything (the map or the tunables may have changed since).
 */
export function villageStateProblem(state: VillageSimState, seed: VillageSeed): string | null {
  if (state.seedId !== seed.id) return 'this save belongs to a different village seed';
  const cells = siteGridSize(seed.radiusM, VILLAGE.PLAN.CELL_M) ** 2;
  const wearCells = wearFieldSize(seed.radiusM + VILLAGE.WEAR.MARGIN_M) ** 2;
  if (
    state.occupant.length !== cells ||
    (state.pathiness !== null && state.pathiness.length !== cells) ||
    state.wear.data.length !== wearCells ||
    state.wear.floor.length !== wearCells ||
    state.ringFails.length !== VILLAGE.RINGS.COUNT ||
    state.network.roadNodes.length !== VILLAGE.RINGS.COUNT
  ) {
    return 'this save does not fit the map it is loaded onto';
  }
  if (typeof state.converted !== 'boolean') return 'saved village: "converted" is missing';
  const remote = remoteSitesProblem(state.remoteSites);
  if (remote) return remote;
  const stock = stockProblem(state.economy);
  if (stock) return stock;
  const hungry = hungerProblem(state.hunger);
  if (hungry) return hungry;
  const graves = graveyardProblem(state.graveyard);
  if (graves) return graves;
  // The shape only; the ids are checked against the map's trees when the sim restores (`restoreState`).
  const trees = forestProblem(state.forest, Number.POSITIVE_INFINITY);
  if (trees) return trees;
  const blessed = blessingsProblem(state.blessings);
  if (blessed) return blessed;
  const faithBad = faithProblem(state.faith);
  if (faithBad) return faithBad;
  const rngOk = (r: unknown) => Array.isArray(r) && r.length === 4 && r.every(isNum);
  if (!state.rng || !rngOk(state.rng.plan) || !rngOk(state.rng.agents)) {
    return 'saved village: the random streams are missing or damaged';
  }
  const queue: unknown = state.agents?.pathQueue;
  if (!Array.isArray(queue) || !queue.every((n) => isInt(n) && n >= -1)) {
    return 'saved village: the path queue is missing or damaged';
  }
  if (!Number.isInteger(state.elder) || state.elder < -1 || state.elder >= state.villagers.count) {
    return 'saved village: the elder is not one of the villagers';
  }
  return villagersStateProblem(state.villagers);
}

const remoteSitesProblem = (sites: unknown): string | null => {
  const bad = 'saved village: the remote sites are missing or damaged';
  if (!Array.isArray(sites) || sites.length > 255) return bad;
  const ok = sites.every(
    (r, k) =>
      isRecord(r) &&
      r.id === k + 1 &&
      typeof r.kind === 'string' &&
      [r.x, r.z, r.campX, r.campZ, r.progress].every(isNum) &&
      (r.stage === 0 || r.stage === 1 || r.stage === 2) &&
      Array.isArray(r.route) &&
      r.route.length >= 2 &&
      r.route.length % 2 === 0 &&
      r.route.length / 2 <= 65535 &&
      r.route.every(isNum),
  );
  return ok ? null : bad;
};
