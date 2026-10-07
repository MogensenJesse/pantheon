// src/world/village/sim/planner.ts — picks where the next building goes: on a ring around the temple, door turned to it
import { VILLAGE } from '../../../config/village.ts';
import type { VillageBuildingType } from '../model/assetKeys.ts';
import type { Building, FootprintOf } from '../model/types.ts';
import { localToWorld } from './geometry.ts';
import type { RingModel } from './ringModel.ts';
import { cellIndex, footprintFree, OCCUPANT, type SiteGrid } from './siteGrid.ts';
import { measureFootprint } from './siting.ts';
import type { TerrainSampler } from './terrainSampler.ts';

export interface PlanContext {
  sampler: TerrainSampler;
  grid: SiteGrid;
  centerX: number;
  centerZ: number;
  radiusM: number;
  rings: RingModel;
  /** Consecutive planner passes with no valid site, per ring (a ring is given up on at the limit). */
  ringFails: number[];
  buildings: readonly Building[];
  footprintOf: FootprintOf;
  rng: () => number;
  /** Multiplier on the relief limit (grows after failed passes). */
  reliefRelax: number;
  /** Whether people can walk from the temple to (x, z): sites cut off by water or cliffs are skipped. */
  reachable: (x: number, z: number) => boolean;
  /** Whether the walk from the temple to (x, z) is no huge detour. */
  walkOk: (x: number, z: number) => boolean;
  /** Distance from (x, z) to the nearest laid radial lane (Infinity when none). */
  radialDistance: (x: number, z: number) => number;
}

export interface SitePlan {
  x: number;
  z: number;
  rotY: number;
  relief: number;
  score: number;
  /** Building type and ring the plan was made for (ring buildings only). */
  type?: VillageBuildingType;
  ring?: number;
}

/** What the village wants next; the ring decides which house variant. */
export type BuildingKind = 'house' | 'workshop' | 'granary';

const { PLAN, RINGS, PATHS } = VILLAGE;

/** Which kind of building the village wants next: homes first, then support buildings. */
export function chooseNextKind(buildings: readonly Building[], rng: () => number): BuildingKind {
  const count = (type: VillageBuildingType) => buildings.filter((b) => b.type === type).length;
  const houses = count('house_a') + count('house_b') + count('house_c');
  if (houses >= 3 && count('granary') < Math.floor(houses / 4)) return 'granary';
  if (houses >= 4 && count('workshop') < Math.floor(houses / 5)) return 'workshop';
  // Consume one roll so the plan stream keeps its rhythm when quotas are met.
  rng();
  return 'house';
}

/** Terrain step under a footprint when it is free and within `maxRelief`, else null. */
function checkSite(
  ctx: PlanContext,
  x: number,
  z: number,
  rotY: number,
  halfW: number,
  halfD: number,
  maxRelief: number,
  ignoreId: number = OCCUPANT.FREE,
): number | null {
  if (!footprintFree(ctx.grid, x, z, rotY, halfW, halfD, PLAN.SPACING_M, ignoreId)) return null;
  if (!ctx.reachable(x, z)) return null;
  const m = measureFootprint(ctx.sampler.getY, x, z, rotY, halfW, halfD, VILLAGE.PLINTH.PAD_M);
  const relief = m.hMax - m.hMin;
  return relief > maxRelief ? null : relief;
}

interface Anchor {
  x: number;
  z: number;
  /** Preferred facing on flat ground (world direction). */
  faceX: number;
  faceZ: number;
}

