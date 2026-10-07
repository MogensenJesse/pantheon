// src/world/village/sim/pathNetwork.ts — ring roads, radial lanes and doorstep stubs, laid as the village grows
import { VILLAGE } from '../../../config/village.ts';
import { fadeHermite } from '../../../core/math/scalar.ts';
import { hash01, wrap } from './geometry.ts';
import type { Pathfinder } from './pathfind.ts';
import type { RingModel } from './ringModel.ts';
import type { Building, Field } from './villageTypes.ts';
import type { WearField } from './wearField.ts';

const { PATHS, PATH } = VILLAGE;
const TWO_PI = Math.PI * 2;

type NodeKind = 'door' | 'road' | 'field';

interface Node {
  kind: NodeKind;
  x: number;
  z: number;
  /** Road nodes: the ring road they sit on (-1 otherwise) and the angle around the temple. */
  ring: number;
  theta: number;
  /** Road nodes: metres off the ideal ring road (only junctions with the main road differ). */
  dev: number;
}

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
  /** The plaza loop (ring road 0) and the temple's door link; call once at founding. */
  layPlaza: (temple: Building) => void;
  /** The main road along the door axis as waypoints (x, z pairs); call again with each extension. */
  layAxisRoad: (points: readonly number[]) => void;
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

/** Smooth 1D value noise in -1..1. */
function valueNoise(t: number, seed: number): number {
  const i = Math.floor(t);
  const f = t - i;
  const u = f * f * (3 - 2 * f);
  return (hash01(i + seed) * (1 - u) + hash01(i + 1 + seed) * u) * 2 - 1;
}

/** Subdivide to about 3 m steps and sway sideways, tapering to zero at both ends. */
function sway(points: number[], amplitude: number, seed: number): number[] {
  const out: number[] = [];
  let total = 0;
  for (let i = 0; i + 3 < points.length; i += 2) {
    total += Math.hypot(points[i + 2]! - points[i]!, points[i + 3]! - points[i + 1]!);
  }
  let travelled = 0;
  for (let i = 0; i + 3 < points.length; i += 2) {
    const [x0, z0, x1, z1] = [points[i]!, points[i + 1]!, points[i + 2]!, points[i + 3]!];
    const len = Math.hypot(x1 - x0, z1 - z0) || 1;
    const nx = -(z1 - z0) / len;
    const nz = (x1 - x0) / len;
    const steps = Math.max(1, Math.ceil(len / 3));
    for (let k = 0; k < steps; k++) {
      const s = travelled + (len * k) / steps;
      const taper = Math.min(1, s / 6, (total - s) / 6);
      const offset = amplitude * valueNoise(s * 0.12, seed) * Math.max(0, taper);
      const t = k / steps;
      out.push(x0 + (x1 - x0) * t + nx * offset, z0 + (z1 - z0) * t + nz * offset);
    }
    travelled += len;
  }
  out.push(points[points.length - 2]!, points[points.length - 1]!);
  return out;
}

/** One round of corner cutting that keeps both ends in place. */
function chaikin(points: number[]): number[] {
  if (points.length <= 4) return points;
  const out = [points[0]!, points[1]!];
  for (let i = 0; i + 3 < points.length; i += 2) {
    const [x0, z0, x1, z1] = [points[i]!, points[i + 1]!, points[i + 2]!, points[i + 3]!];
    out.push(
      0.75 * x0 + 0.25 * x1,
      0.75 * z0 + 0.25 * z1,
      0.25 * x0 + 0.75 * x1,
      0.25 * z0 + 0.75 * z1,
    );
  }
  out.push(points[points.length - 2]!, points[points.length - 1]!);
  return out;
}

const norm = (theta: number) => wrap(theta, TWO_PI);

