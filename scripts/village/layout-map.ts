// scripts/village/layout-map.ts — render a headless village to a top-down PNG
// Run: node --experimental-strip-types scripts/village/layout-map.ts <mapId> <outDir> [counts=15,30,60] [x,z,rotY]
import { mkdirSync } from 'node:fs';
import type { VillageBuildingType } from '../../src/world/village/model/assetKeys.ts';
import type { VillageSim } from '../../src/world/village/sim/villageSim.ts';
import { createVillageSim } from '../../src/world/village/sim/villageSim.ts';
import { Canvas, type Rgb } from '../lib/png.ts';
import { DAY_S, type LoadedMap, loadMap, simulate } from '../lib/villageHeadless.ts';

const HALF_M = 125;
const SCALE = 3.4;
const SIZE = Math.round(HALF_M * 2 * SCALE);

const COLORS: Record<VillageBuildingType, Rgb> = {
  temple: [0.12, 0.08, 0.08],
  house_a: [0.75, 0.3, 0.25],
  house_b: [0.85, 0.62, 0.25],
  house_c: [0.5, 0.52, 0.58],
  workshop: [0.45, 0.3, 0.2],
  granary: [0.6, 0.45, 0.25],
  well: [0.2, 0.5, 0.85],
};

function render(map: LoadedMap, sim: VillageSim, path: string): void {
  const { sampler, waterLevelM } = map;
  const cx = sim.seed.x;
  const cz = sim.seed.z;
  const canvas = new Canvas(SIZE, SIZE);
  const toPx = (x: number, z: number): [number, number] => [
    (x - cx + HALF_M) * SCALE,
    (z - cz + HALF_M) * SCALE,
  ];

  // Terrain: hillshade over green, water and wet shore in blue and sand.
  for (let py = 0; py < SIZE; py++) {
    for (let px = 0; px < SIZE; px++) {
      const x = cx - HALF_M + px / SCALE;
      const z = cz - HALF_M + py / SCALE;
      const h = sampler.getY(x, z);
      const shade = Math.min(
        1.25,
        Math.max(0.6, 0.95 + (0.9 * (sampler.getY(x - 2, z - 2) - sampler.getY(x + 2, z + 2))) / 4),
      );
      let color: Rgb = [0.42 * shade, 0.55 * shade, 0.3 * shade];
      if (h < waterLevelM) color = [0.22, 0.42, 0.62];
      else if (h < waterLevelM + 2.5) color = [0.78 * shade, 0.72 * shade, 0.52 * shade];
      canvas.blend(px, py, color, 1);
      const wear = sim.wear.sample(x, z);
      if (wear > 0.1) canvas.blend(px, py, [0.9, 0.82, 0.62], Math.min(0.9, wear * 1.1));
    }
  }

  // Ring guides.
  for (let k = 0; k < sim.rings.count; k++) {
    for (let step = 0; step < 900; step++) {
      const theta = (step / 900) * Math.PI * 2;
      const r = sim.rings.radiusAt(k, theta);
      const [px, py] = toPx(cx + Math.sin(theta) * r, cz + Math.cos(theta) * r);
      canvas.blend(px, py, [1, 1, 1], 0.35);
    }
  }

  const rect = (
    x: number,
    z: number,
    rotY: number,
    halfW: number,
    halfD: number,
    color: Rgb,
    alpha: number,
  ) => {
    const reach = Math.hypot(halfW, halfD);
    const [ax, ay] = toPx(x, z);
    const c = Math.cos(rotY);
    const s = Math.sin(rotY);
    for (let dy = -Math.ceil(reach * SCALE); dy <= Math.ceil(reach * SCALE); dy++) {
      for (let dx = -Math.ceil(reach * SCALE); dx <= Math.ceil(reach * SCALE); dx++) {
        const wx = dx / SCALE;
        const wz = dy / SCALE;
        const lx = wx * c - wz * s;
        const lz = wx * s + wz * c;
        if (Math.abs(lx) <= halfW && Math.abs(lz) <= halfD)
          canvas.blend(ax + dx, ay + dy, color, alpha);
      }
    }
  };

  for (const f of sim.fields) rect(f.x, f.z, f.rotY, f.halfW, f.halfD, [0.85, 0.78, 0.3], 0.85);
  for (const b of sim.buildings) {
    rect(b.x, b.z, b.rotY, b.halfW, b.halfD, COLORS[b.type], b.stage === 2 ? 1 : 0.55);
    // Door: a bright tick on the +Z edge.
    const [dx, dz] = map.metaOf(b.type).door;
    const c = Math.cos(b.rotY);
    const s = Math.sin(b.rotY);
    const door = (lx: number, lz: number): [number, number] =>
      toPx(b.x + lx * c + lz * s, b.z - lx * s + lz * c);
    const [x0, y0] = door(dx, dz);
    const [x1, y1] = door(dx, dz + 2.2);
    canvas.line(x0, y0, x1, y1, [1, 1, 0.2], 1);
  }
  const pool = sim.villagers;
  for (let i = 0; i < pool.count; i++) {
    if (pool.indoors[i]) continue;
    const [px, py] = toPx(pool.x[i]!, pool.z[i]!);
    canvas.disc(px, py, 1.4, [1, 1, 1], 1);
  }
  canvas.save(path);
}

const [mapId = 'island-mountain', outDir = '.', countsArg = '15,30,60', seedArg] =
  process.argv.slice(2);
const override = seedArg
  ? (() => {
      const [x, z, rotY = '0'] = seedArg.split(',');
      return { x: Number(x), z: Number(z), rotY: Number(rotY) };
    })()
  : undefined;
const map = loadMap(mapId, override);
const targets = countsArg.split(',').map(Number);
mkdirSync(outDir, { recursive: true });
const sim = createVillageSim({
  sampler: map.sampler,
  metaOf: map.metaOf,
  seed: map.seed,
  trees: map.trees,
});
let next = 0;
const tag = override ? `${mapId}-${Math.round(override.x)}_${Math.round(override.z)}` : mapId;
simulate(sim, {
  hours: 10,
  phase: (t) => (0.3 + t / DAY_S) % 1,
  vigil: false,
  presence: true,
  onStep: () => {
    if (next < targets.length && sim.buildings.length >= targets[next]!) {
      const file = `${outDir}/layout-${tag}-${targets[next]}.png`;
      render(map, sim, file);
      console.log(`wrote ${file} (${sim.buildings.length} buildings, ${sim.fields.length} fields)`);
      next++;
    }
    return next < targets.length;
  },
});
