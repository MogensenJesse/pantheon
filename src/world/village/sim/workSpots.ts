// src/world/village/sim/workSpots.ts — where ambient workers stand: beside trees to chop and on the shore to fish from
import { VILLAGE } from '../../../config/village.ts';
import { WORK_SPOT_ID_BASE, type WorkSpot } from '../model/types.ts';
import type { SiteGrid } from './siteGrid.ts';

export interface WorkSpots {
  trees: readonly WorkSpot[];
  shores: readonly WorkSpot[];
}

export interface TreePoint {
  x: number;
  z: number;
}

const { STAND_OFF_M, TREE_MIN_FROM_TEMPLE_M } = VILLAGE.VILLAGERS.WORK_SPOTS;
/** Every other qualifying shore cell is enough: spots only need to spread the fishermen out. */
const SHORE_THIN = 2;

/**
 * Standing spots from the map's tree positions (a worker stands on the temple side of the trunk and
 * faces it) and from the grid's water cells (dry, walkable cells beside water, facing it). Found
 * once at founding from map data only, so the sim stays deterministic; whether a spot can be
 * reached right now is checked when a worker claims it.
 */
export function createWorkSpots(
  grid: SiteGrid,
  trees: readonly TreePoint[],
  templeX: number,
  templeZ: number,
): WorkSpots {
  let nextId = WORK_SPOT_ID_BASE;
  const { size, cellM, originX, originZ, water, slope } = grid;
  const reach = (size * cellM) / 2;

  const treeSpots: WorkSpot[] = [];
  for (const tree of trees) {
    const dx = templeX - tree.x;
    const dz = templeZ - tree.z;
    const d = Math.hypot(dx, dz);
    if (d < TREE_MIN_FROM_TEMPLE_M || d > reach) continue;
    const x = tree.x + (dx / d) * STAND_OFF_M;
    const z = tree.z + (dz / d) * STAND_OFF_M;
    const i = Math.floor((x - originX) / cellM);
    const j = Math.floor((z - originZ) / cellM);
    if (i < 0 || j < 0 || i >= size || j >= size || water[j * size + i]) continue;
    treeSpots.push({ id: nextId++, x, z, faceX: tree.x, faceZ: tree.z });
  }

  const shoreSpots: WorkSpot[] = [];
  for (let j = 1; j < size - 1; j++) {
    for (let i = 1; i < size - 1; i++) {
      const index = j * size + i;
      if (water[index] || slope[index]! > VILLAGE.PATH.STEEP_SLOPE || (i + j) % SHORE_THIN)
        continue;
      let wx = 0;
      let wz = 0;
      for (let dj = -1; dj <= 1; dj++) {
        for (let di = -1; di <= 1; di++) {
          if (water[(j + dj) * size + i + di]) {
            wx += di;
            wz += dj;
          }
        }
      }
      if (wx === 0 && wz === 0) continue;
      const norm = Math.hypot(wx, wz);
      const x = originX + (i + 0.5) * cellM;
      const z = originZ + (j + 0.5) * cellM;
      shoreSpots.push({
        id: nextId++,
        x,
        z,
        faceX: x + (wx / norm) * cellM,
        faceZ: z + (wz / norm) * cellM,
      });
    }
  }
  return { trees: treeSpots, shores: shoreSpots };
}
