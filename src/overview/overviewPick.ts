// src/overview/overviewPick.ts — what is under the mouse in the village overview (pure: no DOM, no
// three, node-runnable). A villager wins when one is near the mouse on screen; then a building, found
// by the mouse ray against its box (a roof is hit before the ground behind it); then a field, by the
// ground point.

import type { Building, Field, Villagers } from '../world/village/model/types.ts';

export type Selection =
  | { kind: 'villager'; index: number }
  | { kind: 'building'; id: number }
  | { kind: 'field'; id: number };

export const sameSelection = (a: Selection | null, b: Selection | null): boolean => {
  if (a === b) return true;
  if (!a || !b || a.kind !== b.kind) return false;
  if (a.kind === 'villager') return a.index === (b as typeof a).index;
  return (a as { id: number }).id === (b as { id: number }).id;
};

export interface PickRay {
  ox: number;
  oy: number;
  oz: number;
  dx: number;
  dy: number;
  dz: number;
}

export interface ScreenPoint {
  x: number;
  y: number;
}

export interface PickWorld {
  buildings: readonly Building[];
  fields: readonly Field[];
  villagers: Pick<Villagers, 'count' | 'x' | 'z' | 'indoors'>;
}

/** How far from a villager (px) a click still means them. */
const VILLAGER_PICK_PX = 24;
/** Height of a villager's middle above the ground (m): the point that is projected. */
export const VILLAGER_BODY_M = 1;
/** A building's box is this much bigger all round (m), so a small hut is not a needle at a distance. */
const BUILDING_MARGIN_M = 0.5;

/** About how tall a building is (m), by type and how far it is built. */
export function buildingHeightM(type: string, stage: number): number {
  const full =
    type === 'temple'
      ? 9
      : type === 'well'
        ? 2.2
        : type === 'house_a'
          ? 4
          : type === 'house_b'
            ? 4.5
            : 5;
  if (stage >= 2) return full;
  return stage === 1 ? full * 0.5 : 0.6;
}

/**
 * Where a ray enters a building's box (distance along the ray, the direction being a unit vector), or
 * null. The box stands on `groundY`, is turned by `rotY` as the village's frames are, and is `margin`
 * larger on every side.
 */
export function rayBuildingHit(
  ray: PickRay,
  b: Building,
  groundY: number,
  margin = BUILDING_MARGIN_M,
): number | null {
  const cos = Math.cos(b.rotY);
  const sin = Math.sin(b.rotY);
  // Into the building's frame (the inverse of the village's localToWorld).
  const rx = ray.ox - b.x;
  const rz = ray.oz - b.z;
  const o = [rx * cos - rz * sin, ray.oy - groundY, rx * sin + rz * cos] as const;
  const d = [ray.dx * cos - ray.dz * sin, ray.dy, ray.dx * sin + ray.dz * cos] as const;
  const lo = [-b.halfW - margin, -margin, -b.halfD - margin] as const;
  const hi = [
    b.halfW + margin,
    buildingHeightM(b.type, b.stage) + margin,
    b.halfD + margin,
  ] as const;
  let tMin = 0;
  let tMax = Number.POSITIVE_INFINITY;
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]!) < 1e-9) {
      if (o[i]! < lo[i]! || o[i]! > hi[i]!) return null;
      continue;
    }
    let t0 = (lo[i]! - o[i]!) / d[i]!;
    let t1 = (hi[i]! - o[i]!) / d[i]!;
    if (t0 > t1) [t0, t1] = [t1, t0];
    tMin = Math.max(tMin, t0);
    tMax = Math.min(tMax, t1);
    if (tMin > tMax) return null;
  }
  return tMin;
}

/** Whether a ground point is inside a field's plot. */
export function insideField(f: Field, x: number, z: number): boolean {
  const cos = Math.cos(f.rotY);
  const sin = Math.sin(f.rotY);
  const dx = x - f.x;
  const dz = z - f.z;
  return Math.abs(dx * cos - dz * sin) <= f.halfW && Math.abs(dx * sin + dz * cos) <= f.halfD;
}

export interface PickInput {
  mouse: ScreenPoint;
  ray: PickRay | null;
  /** The ground point under the mouse, or null. */
  ground: { x: number; z: number } | null;
  world: PickWorld;
  groundY: (x: number, z: number) => number;
  /** A world point on the screen in px, or null behind the camera. */
  project: (x: number, y: number, z: number) => ScreenPoint | null;
  villagerPx?: number;
}

export function pickTarget(input: PickInput): Selection | null {
  const { mouse, ray, ground, world, groundY, project } = input;
  const reach = input.villagerPx ?? VILLAGER_PICK_PX;

  const v = world.villagers;
  let best = -1;
  let bestPx = reach;
  for (let i = 0; i < v.count; i++) {
    if (v.indoors[i]) continue;
    const x = v.x[i]!;
    const z = v.z[i]!;
    const p = project(x, groundY(x, z) + VILLAGER_BODY_M, z);
    if (!p) continue;
    const px = Math.hypot(p.x - mouse.x, p.y - mouse.y);
    if (px < bestPx) {
      bestPx = px;
      best = i;
    }
  }
  if (best >= 0) return { kind: 'villager', index: best };

  if (ray) {
    let hitId = -1;
    let hitT = Number.POSITIVE_INFINITY;
    for (const b of world.buildings) {
      const t = rayBuildingHit(ray, b, groundY(b.x, b.z));
      if (t !== null && t < hitT) {
        hitT = t;
        hitId = b.id;
      }
    }
    if (hitId >= 0) return { kind: 'building', id: hitId };
  }

  if (ground) {
    for (const f of world.fields) {
      if (insideField(f, ground.x, ground.z)) return { kind: 'field', id: f.id };
    }
  }
  return null;
}
