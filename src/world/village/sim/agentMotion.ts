// src/world/village/sim/agentMotion.ts — walking a villager along its waypoints
import { VILLAGE } from '../../../config/village.ts';
import { turnToward } from '../../../core/math/scalar.ts';
import type { Villagers } from '../model/types.ts';

const { VILLAGERS: V, PATH } = VILLAGE;
/** How fast a villager turns toward its next waypoint (per second). */
const TURN_RATE = 8;

/**
 * Move villager `i` along its waypoints for `dt` seconds at `speedMps`, turning to face the way it
 * goes and advancing its stride cycle. `onWalk` hears about the distance covered. Returns whether
 * the path has been walked to its end.
 */
export function advanceAlongPath(
  pool: Villagers,
  i: number,
  speedMps: number,
  dt: number,
  onWalk?: (x: number, z: number, distance: number) => void,
): boolean {
  const base = i * PATH.MAX_WAYPOINTS * 2;
  const len = pool.pathLen[i]!;
  let cur = pool.pathCur[i]!;
  let budget = speedMps * dt;
  const startX = pool.x[i]!;
  const startZ = pool.z[i]!;
  while (budget > 1e-4 && cur < len) {
    const tx = pool.waypoints[base + cur * 2]!;
    const tz = pool.waypoints[base + cur * 2 + 1]!;
    const dx = tx - pool.x[i]!;
    const dz = tz - pool.z[i]!;
    const d = Math.hypot(dx, dz);
    if (d > 1e-4) pool.yaw[i] = turnToward(pool.yaw[i]!, Math.atan2(dx, dz), dt * TURN_RATE);
    if (d <= budget) {
      pool.x[i] = tx;
      pool.z[i] = tz;
      budget -= d;
      pool.stride[i] += d / V.STRIDE_M;
      cur++;
    } else {
      pool.x[i] += (dx / d) * budget;
      pool.z[i] += (dz / d) * budget;
      pool.stride[i] += budget / V.STRIDE_M;
      budget = 0;
    }
  }
  pool.stride[i] = pool.stride[i]! % 1;
  const moved = Math.hypot(pool.x[i]! - startX, pool.z[i]! - startZ);
  if (moved > 0) onWalk?.(pool.x[i]!, pool.z[i]!, moved);
  pool.pathCur[i] = cur;
  return cur >= len;
}
