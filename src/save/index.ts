// src/save/index.ts — saved games: snapshot rules, slots, storage and the service on top
//
// Nothing here reads or writes game state yet; each system adds its own slice (see
// story-mechanics/VILLAGE_ROADMAP.md, M0).

export { MIGRATIONS, type Migration, migrateSnapshot } from './migrate.ts';
export {
  createSaveService,
  type LoadFailure,
  type LoadResult,
  type SaveParts,
  type SaveService,
  type SaveServiceOptions,
  type Skipped,
} from './saveService.ts';
export {
  AUTO_SLOTS,
  isSlotId,
  MANUAL_SLOTS,
  newestFirst,
  nextAutosaveSlot,
  SLOT_IDS,
  type SlotId,
  type SlotMeta,
} from './slots.ts';
export {
  type ParseResult,
  parseSnapshot,
  SAVE_VERSION,
  type SaveRefusal,
  type SaveSlice,
  type SaveSnapshot,
  type SaveSummary,
} from './snapshot.ts';
export {
  createIndexedDbStore,
  createMemoryStore,
  SaveError,
  type SaveErrorCode,
  type SaveStore,
} from './store.ts';
