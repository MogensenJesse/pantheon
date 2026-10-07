// scripts/village-sim-smoke.ts — headless run of the village sim on real map heights
// Run: node --experimental-strip-types scripts/village-sim-smoke.ts [mapId]
import { readFileSync } from 'node:fs';
import { VILLAGE } from '../src/config/village.ts';
import { buildHouseKit } from '../src/world/village/assets/placeholder/buildingKit.ts';
import { buildTempleKit } from '../src/world/village/assets/placeholder/temple.ts';
import type { VillageBuildingType } from '../src/world/village/assets/villageAssetKeys.ts';
import type { TerrainSampler } from '../src/world/village/sim/terrainSampler.ts';
import { createVillageSim, type VillageEvent } from '../src/world/village/sim/villageSim.ts';
import type { Building } from '../src/world/village/sim/villageTypes.ts';

const SIDE = 2049;
const HEIGHT_SCALE = 350;
const WATER_LEVEL_M = 14;

function loadHeights(mapId: string): Float32Array {
  const bytes = readFileSync(new URL(`../public/maps/${mapId}.height.f32`, import.meta.url));
  return new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4);
}

/** Bilinear height grid (the play mesh is planar facets on the same grid, within a facet of this). */
function createSampler(heights: Float32Array): TerrainSampler {
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
  return {
    getY,
    getNormalY: (x, z) => {
      const dx = (getY(x + 1, z) - getY(x - 1, z)) / 2;
      const dz = (getY(x, z + 1) - getY(x, z - 1)) / 2;
      return 1 / Math.hypot(dx, 1, dz);
    },
    isWater: (x, z) => getY(x, z) < WATER_LEVEL_M,
  };
}

const footprints = new Map<VillageBuildingType, readonly [number, number]>([
  ['temple', buildTempleKit().meta.footprint],
]);
for (const type of ['house_a', 'house_b', 'house_c', 'workshop', 'granary'] as const) {
  footprints.set(type, buildHouseKit(type).meta.footprint);
}
const footprintOf = (type: VillageBuildingType) => footprints.get(type) ?? [5, 4];

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

/** Separating-axis test on two oriented rectangles. */
function overlaps(a: Building, b: Building): boolean {
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

const mapId = process.argv[2] ?? 'dala';
const sampler = createSampler(loadHeights(mapId));
const seeds = [
  { name: 'old church site', x: -884, z: -274, rotY: Math.PI / 2 },
  { name: 'player start area', x: 281, z: -84, rotY: 0 },
];
const HOURS = 6;

function run(seed: (typeof seeds)[number], presence: boolean) {
  const sim = createVillageSim({
    sampler,
    footprintOf,
    seed: { x: seed.x, z: seed.z, rotY: seed.rotY, radiusM: VILLAGE.SEED.DEFAULT_RADIUS_M, id: 1 },
  });
  const events: VillageEvent[] = [];
  const timeline: string[] = [];
  let capMinutes = Number.POSITIVE_INFINITY;
  const inputs = { playerDistM: presence ? 10 : null, presenceActive: presence };
  for (let t = 1; t <= HOURS * 3600; t++) {
    sim.update(1, inputs, events);
    for (const e of events) {
      if (e.kind === 'siteStarted' && sim.buildings.length % 5 === 0) {
        timeline.push(`${(t / 60).toFixed(0)}min:${sim.buildings.length}`);
      }
    }
    events.length = 0;
    if (
      capMinutes === Number.POSITIVE_INFINITY &&
      sim.buildings.length >= VILLAGE.PLAN.MAX_BUILDINGS
    ) {
      capMinutes = t / 60;
    }
  }
  return { sim, timeline, capMinutes };
}

let failures = 0;
for (const seed of seeds) {
  const first = run(seed, false);
  const second = run(seed, false);
  const boosted = run(seed, true);
  const a = JSON.stringify(first.sim.buildings);
  const deterministic = a === JSON.stringify(second.sim.buildings);
  const { buildings } = first.sim;
  let overlapCount = 0;
  for (let i = 0; i < buildings.length; i++) {
    for (let j = i + 1; j < buildings.length; j++) {
      if (overlaps(buildings[i]!, buildings[j]!)) overlapCount++;
    }
  }
  const pads = buildings.map((b) => b.plinthTopY - b.plinthBaseY);
  const homes = buildings.filter((b) => b.type !== 'temple');
  const maxHomePad = Math.max(0, ...homes.map((b) => b.plinthTopY - b.plinthBaseY - 0.6));
  const s = first.sim.stats();
  console.log(`\n${seed.name} (${seed.x}, ${seed.z}), ${HOURS} h village time, no presence:`);
  console.log(
    `  buildings ${s.buildings} (finished ${s.finished}, open ${s.openSites})  faith left ${s.faith.toFixed(1)}  relax x${s.reliefRelax.toFixed(2)}  failed passes ${s.failedPasses}`,
  );
  console.log(
    `  pad heights: temple ${pads[0]!.toFixed(1)} m, homes max ${Math.max(0, ...homes.map((b) => b.plinthTopY - b.plinthBaseY)).toFixed(1)} m (relief limit ${VILLAGE.PLAN.MAX_RELIEF_M} m + sink/lift)`,
  );
  console.log(
    `  deterministic=${deterministic}  overlapping pairs=${overlapCount}  reaches ${VILLAGE.PLAN.MAX_BUILDINGS} buildings after ${(first.capMinutes / 60).toFixed(1)} h (full presence: ${(boosted.capMinutes / 60).toFixed(1)} h)`,
  );
  console.log(`  growth: ${first.timeline.join('  ')}`);
  if (!deterministic || overlapCount > 0) failures++;
  if (
    buildings.length > VILLAGE.PLAN.MAX_BUILDINGS ||
    boosted.sim.buildings.length > VILLAGE.PLAN.MAX_BUILDINGS
  )
    failures++;
  if (!(boosted.capMinutes < first.capMinutes)) failures++;
  if (maxHomePad > VILLAGE.PLAN.RELIEF_RELAX_CAP_M + 1) failures++;
}
console.log(
  failures === 0 ? '\nvillage sim smoke: OK' : `\nvillage sim smoke: ${failures} failure(s)`,
);
process.exit(failures === 0 ? 0 : 1);
