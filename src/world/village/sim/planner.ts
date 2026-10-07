// src/world/village/sim/planner.ts — picks where the next building goes: flat, dry, free, near the village core
import { VILLAGE } from '../../../config/village.ts';
import type { VillageBuildingType } from '../assets/villageAssetKeys.ts';
import { cellIndex, footprintFree, type SiteGrid } from './siteGrid.ts';
import { measureFootprint } from './siteMeasure.ts';
import type { TerrainSampler } from './terrainSampler.ts';
import type { Building, FootprintOf } from './villageTypes.ts';

/** A street leaving the temple plaza. Direction is (sin yaw, cos yaw), like a building's door. */
export interface Spoke {
  yaw: number;
  lengthM: number;
}

export interface PlanContext {
  sampler: TerrainSampler;
  grid: SiteGrid;
  centerX: number;
  centerZ: number;
  radiusM: number;
  spokes: readonly Spoke[];
  buildings: readonly Building[];
  footprintOf: FootprintOf;
  rng: () => number;
  /** Multiplier on the relief limit (grows after failed passes). */
  reliefRelax: number;
}

export interface SitePlan {
  x: number;
  z: number;
  rotY: number;
  relief: number;
  score: number;
}

const { PLAN } = VILLAGE;

export function pickSpokes(rng: () => number, templeYaw: number, radiusM: number): Spoke[] {
  const { MIN, MAX, MIN_LENGTH_M, MAX_LENGTH_M } = PLAN.SPOKES;
  const count = MIN + Math.floor(rng() * (MAX - MIN + 1));
  const quarter = Math.PI / 2;
  const yaws = [
    templeYaw,
    templeYaw + (0.8 + 0.4 * rng()) * quarter,
    templeYaw - (0.8 + 0.4 * rng()) * quarter,
    templeYaw + Math.PI * (0.85 + 0.3 * rng()),
  ];
  return yaws.slice(0, count).map((yaw) => ({
    yaw,
    lengthM: Math.min(radiusM * 0.9, MIN_LENGTH_M + rng() * (MAX_LENGTH_M - MIN_LENGTH_M)),
  }));
}

/** Which kind of building the village wants next: homes first, then support buildings. */
export function chooseNextType(
  buildings: readonly Building[],
  rng: () => number,
): VillageBuildingType {
  const count = (type: VillageBuildingType) => buildings.filter((b) => b.type === type).length;
  const houses = count('house_a') + count('house_b') + count('house_c');
  if (houses >= 3 && count('granary') < Math.floor(houses / 4)) return 'granary';
  if (houses >= 4 && count('workshop') < Math.floor(houses / 5)) return 'workshop';
  const roll = rng();
  return roll < 0.5 ? 'house_a' : roll < 0.8 ? 'house_b' : 'house_c';
}

function distanceToSpoke(ctx: PlanContext, spoke: Spoke, x: number, z: number): number {
  const dx = Math.sin(spoke.yaw);
  const dz = Math.cos(spoke.yaw);
  const t = Math.min(spoke.lengthM, Math.max(0, (x - ctx.centerX) * dx + (z - ctx.centerZ) * dz));
  return Math.hypot(x - (ctx.centerX + dx * t), z - (ctx.centerZ + dz * t));
}

interface Anchor {
  x: number;
  z: number;
  /** Preferred facing on flat ground (world direction). */
  faceX: number;
  faceZ: number;
}

function pickAnchor(ctx: PlanContext): Anchor {
  const { rng, centerX: cx, centerZ: cz } = ctx;
  const roll = rng();
  const homes = ctx.buildings.filter((b) => b.type !== 'temple');
  if (roll < 0.5) {
    const spoke = ctx.spokes[Math.floor(rng() * ctx.spokes.length)]!;
    const t = PLAN.PLAZA_M + 6 + rng() * Math.max(1, spoke.lengthM - PLAN.PLAZA_M - 6);
    const side = rng() < 0.5 ? -1 : 1;
    const lateral = side * (PLAN.SPOKES.SETBACK_M + rng() * 3);
    const dx = Math.sin(spoke.yaw);
    const dz = Math.cos(spoke.yaw);
    const px = Math.cos(spoke.yaw);
    const pz = -Math.sin(spoke.yaw);
    return {
      x: cx + dx * t + px * lateral,
      z: cz + dz * t + pz * lateral,
      faceX: -px * side,
      faceZ: -pz * side,
    };
  }
  if (roll < 0.8 || homes.length === 0) {
    const angle = rng() * Math.PI * 2;
    const span = Math.min(ctx.radiusM * 0.85, 14 + 6 * Math.sqrt(homes.length));
    const r = PLAN.PLAZA_M + 8 + rng() * span;
    const x = cx + Math.sin(angle) * r;
    const z = cz + Math.cos(angle) * r;
    return { x, z, faceX: cx - x, faceZ: cz - z };
  }
  const anchor = homes[Math.floor(rng() * homes.length)]!;
  const angle = rng() * Math.PI * 2;
  const r = 8 + rng() * 6;
  const x = anchor.x + Math.sin(angle) * r;
  const z = anchor.z + Math.cos(angle) * r;
  return { x, z, faceX: cx - x, faceZ: cz - z };
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

/** Best-scoring valid site for `type`, or null when none of this pass's candidates fit. */
export function planSite(ctx: PlanContext, type: VillageBuildingType): SitePlan | null {
  const [w, d] = ctx.footprintOf(type);
  const halfW = w / 2;
  const halfD = d / 2;
  const reach = Math.hypot(halfW, halfD);
  const maxRelief = Math.min(PLAN.RELIEF_RELAX_CAP_M, PLAN.MAX_RELIEF_M * ctx.reliefRelax);
  let best: SitePlan | null = null;

  for (let n = 0; n < PLAN.CANDIDATES; n++) {
    const anchor = pickAnchor(ctx);
    const dist = Math.hypot(anchor.x - ctx.centerX, anchor.z - ctx.centerZ);
    if (dist > ctx.radiusM - reach || dist < PLAN.PLAZA_M + reach) continue;
    const rotY = facingYaw(ctx, anchor);
    if (!footprintFree(ctx.grid, anchor.x, anchor.z, rotY, halfW, halfD, PLAN.SPACING_M)) continue;
    const m = measureFootprint(
      ctx.sampler.getY,
      anchor.x,
      anchor.z,
      rotY,
      halfW,
      halfD,
      VILLAGE.PLINTH.PAD_M,
    );
    const relief = m.hMax - m.hMin;
    if (relief > maxRelief) continue;
    const streetGap = Math.min(
      ...ctx.spokes.map((s) => distanceToSpoke(ctx, s, anchor.x, anchor.z)),
    );
    const score =
      -2 * relief - 0.04 * dist + 2 * (1 - Math.min(1, streetGap / 12)) + ctx.rng() * 0.6;
    if (!best || score > best.score) best = { x: anchor.x, z: anchor.z, rotY, relief, score };
  }
  return best;
}
