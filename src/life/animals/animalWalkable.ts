// src/life/animals/animalWalkable.ts — where a farm animal may stand (pure: node-runnable)
//
// Dry ground that is not steep, clear of the buildings, the wheat and the trees. The buildings are read live, so
// ground that a new house takes stops being walkable and an animal standing on it is moved out by the sim.

import { type Footprint, insideFootprint } from '../../core/math/geom.ts';

export interface WalkableInputs {
  getY: (x: number, z: number) => number;
  waterLevelM: number;
  buildings: () => readonly Footprint[];
  fields: () => readonly Footprint[];
  trees: readonly { x: number; z: number }[];
}

/** Animals keep this far from a wall, this far from a wheat field, and this far from a trunk. */
export const BUILDING_MARGIN_M = 0.9;
export const FIELD_MARGIN_M = 0.4;
export const TREE_MARGIN_M = 0.8;
/** Ground must be this far above the water, and no steeper than this rise over a metre. */
export const SHORE_MARGIN_M = 0.35;
export const MAX_RISE_PER_M = 0.7;

const TREE_CELL_M = 4;
const cellKey = (cx: number, cz: number) => (cx + 8192) * 16384 + (cz + 8192);

export function createWalkable(inputs: WalkableInputs): (x: number, z: number) => boolean {
  const { getY, waterLevelM } = inputs;
  const treeCells = new Map<number, { x: number; z: number }[]>();
  for (const tree of inputs.trees) {
    const k = cellKey(Math.floor(tree.x / TREE_CELL_M), Math.floor(tree.z / TREE_CELL_M));
    const list = treeCells.get(k);
    if (list) list.push(tree);
    else treeCells.set(k, [tree]);
  }

  return (x, z) => {
    const y = getY(x, z);
    if (y < waterLevelM + SHORE_MARGIN_M) return false;
    if (
      Math.abs(getY(x + 1, z) - y) > MAX_RISE_PER_M ||
      Math.abs(getY(x, z + 1) - y) > MAX_RISE_PER_M
    ) {
      return false;
    }
    for (const b of inputs.buildings()) {
      if (insideFootprint(b, x, z, BUILDING_MARGIN_M)) return false;
    }
    for (const f of inputs.fields()) {
      if (insideFootprint(f, x, z, FIELD_MARGIN_M)) return false;
    }
    const cx = Math.floor(x / TREE_CELL_M);
    const cz = Math.floor(z / TREE_CELL_M);
    for (let i = -1; i <= 1; i++) {
      for (let j = -1; j <= 1; j++) {
        for (const t of treeCells.get(cellKey(cx + i, cz + j)) ?? []) {
          if (Math.hypot(t.x - x, t.z - z) < TREE_MARGIN_M) return false;
        }
      }
    }
    return true;
  };
}
