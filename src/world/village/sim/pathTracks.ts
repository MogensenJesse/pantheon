// src/world/village/sim/pathTracks.ts — footpaths found by search: field tracks and fallbacks where no ring road reaches
import { VILLAGE } from '../../../config/village.ts';
import type { Pathfinder } from './pathfind.ts';
import { chaikin } from './pathGeometry.ts';
import type { PathGraph } from './pathGraph.ts';

const { PATHS, PATH } = VILLAGE;

export interface PathTracks {
  /**
   * Route a footpath between two nodes by search, smooth it and paint it. False when no sensible
   * route exists (none at all, or longer than `maxDetour` times the straight line).
   */
  lay: (a: number, b: number, maxDetour?: number, affinity?: number) => boolean;
  /** Join a node to the nearest few nodes already connected to the temple by a searched footpath. */
  fallbackLink: (node: number, maxDetour: number, affinity?: number) => boolean;
  /** Footpaths laid by search so far. */
  count: () => number;
}

export function createPathTracks(graph: PathGraph, pathfinder: Pathfinder): PathTracks {
  const { nodes } = graph;
  const waypoints = new Float32Array(PATH.MAX_WAYPOINTS * 2);
  let count = 0;

  const lay = (
    a: number,
    b: number,
    maxDetour: number = PATHS.MAX_DETOUR,
    affinity: number = PATHS.AFFINITY.LAYING,
  ): boolean => {
    if (graph.hasLink(a, b)) return true;
    const from = nodes[a]!;
    const to = nodes[b]!;
    const straight = Math.hypot(to.x - from.x, to.z - from.z);
    const n = pathfinder.find(
      from.x,
      from.z,
      to.x,
      to.z,
      waypoints,
      0,
      PATH.MAX_WAYPOINTS,
      affinity,
    );
    if (n === 0) {
      graph.noteSkipped();
      return false;
    }
    const points = [from.x, from.z];
    let length = 0;
    let px = from.x;
    let pz = from.z;
    for (let k = 0; k < n; k++) {
      const x = waypoints[k * 2]!;
      const z = waypoints[k * 2 + 1]!;
      length += Math.hypot(x - px, z - pz);
      points.push(x, z);
      px = x;
      pz = z;
    }
    if (straight > 1 && length > maxDetour * straight) {
      graph.noteSkipped();
      return false;
    }
    graph.paintSwayed(chaikin(points), PATHS.WIGGLE_M, PATHS.LAID_VALUE, PATHS.LAID_FLOOR);
    graph.addLink(a, b);
    graph.join(a, b);
    count++;
    graph.onLaid();
    return true;
  };

  return {
    lay,
    count: () => count,
    fallbackLink: (node, maxDetour, affinity = PATHS.AFFINITY.LAYING) => {
      const from = nodes[node]!;
      const candidates = nodes
        .map((n, i) => ({ i, d: Math.hypot(n.x - from.x, n.z - from.z) }))
        .filter((c) => c.i !== node && nodes[c.i]!.kind !== 'field' && graph.connectedToTemple(c.i))
        .sort((p, q) => p.d - q.d)
        .slice(0, 3);
      return candidates.some((c) => lay(node, c.i, maxDetour, affinity));
    },
  };
}
