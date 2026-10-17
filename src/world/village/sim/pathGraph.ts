// src/world/village/sim/pathGraph.ts — nodes and links of the laid path network, and painting them into the wear field
import { VILLAGE } from '../../../config/village.ts';
import type { Pathfinder } from './pathfind.ts';
import { sway } from './pathGeometry.ts';
import type { WearField } from './wearField.ts';

const { PATHS } = VILLAGE;

export type NodeKind = 'door' | 'road' | 'field';

export interface Node {
  kind: NodeKind;
  x: number;
  z: number;
  /** Road nodes: the ring road they sit on (-1 otherwise) and the angle around the temple. */
  ring: number;
  theta: number;
  /** Road nodes: metres off the ideal ring road (only junctions with the main road differ). */
  dev: number;
}

/** The graph as a save keeps it. */
export interface PathGraphState {
  nodes: Node[];
  /** Union-find parents, one per node. */
  parent: number[];
  arcDegree: number[];
  /** Linked pairs as `a-b` with a < b. */
  links: string[];
  templeNode: number;
  skipped: number;
  swaySeed: number;
}

export interface PathGraphOptions {
  pathfinder: Pathfinder;
  wear: WearField;
  /** Called after painting so the pathfinder sees the new paths before the next link is routed. */
  onLaid: () => void;
}

export interface PathGraph {
  readonly nodes: readonly Node[];
  /** Ring-road arcs each node has (a lone stub has none), indexed by node. */
  readonly arcDegree: number[];
  /** Called after painting so the pathfinder sees the new paths. */
  onLaid: () => void;
  addNode: (node: Node) => number;
  /** Merge the connected sets of two nodes. */
  join: (a: number, b: number) => void;
  connected: (a: number, b: number) => boolean;
  /** Mark the temple's door node: "connected" means connected to it. */
  setTemple: (node: number) => void;
  connectedToTemple: (node: number) => boolean;
  hasLink: (a: number, b: number) => boolean;
  addLink: (a: number, b: number) => void;
  linkCount: () => number;
  /** Count a link dropped because no sensible route existed. */
  noteSkipped: () => void;
  skipped: () => number;
  /** Paint a polyline into the wear field. */
  paint: (points: number[], value: number, floor: number, radius: number) => void;
  /** Paint a polyline swayed sideways a little (stubs and lanes). */
  paintSway: (points: number[], value: number, floor: number, radius: number) => void;
  /** Paint a polyline swayed by `amplitude`, with the path width of laid footpaths (searched tracks). */
  paintSwayed: (points: number[], amplitude: number, value: number, floor: number) => void;
  /** Whether the terrain along a straight line is walkable (buildings ignored). */
  lineWalkable: (x0: number, z0: number, x1: number, z1: number) => boolean;
  serialize: () => PathGraphState;
  /** Replace the graph's contents in place (the arrays other code holds stay the same objects). */
  restore: (state: PathGraphState) => void;
}

export function createPathGraph(o: PathGraphOptions): PathGraph {
  const { pathfinder, wear } = o;
  const nodes: Node[] = [];
  const parent: number[] = [];
  const arcDegree: number[] = [];
  const links = new Set<string>();
  let templeNode = -1;
  let skipped = 0;
  /** Varies the sway of each laid path; advances on every swayed paint. */
  let swaySeed = 1;

  const root = (i: number): number => {
    let r = i;
    while (parent[r] !== r) r = parent[r]!;
    return r;
  };
  const pairKey = (a: number, b: number) => (a < b ? `${a}-${b}` : `${b}-${a}`);

  const paint = (points: number[], value: number, floor: number, radius: number) => {
    for (let i = 0; i + 3 < points.length; i += 2) {
      wear.paintLine(
        points[i]!,
        points[i + 1]!,
        points[i + 2]!,
        points[i + 3]!,
        value,
        radius,
        floor,
      );
    }
  };

  return {
    nodes,
    arcDegree,
    onLaid: o.onLaid,
    addNode: (node) => {
      nodes.push(node);
      parent.push(nodes.length - 1);
      arcDegree.push(0);
      return nodes.length - 1;
    },
    join: (a, b) => {
      parent[root(a)] = root(b);
    },
    connected: (a, b) => root(a) === root(b),
    setTemple: (node) => {
      templeNode = node;
    },
    connectedToTemple: (i) => templeNode >= 0 && root(i) === root(templeNode),
    hasLink: (a, b) => links.has(pairKey(a, b)),
    addLink: (a, b) => {
      links.add(pairKey(a, b));
    },
    linkCount: () => links.size,
    noteSkipped: () => {
      skipped++;
    },
    skipped: () => skipped,
    paint,
    paintSway: (points, value, floor, radius) => {
      swaySeed += 7;
      paint(sway(points, PATHS.LANE_SWAY_M, swaySeed), value, floor, radius);
    },
    paintSwayed: (points, amplitude, value, floor) => {
      swaySeed += 7;
      paint(sway(points, amplitude, swaySeed), value, floor, PATHS.LAID_RADIUS_M);
    },
    lineWalkable: (x0, z0, x1, z1) => {
      const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 2));
      for (let k = 0; k <= steps; k++) {
        const t = k / steps;
        if (!pathfinder.isTerrainWalkable(x0 + (x1 - x0) * t, z0 + (z1 - z0) * t)) return false;
      }
      return true;
    },
    serialize: () => ({
      nodes: nodes.map((n) => ({ ...n })),
      parent: [...parent],
      arcDegree: [...arcDegree],
      links: [...links],
      templeNode,
      skipped,
      swaySeed,
    }),
    restore: (state) => {
      nodes.length = 0;
      for (const n of state.nodes) nodes.push({ ...n });
      parent.length = 0;
      parent.push(...state.parent);
      arcDegree.length = 0;
      arcDegree.push(...state.arcDegree);
      links.clear();
      for (const key of state.links) links.add(key);
      templeNode = state.templeNode;
      skipped = state.skipped;
      swaySeed = state.swaySeed;
    },
  };
}
