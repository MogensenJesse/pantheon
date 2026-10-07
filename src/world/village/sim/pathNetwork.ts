// src/world/village/sim/pathNetwork.ts — ring roads, radial lanes and doorstep stubs, laid as the village grows
import { VILLAGE } from '../../../config/village.ts';
import { fadeHermite } from '../../../core/math/scalar.ts';
import type { Building, Field } from '../model/types.ts';
import { wrap } from './geometry.ts';
import type { Pathfinder } from './pathfind.ts';
import { segmentDistance } from './pathGeometry.ts';
import { createPathGraph } from './pathGraph.ts';
import { createPathTracks } from './pathTracks.ts';
import type { RingModel } from './ringModel.ts';
import type { WearField } from './wearField.ts';

const { PATHS, PATH, RINGS, WEAR } = VILLAGE;
const TWO_PI = Math.PI * 2;

export interface PathNetworkStats {
  nodes: number;
  links: number;
  /** Radial lanes laid between ring roads. */
  radials: number;
  /** Footpaths found by search (field tracks and fallbacks) rather than laid on a ring road or lane. */
  tracks: number;
  /** Share of buildings and fields connected to the temple through laid paths. */
  connectedShare: number;
  /** Share of buildings whose ring road continues past their door (not a lone stub). */
  arcShare: number;
  /** Links dropped because no sensible route existed. */
  skipped: number;
}

export interface PathNetwork {
  /**
   * The plaza loop (ring road 0), the temple's door link and the main road out to ring 0; call once
   * at founding. The main road then grows ring by ring as houses reach new rings.
   */
  layPlaza: (temple: Building) => void;
  /** Link a newly placed building's doorstep to its ring road, and the ring road to the village. */
  linkBuilding: (building: Building) => void;
  /** A farm track from a field to the nearest road. */
  linkField: (field: Field) => void;
  /** Distance to the nearest radial lane (Infinity when none). */
  radialDistance: (x: number, z: number) => number;
  stats: () => PathNetworkStats;
}

export interface PathNetworkOptions {
  pathfinder: Pathfinder;
  wear: WearField;
  rings: RingModel;
  rng: () => number;
  /** World position just outside a building's door. */
  doorstepOf: (building: Building) => readonly [number, number];
  /** Called after painting so the pathfinder sees the new paths before the next link is routed. */
  onLaid: () => void;
}

const norm = (theta: number) => wrap(theta, TWO_PI);

/** Angles a radial lane may be slid to, nearest first. */
const SLIDES = (() => {
  const out = [0];
  for (let s = 1; s * 0.07 <= PATHS.RADIAL_SLIDE_RAD; s++) out.push(s * 0.07, -s * 0.07);
  return out;
})();

interface Obstacle {
  x: number;
  z: number;
  r: number;
}

interface Segment {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}