/** Door faces downhill on slopes (ridge along the contour), toward the anchor's preference on flats. */
function facingYaw(ctx: PlanContext, anchor: Anchor): number {
  const { sampler, grid } = ctx;
  const index = cellIndex(grid, anchor.x, anchor.z);
  const slope = index >= 0 ? grid.slope[index]! : 0;
  const downX = (sampler.getY(anchor.x - 1, anchor.z) - sampler.getY(anchor.x + 1, anchor.z)) / 2;
  const downZ = (sampler.getY(anchor.x, anchor.z - 1) - sampler.getY(anchor.x, anchor.z + 1)) / 2;
  const downLen = Math.hypot(downX, downZ) || 1;
  const toward = Math.hypot(anchor.faceX, anchor.faceZ) || 1;
  const w = Math.min(1, slope / PLAN.FULL_SLOPE_FACING);
  const fx = (downX / downLen) * w + (anchor.faceX / toward) * (1 - w);
  const fz = (downZ / downLen) * w + (anchor.faceZ / toward) * (1 - w);
  return Math.atan2(fx, fz) + (ctx.rng() - 0.5) * 2 * PLAN.YAW_JITTER;
}

/** Unit offsets of a footprint's corners and edge midpoints. */
const PERIMETER: readonly (readonly [number, number])[] = [
  [-1, -1],
  [1, -1],
  [1, 1],
  [-1, 1],
  [0, -1],
  [0, 1],
  [-1, 0],
  [1, 0],
];

/** A footprint on ring k sits between that ring's road and the next one out, clear of laid radial lanes. */
function clearOfRoads(
  ctx: PlanContext,
  k: number,
  x: number,
  z: number,
  rotY: number,
  halfW: number,
  halfD: number,
): boolean {
  const { rings } = ctx;
  const clear = PATHS.ROAD_MARGIN_M;
  const frame = { x, z, rotY };
  for (const [ox, oz] of PERIMETER) {
    const [px, pz] = localToWorld(frame, ox * halfW, oz * halfD);
    const dx = px - ctx.centerX;
    const dz = pz - ctx.centerZ;
    const theta = rings.thetaOf(dx, dz);
    const r = Math.hypot(dx, dz);
    if (r < rings.roadRadiusAt(k, theta) + clear) return false;
    if (k + 1 < rings.count && r > rings.roadRadiusAt(k + 1, theta) - clear) return false;
  }
  return ctx.radialDistance(x, z) >= Math.hypot(halfW, halfD) + clear;
}

const ringCount = (ctx: PlanContext, k: number) => ctx.buildings.filter((b) => b.ring === k).length;

const ringAlive = (ctx: PlanContext, k: number) => ctx.ringFails[k]! < RINGS.EXHAUST_AFTER_FAILS;

const ringOpen = (ctx: PlanContext, k: number) =>
  ringAlive(ctx, k) &&
  ringCount(ctx, k) <
    RINGS.FILL_TARGET[Math.min(k, RINGS.FILL_TARGET.length - 1)]! * ctx.rings.capacity(k);

/** Rings to try for a kind, most preferred first; every ring left is a fallback. */
function ringOrder(ctx: PlanContext, kind: BuildingKind): number[] {
  const all = Array.from({ length: ctx.rings.count }, (_, k) => k);
  const open = all.filter((k) => ringOpen(ctx, k));
  // When every ring is at its target they overfill rather than stall the village.
  const pool = open.length > 0 ? open : all.filter((k) => ringAlive(ctx, k));
  if (pool.length === 0) return [];
  let first = pool[0]!;
  if (kind === 'workshop') {
    first = pool.find((k) => k >= 1 && k <= 2) ?? first;
  } else if (kind === 'granary') {
    const outermost = Math.max(0, ...ctx.buildings.map((b) => b.ring));
    first = pool.find((k) => k >= outermost) ?? pool[pool.length - 1]!;
  } else if (pool.length > 1 && ctx.rng() < RINGS.SPILL) {
    first = pool[1]!;
  }
  return [first, ...pool.filter((k) => k !== first)];
}

/** House variant by ring: larger houses nearer the temple. */
function pickHouse(ctx: PlanContext, k: number): VillageBuildingType {
  const mix = RINGS.HOUSE_MIX[Math.min(k, RINGS.HOUSE_MIX.length - 1)]!;
  const roll = ctx.rng();
  if (roll < mix[0]) return 'house_a';
  return roll < mix[0] + mix[1] ? 'house_b' : 'house_c';
}

