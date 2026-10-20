// src/world/village/sim/pad.ts — the level pad a building stands on, as nodes of the terrain's 2 m detail lattice
import { VILLAGE } from '../../../config/village.ts';
import { fadeHermite } from '../../../core/math/scalar.ts';

/** One lattice node a pad pulls toward its floor. World position is (i, j) * NODE_M. */
export interface PadNode {
  i: number;
  j: number;
  /** 1 on the pad itself, fading to 0 over the skirt. */
  w: number;
  /** True for nodes of every 2 m cell the footprint touches: they end exactly on the floor. */
  pad: boolean;
}

export interface Pad {
  /** Floor height (m): the mean ground over the pad nodes, so cut and fill balance. */
  floorY: number;
  /** Lowest ground under the pad (m). */
  minY: number;
  nodes: PadNode[];
}

/** True when the axis-aligned square [x0, x0 + size] x [z0, z0 + size] overlaps the rotated rectangle. */
function squareOverlapsRect(
  x0: number,
  z0: number,
  size: number,
  x: number,
  z: number,
  cos: number,
  sin: number,
  ex: number,
  ez: number,
): boolean {
  const h = size / 2;
  const cx = x0 + h - x;
  const cz = z0 + h - z;
  const ac = Math.abs(cos);
  const as = Math.abs(sin);
  if (Math.abs(cx) > ac * ex + as * ez + h) return false;
  if (Math.abs(cz) > as * ex + ac * ez + h) return false;
  const lx = cx * cos - cz * sin;
  const lz = cx * sin + cz * cos;
  const reach = h * (ac + as);
  return Math.abs(lx) <= ex + reach && Math.abs(lz) <= ez + reach;
}

/**
 * Plan the pad of a footprint on the 2 m lattice. Yaw follows three: local +Z turns toward world +X
 * as rotY grows. `getY` is the original ground: the sim must not see the pads it cuts.
 */
export function planPad(
  getY: (x: number, z: number) => number,
  x: number,
  z: number,
  rotY: number,
  halfW: number,
  halfD: number,
): Pad {
  const { PAD_M, NODE_M, SKIRT_M } = VILLAGE.PLINTH;
  const cos = Math.cos(rotY);
  const sin = Math.sin(rotY);
  const ex = halfW + PAD_M;
  const ez = halfD + PAD_M;

  // Cells the rectangle touches: their corner nodes are the pad.
  const padKeys = new Set<number>();
  const reachRect = Math.hypot(ex, ez);
  const ci0 = Math.floor((x - reachRect) / NODE_M);
  const ci1 = Math.floor((x + reachRect) / NODE_M);
  const cj0 = Math.floor((z - reachRect) / NODE_M);
  const cj1 = Math.floor((z + reachRect) / NODE_M);
  const key = (i: number, j: number) => j * 65536 + (i + 32768);
  for (let cj = cj0; cj <= cj1; cj++) {
    for (let ci = ci0; ci <= ci1; ci++) {
      if (!squareOverlapsRect(ci * NODE_M, cj * NODE_M, NODE_M, x, z, cos, sin, ex, ez)) continue;
      padKeys.add(key(ci, cj));
      padKeys.add(key(ci + 1, cj));
      padKeys.add(key(ci, cj + 1));
      padKeys.add(key(ci + 1, cj + 1));
    }
  }

  const nodes: PadNode[] = [];
  let sum = 0;
  let padCount = 0;
  let minY = Number.POSITIVE_INFINITY;
  const reach = reachRect + SKIRT_M + NODE_M;
  const i0 = Math.floor((x - reach) / NODE_M);
  const i1 = Math.ceil((x + reach) / NODE_M);
  const j0 = Math.floor((z - reach) / NODE_M);
  const j1 = Math.ceil((z + reach) / NODE_M);
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      const pad = padKeys.has(key(i, j));
      let w = 1;
      if (!pad) {
        const dx = i * NODE_M - x;
        const dz = j * NODE_M - z;
        const lx = dx * cos - dz * sin;
        const lz = dx * sin + dz * cos;
        const d = Math.hypot(Math.max(Math.abs(lx) - ex, 0), Math.max(Math.abs(lz) - ez, 0));
        w = 1 - fadeHermite(Math.min(1, d / SKIRT_M));
        if (w < 1e-3) continue;
      } else {
        const y = getY(i * NODE_M, j * NODE_M);
        sum += y;
        padCount++;
        if (y < minY) minY = y;
      }
      nodes.push({ i, j, w, pad });
    }
  }
  return { floorY: sum / Math.max(1, padCount), minY, nodes };
}