export function createPathNetwork(o: PathNetworkOptions): PathNetwork {
  const { pathfinder, wear, rings, rng } = o;
  const graph = createPathGraph({ pathfinder, wear, onLaid: o.onLaid });
  const tracks = createPathTracks(graph, pathfinder);
  const { nodes } = graph;
  /** Per ring: road nodes sorted by angle. */
  const roadNodes: number[][] = Array.from({ length: rings.count }, () => []);
  const radialThetas: number[][] = Array.from({ length: rings.count }, () => []);
  const radialSegs: Segment[] = [];
  const obstacles: Obstacle[] = [];
  const doors: { door: number; road: number }[] = [];
  const fieldNodes: number[] = [];
  /** The main road so far (x, z pairs) and the rings it already has a junction on. */
  const axis: number[] = [];
  const axisJunction: boolean[] = [];
  const waypoints = new Float32Array(PATH.MAX_WAYPOINTS * 2);
  /** The temple's door node (-1 until the plaza is laid) and the temple itself. */
  let templeNode = -1;
  let templeBuilding: Building | null = null;
  let radialCount = 0;

  const roadPoint = (k: number, theta: number, dev = 0): [number, number] => {
    const r = rings.roadRadiusAt(k, theta) + dev;
    return [rings.centerX + Math.sin(theta) * r, rings.centerZ + Math.cos(theta) * r];
  };

  /** Wear of a ring road: the plaza loop (ring 0) is the best trodden. */
  const roadWear = (k: number): [number, number] =>
    k === 0 ? [PATHS.PLAZA_VALUE, PATHS.PLAZA_FLOOR] : [PATHS.ROAD_VALUE, PATHS.ROAD_FLOOR];

  /** Lay the ring road between two road nodes of one ring, along the shorter way round. */
  const layArc = (a: number, b: number): boolean => {
    if (graph.hasLink(a, b)) return true;
    const na = nodes[a]!;
    const nb = nodes[b]!;
    let delta = norm(nb.theta - na.theta);
    if (delta > Math.PI) delta -= TWO_PI;
    const meanR = rings.roadRadiusAt(na.ring, na.theta + delta / 2);
    const length = Math.abs(delta) * meanR;
    if (length > PATHS.ARC_MAX_M) return false;
    const steps = Math.max(2, Math.ceil(length / PATHS.ARC_STEP_M));
    const points: number[] = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const dev = na.dev + (nb.dev - na.dev) * fadeHermite(t);
      points.push(...roadPoint(na.ring, na.theta + delta * t, dev));
    }
    for (let i = 0; i < points.length; i += 2) {
      if (!pathfinder.isTerrainWalkable(points[i]!, points[i + 1]!)) {
        graph.noteSkipped();
        return false;
      }
    }
    const [value, floor] = roadWear(na.ring);
    graph.paint(points, value, floor, PATHS.ROAD_RADIUS_M);
    graph.addLink(a, b);
    graph.arcDegree[a]!++;
    graph.arcDegree[b]!++;
    graph.join(a, b);
    return true;
  };

  /** Put a node on ring road k at an angle; it is joined to its neighbours along the road. */
  const addRoadNode = (
    k: number,
    angle: number,
    dev = 0,
    at?: readonly [number, number],
  ): number => {
    const theta = norm(angle);
    const [x, z] = at ?? roadPoint(k, theta, dev);
    const index = graph.addNode({ kind: 'road', x, z, ring: k, theta, dev });
    const list = roadNodes[k]!;
    let pos = 0;
    while (pos < list.length && nodes[list[pos]!]!.theta <= theta) pos++;
    list.splice(pos, 0, index);
    if (list.length > 1) {
      const pred = list[(pos - 1 + list.length) % list.length]!;
      const succ = list[(pos + 1) % list.length]!;
      layArc(pred, index);
      if (succ !== pred) layArc(index, succ);
    }
    return index;
  };

  /** Whether a straight lane clears the buildings and fields around it and lies on walkable ground. */
  const laneClear = (seg: Segment): boolean => {
    if (!graph.lineWalkable(seg.x0, seg.z0, seg.x1, seg.z1)) return false;
    for (const ob of obstacles) {
      if (
        segmentDistance(ob.x, ob.z, seg.x0, seg.z0, seg.x1, seg.z1) <
        ob.r + PATHS.ROAD_MARGIN_M * PATHS.LANE_CLEAR_SHARE
      )
        return false;
    }
    return true;
  };

  /** A radial lane from a road node inward to ring k-1; returns the inner road node, or -1. */
  const layRadial = (from: number, force: boolean): number => {
    const start = nodes[from]!;
    const k = start.ring;
    if (k <= 0) return -1;
    for (const slide of SLIDES) {
      const theta = norm(start.theta + slide);
      if (!force) {
        const meanR = rings.roadRadiusAt(k, theta);
        const tooClose = radialThetas[k]!.some((t) => {
          const d = Math.abs(norm(t - theta + Math.PI) - Math.PI);
          return d * meanR < PATHS.RADIAL_MIN_GAP_M;
        });
        if (tooClose) continue;
      }
      const [ox, oz] = roadPoint(k, theta);
      const [ix, iz] = roadPoint(k - 1, theta);
      const seg = { x0: ox, z0: oz, x1: ix, z1: iz };
      if (!laneClear(seg)) continue;
      const outer = slide === 0 ? from : addRoadNode(k, theta);
      if (outer !== from && !graph.connected(outer, from)) continue;
      const inner = addRoadNode(k - 1, theta);
      graph.paintSway([ox, oz, ix, iz], PATHS.ROAD_VALUE, PATHS.ROAD_FLOOR, PATHS.ROAD_RADIUS_M);
      graph.addLink(outer, inner);
      graph.join(outer, inner);
      radialSegs.push(seg);
      radialThetas[k]!.push(theta);
      radialCount++;
      return inner;
    }
    return -1;
  };

  /** A short straight stub from a doorstep to its road (or any two nearby nodes). */
  const layStub = (a: number, b: number): boolean => {
    const from = nodes[a]!;
    const to = nodes[b]!;
    const length = Math.hypot(to.x - from.x, to.z - from.z);
    if (length > PATHS.STUB_MIN_M) {
      if (!graph.lineWalkable(from.x, from.z, to.x, to.z)) return false;
      graph.paintSway(
        [from.x, from.z, to.x, to.z],
        PATHS.LAID_VALUE,
        PATHS.LAID_FLOOR,
        PATHS.LAID_RADIUS_M,
      );
    }
    graph.addLink(a, b);
    graph.join(a, b);
    return true;
  };

  /** Angle on ring road k whose point is closest to (x, z); turned doors may sit off to one side. */
  const bestRoadTheta = (k: number, x: number, z: number): number => {
    const theta0 = rings.thetaOf(x - rings.centerX, z - rings.centerZ);
    let best = theta0;
    let bestD = Number.POSITIVE_INFINITY;
    const { STEPS, STEP_RAD } = PATHS.DOOR_SEARCH;
    for (let s = -STEPS; s <= STEPS; s++) {
      const theta = theta0 + s * STEP_RAD;
      const [px, pz] = roadPoint(k, theta);
      const d = Math.hypot(px - x, pz - z);
      if (d < bestD) {
        bestD = d;
        best = theta;
      }
    }
    return best;
  };

  /** Make sure a road node reaches the temple, laying radial lanes inward ring by ring if needed. */
  const connect = (road: number): boolean => {
    let current = road;
    for (let guard = 0; guard <= rings.count; guard++) {
      if (graph.connectedToTemple(current)) return true;
      const inner = layRadial(current, true);
      if (inner < 0) break;
      current = inner;
    }
    return graph.connectedToTemple(road);
  };

  /** Register the main road (x, z pairs from the doorstep outward) and join the ring roads it crosses. */
  const layAxisRoad = (points: readonly number[]) => {
    axis.push(...(axis.length === 0 ? points : points.slice(2)));
    for (let k = 1; k < rings.count; k++) {
      if (axisJunction[k]) continue;
      const [px, pz] = roadPoint(k, rings.doorYaw);
      let best: [number, number] | null = null;
      let bestD: number = PATHS.AXIS_SNAP_M;
      for (let i = 0; i + 3 < axis.length; i += 2) {
        const ax = axis[i]!;
        const az = axis[i + 1]!;
        const bx = axis[i + 2]!;
        const bz = axis[i + 3]!;
        const len2 = (bx - ax) ** 2 + (bz - az) ** 2;
        const t =
          len2 > 0
            ? Math.max(0, Math.min(1, ((px - ax) * (bx - ax) + (pz - az) * (bz - az)) / len2))
            : 0;
        const qx = ax + (bx - ax) * t;
        const qz = az + (bz - az) * t;
        const d = Math.hypot(px - qx, pz - qz);
        if (d < bestD) {
          bestD = d;
          best = [qx, qz];
        }
      }
      if (!best) continue;
      const theta = rings.thetaOf(best[0] - rings.centerX, best[1] - rings.centerZ);
      const radius = Math.hypot(best[0] - rings.centerX, best[1] - rings.centerZ);
      const node = addRoadNode(k, theta, radius - rings.roadRadiusAt(k, theta), best);
      axisJunction[k] = true;
      if (templeNode >= 0) graph.join(node, templeNode);
    }
    o.onLaid();
  };

  /** The main road reaches this ring so far (-1: not laid yet) and ends at this point. */
  let axisRing = -1;
  let axisEndX = 0;
  let axisEndZ = 0;

  /**
   * Main road: from the temple door along its axis, out to the outermost ring with houses, already
   * worn in. Extends the road when a ring beyond its reach gets a building.
   */
  const growAxisRoad = (ring: number) => {
    if (ring <= axisRing || !templeBuilding) return;
    const [sx, sz] = axisRing < 0 ? o.doorstepOf(templeBuilding) : [axisEndX, axisEndZ];
    const reach = rings.radiusAt(ring, rings.doorYaw) + RINGS.ROAD_OVERSHOOT_M;
    const n = pathfinder.find(
      sx,
      sz,
      rings.centerX + Math.sin(rings.doorYaw) * reach,
      rings.centerZ + Math.cos(rings.doorYaw) * reach,
      waypoints,
      0,
      PATH.MAX_WAYPOINTS,
    );
    // Reached or not, do not search again for this ring.
    axisRing = ring;
    let px = sx;
    let pz = sz;
    const road = [sx, sz];
    for (let k = 0; k < n; k++) {
      const x = waypoints[k * 2]!;
      const z = waypoints[k * 2 + 1]!;
      road.push(x, z);
      wear.paintLine(px, pz, x, z, WEAR.OLD_ROAD, WEAR.OLD_ROAD_RADIUS_M, WEAR.OLD_ROAD_FLOOR);
      px = x;
      pz = z;
    }
    axisEndX = px;
    axisEndZ = pz;
    layAxisRoad(road);
  };

  return {
    layPlaza: (temple) => {
      templeBuilding = temple;
      const [dx, dz] = o.doorstepOf(temple);
      templeNode = graph.addNode({ kind: 'door', x: dx, z: dz, ring: -1, theta: 0, dev: 0 });
      graph.setTemple(templeNode);
      obstacles.push({ x: temple.x, z: temple.z, r: Math.hypot(temple.halfW, temple.halfD) + PATHS.TEMPLE_PAD_M });
      const count = PATHS.PLAZA_NODES;
      const phase = rng() * TWO_PI;
      const plaza: number[] = [];
      for (let i = 0; i < count; i++) {
        plaza.push(addRoadNode(0, phase + ((i + (rng() - 0.5) * 0.3) / count) * TWO_PI));
      }
      layArc(plaza[plaza.length - 1]!, plaza[0]!);
      const doorTheta = rings.thetaOf(dx - rings.centerX, dz - rings.centerZ);
      const nearest = plaza
        .map((i) => ({ i, d: Math.abs(norm(nodes[i]!.theta - doorTheta + Math.PI) - Math.PI) }))
        .sort((p, q) => p.d - q.d)[0]!.i;
      if (!layStub(templeNode, nearest)) graph.join(templeNode, nearest);
      o.onLaid();
      growAxisRoad(0);
    },

    linkBuilding: (b) => {
      if (b.ring >= 0) growAxisRoad(b.ring);
      const k = b.ring >= 0 ? b.ring : 0;
      const [dx, dz] = o.doorstepOf(b);
      const door = graph.addNode({ kind: 'door', x: dx, z: dz, ring: -1, theta: 0, dev: 0 });
      obstacles.push({ x: b.x, z: b.z, r: Math.hypot(b.halfW, b.halfD) + PATHS.OBSTACLE_PAD_M });
      const road = addRoadNode(k, bestRoadTheta(k, dx, dz));
      doors.push({ door, road });
      if (!layStub(door, road)) tracks.fallbackLink(door, PATHS.MAX_DETOUR + PATHS.FALLBACK_EXTRA_DETOUR.DOOR);
      if (!connect(road)) tracks.fallbackLink(road, PATHS.MAX_DETOUR + PATHS.FALLBACK_EXTRA_DETOUR.ROAD);
      else if (k >= 1 && rng() < PATHS.RADIAL_P) layRadial(road, false);
      o.onLaid();
    },

    linkField: (field) => {
      const toX = rings.centerX - field.x;
      const toZ = rings.centerZ - field.z;
      const len = Math.hypot(toX, toZ) || 1;
      const reach = Math.max(field.halfW, field.halfD) + 1.5;
      const node = graph.addNode({
        kind: 'field',
        x: field.x + (toX / len) * reach,
        z: field.z + (toZ / len) * reach,
        ring: -1,
        theta: 0,
        dev: 0,
      });
      fieldNodes.push(node);
      obstacles.push({ x: field.x, z: field.z, r: Math.hypot(field.halfW, field.halfD) });
      // Tracks merge into each other and the roads instead of each running its own line.
      tracks.fallbackLink(node, 2.8, PATHS.AFFINITY.TRACK);
    },

    radialDistance: (x, z) => {
      let best = Number.POSITIVE_INFINITY;
      for (const s of radialSegs) {
        best = Math.min(best, segmentDistance(x, z, s.x0, s.z0, s.x1, s.z1));
      }
      return best;
    },

    stats: () => {
      const members = [...doors.map((d) => d.door), ...fieldNodes];
      return {
        nodes: nodes.length,
        links: graph.linkCount(),
        radials: radialCount,
        tracks: tracks.count(),
        connectedShare:
          members.length === 0
            ? 1
            : members.filter((i) => graph.connectedToTemple(i)).length / members.length,
        arcShare:
          doors.length === 0
            ? 1
            : doors.filter((d) => graph.arcDegree[d.road]! >= 1).length / doors.length,
        skipped: graph.skipped(),
      };
    },
  };
}