/** Door toward the temple with a little noise; now and then a house is turned for variety. */
function ringFacing(ctx: PlanContext, x: number, z: number, turn: number): number {
  const yaw = Math.atan2(ctx.centerX - x, ctx.centerZ - z);
  return yaw + turn + (ctx.rng() + ctx.rng() - 1) * RINGS.FACING_JITTER;
}

/** Extra turn for this building: usually none, now and then well off the temple direction. */
function rollTurn(ctx: PlanContext): number {
  if (ctx.rng() >= RINGS.TURNED_SHARE) return 0;
  const [lo, hi] = RINGS.TURNED_EXTRA;
  return (lo + ctx.rng() * (hi - lo)) * (ctx.rng() < 0.5 ? -1 : 1);
}

/** Highest-scoring candidate whose walk from the temple is sane. */
function firstWalkable(ctx: PlanContext, found: SitePlan[]): SitePlan | null {
  found.sort((a, b) => b.score - a.score);
  for (const site of found) if (ctx.walkOk(site.x, site.z)) return site;
  return null;
}

/** Best candidate on ring `k` for a building of `type`, or null when none of this pass's fit. */
function planOnRing(
  ctx: PlanContext,
  k: number,
  type: VillageBuildingType,
  maxRelief: number,
): SitePlan | null {
  const [w, d] = ctx.footprintOf(type);
  const halfW = w / 2;
  const halfD = d / 2;
  const reach = Math.hypot(halfW, halfD);
  const { rings } = ctx;
  const found: SitePlan[] = [];
  // Decided once per building, so the turned share is not inflated by picking the best of many.
  const turn = rollTurn(ctx);

  for (let n = 0; n < PLAN.CANDIDATES; n++) {
    const theta = ctx.rng() * Math.PI * 2;
    const offset = (ctx.rng() + ctx.rng() + ctx.rng() - 1.5) * 2 * RINGS.RADIAL_SIGMA_M;
    const radius = rings.radiusAt(k, theta) + offset;
    if (radius + reach > ctx.radiusM) continue;
    const x = ctx.centerX + Math.sin(theta) * radius;
    const z = ctx.centerZ + Math.cos(theta) * radius;
    if (rings.roadDistance(x, z) < RINGS.ROAD_CLEAR_M + Math.max(halfW, halfD)) continue;
    const rotY = ringFacing(ctx, x, z, turn);
    if (!clearOfRoads(ctx, k, x, z, rotY, halfW, halfD)) continue;
    const relief = checkSite(ctx, x, z, rotY, halfW, halfD, maxRelief);
    if (relief === null) continue;

    // Blue-noise spacing: reward room around the spot, up to a comfortable gap.
    let gap = Number.POSITIVE_INFINITY;
    for (const b of ctx.buildings) {
      gap = Math.min(gap, Math.hypot(b.x - x, b.z - z) - Math.hypot(b.halfW, b.halfD) - reach);
    }
    const spacing = Math.min(Math.max(gap, 0), RINGS.GOAL_GAP_M) / RINGS.GOAL_GAP_M;
    const score =
      RINGS.SPACING_WEIGHT * spacing -
      2 * relief -
      0.15 * Math.abs(offset) +
      RINGS.DENSITY_WEIGHT * rings.density(k, theta) +
      ctx.rng() * 0.4;
    found.push({ x, z, rotY, relief, score });
  }
  return firstWalkable(ctx, found);
}

/** Best-scoring valid ring site for a `kind` of building, or null when no ring has room this pass. */
export function planBuilding(ctx: PlanContext, kind: BuildingKind): SitePlan | null {
  const maxRelief = Math.min(PLAN.RELIEF_RELAX_CAP_M, PLAN.MAX_RELIEF_M * ctx.reliefRelax);
  const atCap = ctx.reliefRelax >= PLAN.RELIEF_RELAX_CAP_M / PLAN.MAX_RELIEF_M - 1e-6;
  for (const k of ringOrder(ctx, kind)) {
    const type =
      kind === 'house' ? pickHouse(ctx, k) : kind === 'workshop' ? 'workshop' : 'granary';
    const site = planOnRing(ctx, k, type, maxRelief);
    if (site) {
      ctx.ringFails[k] = 0;
      return { ...site, type, ring: k };
    }
    // A ring is only given up on once even the relaxed relief limit finds nothing.
    if (atCap) ctx.ringFails[k]!++;
  }
  return null;
}

