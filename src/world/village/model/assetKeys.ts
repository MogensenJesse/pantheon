// src/world/village/model/assetKeys.ts — village kit asset keys and per-type metadata (pure, no three)

export const BUILDING_TYPES = [
  'temple',
  'house_a',
  'house_b',
  'house_c',
  'workshop',
  'granary',
  'farmstead',
  'shrine',
  'well',
] as const;

export type VillageBuildingType = (typeof BUILDING_TYPES)[number];

/** 0 foundation, 1 frame, 2 finished. */
export type VillageStage = 0 | 1 | 2;

const SINGLE_STAGE_TYPES: ReadonlySet<VillageBuildingType> = new Set(['temple', 'well']);
const GLOW_TYPES: ReadonlySet<VillageBuildingType> = new Set([
  'temple',
  'house_a',
  'house_b',
  'house_c',
  'workshop',
]);

/** Stages a type is built through; single-stage types only exist finished. */
export function buildingStages(type: VillageBuildingType): readonly VillageStage[] {
  return SINGLE_STAGE_TYPES.has(type) ? [2] : [0, 1, 2];
}

export function hasWindowGlow(type: VillageBuildingType): boolean {
  return GLOW_TYPES.has(type);
}

export function stageKey(type: VillageBuildingType, stage: VillageStage): string {
  return `village_${type}_s${stage}`;
}

export function glowKey(type: VillageBuildingType): string {
  return `village_${type}_glow`;
}

export const FENCE_KEY = 'village_fence';
export const STOCKPILE_KEY = 'village_stockpile';
export const GRAVE_KEY = 'village_grave';
export const STUMP_KEY = 'village_stump';

/**
 * Kit convention (placeholder and GLB alike): metres, +Y up, origin at the footprint base
 * centre with y = 0 at the floor, and the door on local +Z.
 */
export interface VillageAssetMeta {
  /** Footprint inside the walls (m): local x by z. */
  footprint: readonly [number, number];
  /** Height from floor to the highest point (m). */
  height: number;
  /** Door centre on the footprint edge (local x, z). */
  door: readonly [number, number];
  /** Chimney top (local x, y, z); smoke rises from here. */
  chimney?: readonly [number, number, number];
  /** Height above the floor (m) of the player orb that floats over the roof, on the building's axis. */
  crownY?: number;
  /** Builder standing spots around the building (local x, z). */
  workSlots: readonly (readonly [number, number])[];
}