/** Distance from (px, pz) to the segment (ax, az)-(bx, bz). */
function segmentDistance(
  px: number,
  pz: number,
  ax: number,
  az: number,
  bx: number,
  bz: number,
): number {
  const dx = bx - ax;
  const dz = bz - az;
  const len2 = dx * dx + dz * dz;
  const t = len2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / len2)) : 0;
  return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
}

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
  const nodes: Node[] = [];
  const parent: number[] = [];
  const arcDegree: number[] = [];
  const links = new Set<string>();
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
  let templeNode = -1;
  let radialCount = 0;
  let trackCount = 0;
  let skipped = 0;
  let swaySeed = 1;

  const root = (i: number): number => {
    let r = i;
    while (parent[r] !== r) r = parent[r]!;
    return r;
  };
  const join = (a: number, b: number) => {
    parent[root(a)] = root(b);
  };
  const connectedToTemple = (i: number) => templeNode >= 0 && root(i) === root(templeNode);
  const addNode = (node: Node): number => {
    nodes.push(node);
    parent.push(nodes.length - 1);
    arcDegree.push(0);
    return nodes.length - 1;
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
  const paintSway = (points: number[], value: number, floor: number, radius: number) => {
    swaySeed += 7;
    paint(sway(points, 0.5, swaySeed), value, floor, radius);
  };

  const lineWalkable = (x0: number, z0: number, x1: number, z1: number): boolean => {
    const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 2));
    for (let k = 0; k <= steps; k++) {
      const t = k / steps;
      if (!pathfinder.isTerrainWalkable(x0 + (x1 - x0) * t, z0 + (z1 - z0) * t)) return false;
    }
    return true;
  };

  const roadPoint = (k: number, theta: number, dev = 0): [number, number] => {
    const r = rings.roadRadiusAt(k, theta) + dev;
    return [rings.centerX + Math.sin(theta) * r, rings.centerZ + Math.cos(theta) * r];
  };

  /** Wear of a ring road: the plaza loop (ring 0) is the best trodden. */
  const roadWear = (k: number): [number, number] =>
    k === 0 ? [PATHS.PLAZA_VALUE, PATHS.PLAZA_FLOOR] : [PATHS.ROAD_VALUE, PATHS.ROAD_FLOOR];

  /** Lay the ring road between two road nodes of one ring, along the shorter way round. */
  const layArc = (a: number, b: number): boolean => {
    const key = pairKey(a, b);
    if (links.has(key)) return true;
    const na = nodes[a]!;
    const nb = nodes[b]!;
    let delta = norm(nb.theta - na.theta);
    if (delta > Math.PI) delta -= TWO_PI;
    const meanR = rings.roadRadiusAt(na.ring, na.theta + delta / 2);
    const length = Math.abs(delta) * meanR;
    if (length > PATHS.ARC_MAX_M) return false;
    const steps = Math.max(2, Math.ceil(length / 2.5));
    const points: number[] = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const dev = na.dev + (nb.dev - na.dev) * fadeHermite(t);
      points.push(...roadPoint(na.ring, na.theta + delta * t, dev));
    }
    for (let i = 0; i < points.length; i += 2) {
      if (!pathfinder.isTerrainWalkable(points[i]!, points[i + 1]!)) {
        skipped++;
        return false;
      }
    }
    const [value, floor] = roadWear(na.ring);
    paint(points, value, floor, PATHS.ROAD_RADIUS_M);
    links.add(key);
    arcDegree[a]!++;
    arcDegree[b]!++;
    join(a, b);
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
    const index = addNode({ kind: 'road', x, z, ring: k, theta, dev });
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
    if (!lineWalkable(seg.x0, seg.z0, seg.x1, seg.z1)) return false;
    for (const ob of obstacles) {
      if (
        segmentDistance(ob.x, ob.z, seg.x0, seg.z0, seg.x1, seg.z1) <
        ob.r + PATHS.ROAD_MARGIN_M * 0.8
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
      if (outer !== from && root(outer) !== root(from)) continue;
      const inner = addRoadNode(k - 1, theta);
      paintSway([ox, oz, ix, iz], PATHS.ROAD_VALUE, PATHS.ROAD_FLOOR, PATHS.ROAD_RADIUS_M);
      links.add(pairKey(outer, inner));
      join(outer, inner);
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
    if (length > 0.6) {
      if (!lineWalkable(from.x, from.z, to.x, to.z)) return false;
      paintSway(
        [from.x, from.z, to.x, to.z],
        PATHS.LAID_VALUE,
        PATHS.LAID_FLOOR,
        PATHS.LAID_RADIUS_M,
      );
    }
    links.add(pairKey(a, b));
    join(a, b);
    return true;
  };

  /** Route a footpath between two nodes by search, smooth it and paint it (field tracks, fallbacks). */
  const lay = (
    a: number,
    b: number,
    maxDetour: number = PATHS.MAX_DETOUR,
    affinity: number = PATHS.AFFINITY.LAYING,
  ): boolean => {
    const key = pairKey(a, b);
    if (links.has(key)) return true;
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
      skipped++;
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
      skipped++;
      return false;
    }
    swaySeed += 7;
    paint(
      sway(chaikin(points), PATHS.WIGGLE_M, swaySeed),
      PATHS.LAID_VALUE,
      PATHS.LAID_FLOOR,
      PATHS.LAID_RADIUS_M,
    );
    links.add(key);
    join(a, b);
    trackCount++;
    o.onLaid();
    return true;
  };

  /** Join a node to the nearest few nodes already connected to the temple by a searched footpath. */
  const fallbackLink = (
    node: number,
    maxDetour: number,
    affinity: number = PATHS.AFFINITY.LAYING,
  ): boolean => {
    const from = nodes[node]!;
    const candidates = nodes
      .map((n, i) => ({ i, d: Math.hypot(n.x - from.x, n.z - from.z) }))
      .filter((c) => c.i !== node && nodes[c.i]!.kind !== 'field' && connectedToTemple(c.i))
      .sort((p, q) => p.d - q.d)
      .slice(0, 3);
    return candidates.some((c) => lay(node, c.i, maxDetour, affinity));
  };

  /** Angle on ring road k whose point is closest to (x, z); turned doors may sit off to one side. */
  const bestRoadTheta = (k: number, x: number, z: number): number => {
    const theta0 = rings.thetaOf(x - rings.centerX, z - rings.centerZ);
    let best = theta0;
    let bestD = Number.POSITIVE_INFINITY;
    for (let s = -8; s <= 8; s++) {
      const theta = theta0 + s * 0.04;
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
      if (connectedToTemple(current)) return true;
      const inner = layRadial(current, true);
      if (inner < 0) break;
      current = inner;
    }
    return connectedToTemple(road);
  };

  return {
    layPlaza: (temple) => {
      const [dx, dz] = o.doorstepOf(temple);
      templeNode = addNode({ kind: 'door', x: dx, z: dz, ring: -1, theta: 0, dev: 0 });
      obstacles.push({ x: temple.x, z: temple.z, r: Math.hypot(temple.halfW, temple.halfD) + 1 });
      const count = 14;
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
      if (!layStub(templeNode, nearest)) join(templeNode, nearest);
      o.onLaid();
    },

    layAxisRoad: (points) => {
      axis.push(...(axis.length === 0 ? points : points.slice(2)));
      for (let k = 1; k < rings.count; k++) {
        if (axisJunction[k]) continue;
        const [px, pz] = roadPoint(k, rings.doorYaw);
        let best: [number, number] | null = null;
        let bestD = 4;
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
        if (templeNode >= 0) join(node, templeNode);
      }
      o.onLaid();
    },

    linkBuilding: (b) => {
      const k = b.ring >= 0 ? b.ring : 0;
      const [dx, dz] = o.doorstepOf(b);
      const door = addNode({ kind: 'door', x: dx, z: dz, ring: -1, theta: 0, dev: 0 });
      obstacles.push({ x: b.x, z: b.z, r: Math.hypot(b.halfW, b.halfD) + 0.6 });
      const road = addRoadNode(k, bestRoadTheta(k, dx, dz));
      doors.push({ door, road });
      if (!layStub(door, road)) fallbackLink(door, PATHS.MAX_DETOUR + 1);
      if (!connect(road)) fallbackLink(road, PATHS.MAX_DETOUR + 1.8);
      else if (k >= 1 && rng() < PATHS.RADIAL_P) layRadial(road, false);
      o.onLaid();
    },

    linkField: (field) => {
      const toX = rings.centerX - field.x;
      const toZ = rings.centerZ - field.z;
      const len = Math.hypot(toX, toZ) || 1;
      const reach = Math.max(field.halfW, field.halfD) + 1.5;
      const node = addNode({
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
      fallbackLink(node, 2.8, PATHS.AFFINITY.TRACK);
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
        links: links.size,
        radials: radialCount,
        tracks: trackCount,
        connectedShare:
          members.length === 0 ? 1 : members.filter(connectedToTemple).length / members.length,
        arcShare:
          doors.length === 0
            ? 1
            : doors.filter((d) => arcDegree[d.road]! >= 1).length / doors.length,
        skipped,
      };
    },
  };
}
