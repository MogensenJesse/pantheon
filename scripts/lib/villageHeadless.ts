// scripts/lib/villageHeadless.ts — shared helpers for headless village runs (smoke test, layout renderer)
import { existsSync, readFileSync } from 'node:fs';
import { VILLAGE } from '../../src/config/village.ts';
import { buildHouseKit } from '../../src/world/village/assets/placeholder/buildingKit.ts';
import { buildTempleKit, buildWellKit } from '../../src/world/village/assets/placeholder/temple.ts';
import type { VillageBuildingType } from '../../src/world/village/model/assetKeys.ts';
import { makeVillageSeed, type VillageSeed } from '../../src/world/village/model/seed.ts';
import type { Building, VillageEvent } from '../../src/world/village/model/types.ts';
import type { TreeInfo } from '../../src/world/village/sim/forest.ts';
import type { TerrainSampler } from '../../src/world/village/sim/terrainSampler.ts';
import {
  createVillageSim,
  type VillageSim,
  type VillageSimState,
} from '../../src/world/village/sim/villageSim.ts';

const SIDE = 2049;
const HEIGHT_SCALE = 350;
export const DAY_S = 1800;

export interface LoadedMap {
  mapId: string;
  heights: Float32Array;
  sampler: TerrainSampler;
  waterLevelM: number;
  seed: VillageSeed;
  /** The map's trees (woodcutters chop the ones near the village). */
  trees: TreeInfo[];
  metaOf: (type: VillageBuildingType) => ReturnType<typeof buildTempleKit>['meta'];
}

/** A village sim on a loaded map (the sandbox village unless `mode` says 'hamlet'). */
export function makeSim(
  map: LoadedMap,
  opts: { mode?: 'hamlet' | 'sandbox'; restore?: VillageSimState } = {},
): VillageSim {
  return createVillageSim({
    sampler: map.sampler,
    metaOf: map.metaOf,
    seed: map.seed,
    trees: map.trees,
    ...opts,
  });
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
    ['temple', kitMeta('temple') ?? buildTempleKit().meta],
    ['well', kitMeta('well_s2') ?? buildWellKit().meta],
  ]);
  for (const type of ['house_a', 'house_b', 'house_c', 'workshop', 'granary'] as const) {
    metas.set(type, kitMeta(`${type}_s2`) ?? buildHouseKit(type).meta);
  }

  const src = seedOverride ?? entity;
  const seed = makeVillageSeed({
    x: src.x,
    z: src.z,
    rotY: src.rotY,
    radiusM: entity?.radiusM,
    seed: entity?.seed,
  });
  // Keep the key pattern in sync with ASSET_MANIFEST.trees (the manifest is not importable in node).
  const trees = json.entities
    .filter(
      (e: { type: string; key?: string }) =>
        e.type === 'prop' && /^(fir|pine|birch)_/.test(e.key ?? ''),
    )
    .map(({ x, z, key, scale }: TreeInfo) => ({ x, z, key, scale }));
  return { mapId, heights, sampler, waterLevelM, seed, trees, metaOf: (type) => metas.get(type)! };
}

/** Metadata from a baked kit GLB's extras (the game reads the same), or null when there is no such file. */
function kitMeta(file: string): ReturnType<typeof buildTempleKit>['meta'] | null {
  const url = new URL(`../../public/models/village-kit/${file}.glb`, import.meta.url);
  if (!existsSync(url)) return null;
  const glb = readFileSync(url);
  const json = JSON.parse(glb.subarray(20, 20 + glb.readUInt32LE(12)).toString('utf8'));
  const extras = json.nodes.find(
    (n: { extras?: { footprint?: unknown } }) => n.extras?.footprint,
  )?.extras;
  if (!extras) throw new Error(`${file}.glb: no node carries extras.footprint`);
  return { footprint: extras.footprint, door: extras.door, workSlots: extras.workSlots, height: 0 };
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
  /**
   * Keep the wood and food stores full, as if the village were hand-fed: for layout and path checks that
   * need a village to grow to its full size whatever its terrain offers (the economy has its own checks).
   */
  fed?: boolean;
  /** Called after every step; return false to stop early. */
  onStep?: (t: number) => boolean | undefined;
}

export function simulate(sim: VillageSim, opts: SimulateOptions): void {
  const dt = opts.dt ?? 0.1;
  const events: VillageEvent[] = [];
  const steps = Math.round((opts.hours * 3600) / dt);
  for (let k = 0; k < steps; k++) {
    const t = k * dt;
    if (opts.fed) {
      sim.economy.addWood(Number.POSITIVE_INFINITY);
      sim.economy.addFood(Number.POSITIVE_INFINITY);
    }
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
