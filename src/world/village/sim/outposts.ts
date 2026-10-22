// src/world/village/sim/outposts.ts — outposts: where one may stand and what it gives (pure)
//
// An outpost is a remote site (`RemoteSite`, see crew.ts and docs/village/remote-sites.md) that is not a place
// of power: a crew walks out, camps, builds it in two stages and goes home. A finished outpost then delivers
// wood (a lumber camp, near trees) or food (a fishing hut, near water) at a steady rate until the stores are
// full. Its site kind is `outpost:<kind>`, so several can exist and no landmark mistakes one for its own.

import { VILLAGE } from '../../../config/village.ts';
import type { RemoteSite } from '../model/types.ts';
import type { Forest } from './forest.ts';
import type { TerrainSampler } from './terrainSampler.ts';

const O = VILLAGE.OUTPOSTS;

export const OUTPOST_KINDS = ['lumber', 'fishing'] as const;
export type OutpostKind = (typeof OUTPOST_KINDS)[number];

const PREFIX = 'outpost:';
export const outpostSiteKind = (kind: OutpostKind): string => `${PREFIX}${kind}`;

/** The outpost kind of a remote site's `kind`, or null for a place of power. */
export function outpostOf(siteKind: string): OutpostKind | null {
  if (!siteKind.startsWith(PREFIX)) return null;
  const kind = siteKind.slice(PREFIX.length);
  return (OUTPOST_KINDS as readonly string[]).includes(kind) ? (kind as OutpostKind) : null;
}

export const outputOf = (kind: OutpostKind): 'wood' | 'food' =>
  kind === 'lumber' ? 'wood' : 'food';

/** What a finished outpost gives per second. */
export const outputPerSec = (kind: OutpostKind): number =>
  kind === 'lumber' ? O.WOOD_PER_SEC : O.FOOD_PER_SEC;

export type OutpostRefusal = 'type' | 'inside' | 'near' | 'resource';

export interface OutpostWorld {
  centerX: number;
  centerZ: number;
  radiusM: number;
  sampler: TerrainSampler;
  forest: Pick<Forest, 'nearest' | 'info'>;
  sites: readonly RemoteSite[];
}

const SHORE_RINGS = [8, 16, 24] as const;
const SHORE_ANGLES = 12;

/** Whether water lies within `RESOURCE_RADIUS_M` of a dry spot. */
function waterNear(sampler: TerrainSampler, x: number, z: number): boolean {
  for (const r of SHORE_RINGS) {
    if (r > O.RESOURCE_RADIUS_M) break;
    for (let k = 0; k < SHORE_ANGLES; k++) {
      const a = (k / SHORE_ANGLES) * Math.PI * 2;
      if (sampler.isWet(x + Math.sin(a) * r, z + Math.cos(a) * r)) return true;
    }
  }
  return false;
}

/**
 * Whether an outpost of `kind` may stand at (x, z), cheaply (no route search): beyond the village's edge,
 * apart from the others, dry ground, and the resource it works nearby. null when it may.
 */
export function outpostPlaceProblem(
  kind: string,
  x: number,
  z: number,
  w: OutpostWorld,
): OutpostRefusal | null {
  const type = (OUTPOST_KINDS as readonly string[]).includes(kind) ? (kind as OutpostKind) : null;
  if (!type) return 'type';
  if (Math.hypot(x - w.centerX, z - w.centerZ) < w.radiusM + O.MIN_OUTSIDE_M) return 'inside';
  for (const s of w.sites) {
    if (outpostOf(s.kind) && Math.hypot(x - s.x, z - s.z) < O.MIN_APART_M) return 'near';
  }
  if (w.sampler.isWet(x, z)) return 'resource';
  if (type === 'lumber') {
    const trees = w.forest.nearest(x, z, O.MIN_TREES);
    const close = trees.filter((id) => {
      const t = w.forest.info(id);
      return Math.hypot(t.x - x, t.z - z) <= O.RESOURCE_RADIUS_M;
    });
    return close.length >= O.MIN_TREES ? null : 'resource';
  }
  return waterNear(w.sampler, x, z) ? null : 'resource';
}
