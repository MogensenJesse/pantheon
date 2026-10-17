// src/save/bootSave.ts — continuing a saved game when the page starts
//
// Loading is booting: the page starts over and applies the save while it builds (see profile.ts), so
// nothing has to be torn down and rebuilt in place. The save is read and checked before anything is
// changed; a save that does not fit this map or build is passed over, and the game starts anew.

import type { VillageSeed } from '../world/village/model/seed.ts';
import { type VillageSimState, villageStateProblem } from '../world/village/sim/villageSim.ts';
import { VILLAGE_SIM_KEY } from './gameSave.ts';
import { type ProfileState, parseProfile } from './profile.ts';
import type { SaveRequest } from './saveRequest.ts';
import { createSaveService, type SaveService } from './saveService.ts';
import type { SlotId } from './slots.ts';
import type { SaveSnapshot } from './snapshot.ts';
import type { SaveStore } from './store.ts';

/** Why the game cannot continue from this snapshot on this map, or null. */
export function gameSnapshotProblem(
  snapshot: SaveSnapshot,
  seed: VillageSeed | null,
): string | null {
  const profile = parseProfile(snapshot.profile);
  if (!profile.ok) return profile.message;
  const sim = snapshot.village[VILLAGE_SIM_KEY];
  if (!seed) return sim === undefined ? null : 'The save has a village but this map has none.';
  if (sim === undefined) return 'The save has no village but this map has one.';
  try {
    const problem = villageStateProblem(sim as VillageSimState, seed);
    return problem ? `The village in the save does not fit this map (${problem}).` : null;
  } catch {
    return "The save's village is damaged.";
  }
}

/** The save service for a play session: it also refuses saves the game cannot continue from. */
export function createGameSaveService(
  store: SaveStore,
  mapId: string,
  seed: VillageSeed | null,
): SaveService {
  return createSaveService(store, { mapId, validate: (s) => gameSnapshotProblem(s, seed) });
}

/** A save the game has accepted, ready to be applied while it builds. */
export interface BootRestore {
  slot: SlotId;
  profile: ProfileState;
  /** Null when the map has no village. */
  village: VillageSimState | null;
  playSeconds: number;
  migratedFrom: number | null;
}

export type BootReport = (message: string, kind: 'info' | 'warning') => void;

/**
 * Reads what the request asks for. Returns null for a new game, and says why through `report` when a
 * save was asked for but could not be used (or when newer slots had to be passed over).
 */
export async function loadBootRestore(
  service: SaveService,
  request: SaveRequest,
  report: BootReport,
): Promise<BootRestore | null> {
  if (!request.load) return null;
  const result =
    request.load === 'latest' ? await service.loadLatest() : await service.load(request.load);
  for (const skipped of result.skipped) {
    report(`Skipped the save in ${skipped.slot}: ${skipped.message}`, 'warning');
  }
  if (!result.ok) {
    report(
      result.reason === 'empty'
        ? 'There is no saved game to continue. Starting a new game.'
        : `${result.message} Starting a new game.`,
      'warning',
    );
    return null;
  }
  // `validate` already parsed it; parse again for the typed value.
  const profile = parseProfile(result.snapshot.profile);
  if (!profile.ok) return null;
  const sim = result.snapshot.village[VILLAGE_SIM_KEY] as VillageSimState | undefined;
  return {
    slot: result.slot,
    profile: profile.profile,
    village: sim ?? null,
    playSeconds: result.snapshot.playSeconds,
    migratedFrom: result.migratedFrom,
  };
}
