// scripts/lib/villageHeadless.ts — shared helpers for headless village runs (smoke test, layout renderer)
import { readFileSync } from 'node:fs';
import { VILLAGE } from '../../src/config/village.ts';
import { buildHouseKit } from '../../src/world/village/assets/placeholder/buildingKit.ts';
import { buildTempleKit, buildWellKit } from '../../src/world/village/assets/placeholder/temple.ts';
import type { VillageBuildingType } from '../../src/world/village/assets/villageAssetKeys.ts';
import { makeVillageSeed, type VillageSeed } from '../../src/world/village/model/seed.ts';
import type { TerrainSampler } from '../../src/world/village/sim/terrainSampler.ts';
import type { VillageEvent, VillageSim } from '../../src/world/village/sim/villageSim.ts';
import type { Building } from '../../src/world/village/sim/villageTypes.ts';

const SIDE = 2049;
const HEIGHT_SCALE = 350;
export const DAY_S = 1800;

export interface LoadedMap {
  mapId: string;
  heights: Float32Array;
  sampler: TerrainSampler;
  waterLevelM: number;
  seed: VillageSeed;
  metaOf: (type: VillageBuildingType) => ReturnType<typeof buildTempleKit>['meta'];
}

/** Load a map's heights and its authored village seed (or `seedOverride` for maps without one). */
export function loadMap(
  mapId: string,
  seedOverride?: { x: number; z: number; rotY?: number },
): LoadedMap {
  const json = JSON.parse(
    readFileSync(new URL(`../../public/maps/${mapId}.json`, import.meta.url), 'utf8'),
  );
  const bytes = readFileSync(new URL(`../../public/maps/${mapId}.height.f32`, import.meta.url));
  const heights = new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4);
  const waterLevelM: number = json.water?.levelM ?? 14;
  const entity = json.entities.find((e: { type: string }) => e.type === 'villageSeed');
  if (!entity && !seedOverride)
    throw new Error(`${mapId} has no villageSeed; pass a seed override`);

  const at = (ix: number, iz: number) =>
    heights[Math.min(SIDE - 1, Math.max(0, iz)) * SIDE + Math.min(SIDE - 1, Math.max(0, ix))]! *
    HEIGHT_SCALE;
  const getY = (x: number, z: number) => {
    const gx = x + 1024;
    const gz = z + 1024;
    const ix = Math.floor(gx);
    const iz = Math.floor(gz);
    const fx = gx - ix;
    const fz = gz - iz;
    return (
      at(ix, iz) * (1 - fx) * (1 - fz) +
      at(ix + 1, iz) * fx * (1 - fz) +
      at(ix, iz + 1) * (1 - fx) * fz +
      at(ix + 1, iz + 1) * fx * fz
    );
  };
  const sampler: TerrainSampler = {
    getY,
    getNormalY: (x, z) => {
      const dx = (getY(x + 1, z) - getY(x - 1, z)) / 2;
      const dz = (getY(x, z + 1) - getY(x, z - 1)) / 2;
      return 1 / Math.hypot(dx, 1, dz);
    },
    isWet: (x, z) => getY(x, z) < waterLevelM + VILLAGE.PLAN.SHORE_MARGIN_M,
  };

  const metas = new Map<VillageBuildingType, ReturnType<typeof buildTempleKit>['meta']>([
    ['temple', buildTempleKit().meta],
    ['well', buildWellKit().meta],
  ]);
  for (const type of ['house_a', 'house_b', 'house_c', 'workshop', 'granary'] as const) {
    metas.set(type, buildHouseKit(type).meta);
  }

  const src = seedOverride ?? entity;
  const seed = makeVillageSeed({
    x: src.x,
    z: src.z,
    rotY: src.rotY,
    radiusM: entity?.radiusM,
    seed: entity?.seed,
  });
  return { mapId, heights, sampler, waterLevelM, seed, metaOf: (type) => metas.get(type)! };
}

function corners(b: Building): [number, number][] {
  const c = Math.cos(b.rotY);
  const s = Math.sin(b.rotY);
  return [
    [-b.halfW, -b.halfD],
    [b.halfW, -b.halfD],
    [b.halfW, b.halfD],
    [-b.halfW, b.halfD],
  ].map(([lx, lz]) => [b.x + lx! * c + lz! * s, b.z - lx! * s + lz! * c] as [number, number]);
}

/** Separating-axis test on two oriented footprints. */
export function buildingsOverlap(a: Building, b: Building): boolean {
  const ca = corners(a);
  const cb = corners(b);
  for (const r of [a, b]) {
    for (const axis of [
      [Math.cos(r.rotY), -Math.sin(r.rotY)],
      [Math.sin(r.rotY), Math.cos(r.rotY)],
    ] as const) {
      const project = (cs: [number, number][]) => cs.map(([x, z]) => x * axis[0] + z * axis[1]);
      const pa = project(ca);
      const pb = project(cb);
      if (Math.max(...pa) < Math.min(...pb) || Math.max(...pb) < Math.min(...pa)) return false;
    }
  }
  return true;
}

export interface SimulateOptions {
  hours: number;
  dt?: number;
  /** Day-cycle phase at village time t (s). */
  phase: (t: number) => number;
  vigil: boolean;
  presence: boolean;
  /** Called after every step; return false to stop early. */
  onStep?: (t: number) => boolean | undefined;
}

export function simulate(sim: VillageSim, opts: SimulateOptions): void {
  const dt = opts.dt ?? 0.1;
  const events: VillageEvent[] = [];
  const steps = Math.round((opts.hours * 3600) / dt);
  for (let k = 0; k < steps; k++) {
    const t = k * dt;
    sim.beginStep();
    sim.update(
      dt,
      {
        playerDistM: opts.presence ? 10 : null,
        presenceActive: opts.presence,
        dayPhase: opts.phase(t),
        vigil: opts.vigil,
      },
      events,
    );
    events.length = 0;
    if (opts.onStep?.(t) === false) return;
  }
}