/** A field site beyond the outermost ring: flat, dry, rows along the contour. */
export function planField(ctx: PlanContext): SitePlan | null {
  const { FIELDS } = VILLAGE;
  const halfW = FIELDS.WIDTH_M / 2;
  const halfD = FIELDS.DEPTH_M / 2;
  const reach = Math.hypot(halfW, halfD);
  const outerMin = Math.max(
    FIELDS.MIN_RADIUS_SHARE * ctx.radiusM,
    Math.min(ctx.rings.outerRadius + RINGS.FIELD_GAP_M, 0.75 * ctx.radiusM),
  );
  const maxR = Math.max(outerMin + 12, FIELDS.MAX_RADIUS_SHARE * ctx.radiusM);
  // Beyond the rings first; where the terrain leaves no room there, gaps between the rings will do.
  for (const minR of [outerMin, FIELDS.MIN_RADIUS_SHARE * ctx.radiusM]) {
    const found: SitePlan[] = [];
    for (let n = 0; n < PLAN.CANDIDATES; n++) {
      const angle = ctx.rng() * Math.PI * 2;
      const r = minR + ctx.rng() * (maxR - minR);
      if (r + reach > ctx.radiusM) continue;
      const x = ctx.centerX + Math.sin(angle) * r;
      const z = ctx.centerZ + Math.cos(angle) * r;
      const rotY = facingYaw(ctx, { x, z, faceX: ctx.centerX - x, faceZ: ctx.centerZ - z });
      const relief = checkSite(ctx, x, z, rotY, halfW, halfD, FIELDS.MAX_RELIEF_M);
      if (relief === null) continue;
      const score = -2 * relief - 0.05 * (r - minR) + ctx.rng() * 0.5;
      found.push({ x, z, rotY, relief, score });
    }
    const site = firstWalkable(ctx, found);
    if (site) return site;
  }
  return null;
}

/** The well goes on the plaza edge in front of the temple door, or anywhere around the plaza. */
export function planWell(ctx: PlanContext, footprint: readonly [number, number]): SitePlan | null {
  const door = ctx.rings.doorYaw;
  // In front of the door on near-flat ground first, then around the whole plaza on rougher ground.
  const passes = [
    { spread: 1, maxRelief: 0.8 },
    { spread: Math.PI, maxRelief: 1.6 },
  ];
  for (const { spread, maxRelief } of passes) {
    let best: SitePlan | null = null;
    for (let n = 0; n < PLAN.CANDIDATES; n++) {
      const angle = door + (ctx.rng() - 0.5) * 2 * spread;
      // Just inside the plaza loop (ring road 0), off the main road.
      const dist = ctx.rings.roadRadiusAt(0, angle) - 3 - ctx.rng() * 2;
      if (
        ctx.rings.roadDistance(
          ctx.centerX + Math.sin(angle) * dist,
          ctx.centerZ + Math.cos(angle) * dist,
        ) < RINGS.ROAD_CLEAR_M
      )
        continue;
      const x = ctx.centerX + Math.sin(angle) * dist;
      const z = ctx.centerZ + Math.cos(angle) * dist;
      const rotY = facingYaw(ctx, { x, z, faceX: ctx.centerX - x, faceZ: ctx.centerZ - z });
      const relief = checkSite(
        ctx,
        x,
        z,
        rotY,
        footprint[0] / 2,
        footprint[1] / 2,
        maxRelief,
        OCCUPANT.PLAZA,
      );
      if (relief === null) continue;
      const score = -2 * relief + ctx.rng() * 0.4;
      if (!best || score > best.score) best = { x, z, rotY, relief, score };
    }
    if (best) return best;
  }
  return null;
}
