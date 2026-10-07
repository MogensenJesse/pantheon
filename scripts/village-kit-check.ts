// scripts/village-kit-check.ts — headless sanity check of the placeholder village kit
// Run: node --experimental-strip-types scripts/village-kit-check.ts
import type { BufferGeometry } from 'three';
import {
  buildHouseKit,
  HOUSE_TYPES,
  type LodGeometries,
} from '../src/world/village/assets/placeholder/buildingKit.ts';
import {
  buildCropGeometry,
  buildFenceGeometry,
  buildPlinthGeometry,
  buildStepsGeometry,
  buildStockpileGeometry,
} from '../src/world/village/assets/placeholder/dressingKit.ts';
import { MeshBuilder } from '../src/world/village/assets/placeholder/meshBuilder.ts';
import { buildTempleKit, buildWellKit } from '../src/world/village/assets/placeholder/temple.ts';
import {
  buildVillagerGeometry,
  VillagerPart,
} from '../src/world/village/assets/placeholder/villagerFigure.ts';

let failures = 0;
const fail = (msg: string) => {
  failures++;
  console.error(`FAIL ${msg}`);
};

function triangles(g: BufferGeometry): number {
  return g.getAttribute('position').count / 3;
}

/** Convex solid: every face normal must point away from the vertex centroid. */
function checkOutward(name: string, g: BufferGeometry): void {
  const p = g.getAttribute('position');
  const n = g.getAttribute('normal');
  let cx = 0;
  let cy = 0;
  let cz = 0;
  for (let i = 0; i < p.count; i++) {
    cx += p.getX(i);
    cy += p.getY(i);
    cz += p.getZ(i);
  }
  cx /= p.count;
  cy /= p.count;
  cz /= p.count;
  let bad = 0;
  for (let t = 0; t < p.count; t += 3) {
    const mx = (p.getX(t) + p.getX(t + 1) + p.getX(t + 2)) / 3 - cx;
    const my = (p.getY(t) + p.getY(t + 1) + p.getY(t + 2)) / 3 - cy;
    const mz = (p.getZ(t) + p.getZ(t + 1) + p.getZ(t + 2)) / 3 - cz;
    if (mx * n.getX(t) + my * n.getY(t) + mz * n.getZ(t) <= 0) bad++;
  }
  if (bad > 0) fail(`${name}: ${bad} inward-facing triangles`);
}

const solids: Record<string, () => MeshBuilder> = {
  rotatedBox: () => new MeshBuilder(),
  box: () => new MeshBuilder().box(1, 2, 3, 2, 3, 4, [1, 1, 1]),
  beamDiagonal: () => new MeshBuilder().beam([0, 0, 0], [3, 2, -1], 0.3, [1, 1, 1]),
  beamVertical: () => new MeshBuilder().beam([1, 0, 1], [1, 3, 1], 0.3, [1, 1, 1]),
  gableRoof: () => new MeshBuilder().gableRoof(0, 2, 0, 5, 4, 1.5, 0.4, [1, 1, 1]),
  pyramid: () => new MeshBuilder().pyramid(0, 0, 0, 3, 3, 2, [1, 1, 1]),
  cylinder: () => new MeshBuilder().cylinder(0, 0, 0, 1, 1, 10, [1, 1, 1]),
  cone: () => new MeshBuilder().cone(0, 0, 0, 1, 2, 8, [1, 1, 1]),
};
solids.rotatedBox = () => {
  const b = new MeshBuilder();
  b.within(2, 1, -1, 0.9, () => b.box(0.5, 0, 0.5, 2, 3, 4, [1, 1, 1]));
  return b;
};
for (const [name, make] of Object.entries(solids)) checkOutward(name, make().build());

interface Row {
  key: string;
  tris: [number, number, number];
  budget?: [number, number, number];
}
const rows: Row[] = [];
const addRow = (key: string, lods: LodGeometries, budget?: [number, number, number]) =>
  rows.push({ key, tris: [triangles(lods[0]), triangles(lods[1]), triangles(lods[2])], budget });

for (const type of HOUSE_TYPES) {
  const kit = buildHouseKit(type);
  kit.stages.forEach((lods, stage) => {
    addRow(`${type}_s${stage}`, lods, stage === 2 ? [800, 300, 40] : [800, 400, 120]);
  });
  const [w, d] = kit.meta.footprint;
  kit.stages[2][0].computeBoundingBox();
  const box = kit.stages[2][0].boundingBox!;
  if (box.min.y < -1e-6) fail(`${type}: geometry below the floor (${box.min.y})`);
  if (Math.abs(box.max.x) > w / 2 + 1 || Math.abs(box.max.z) > d / 2 + 1)
    fail(`${type}: bounds exceed footprint`);
  console.log(
    `${type}: footprint ${w}x${d} height ${kit.meta.height.toFixed(2)} bboxY ${box.max.y.toFixed(2)}`,
  );
}
const temple = buildTempleKit();
addRow('temple', temple.geometries, [1500, 600, 80]);
const well = buildWellKit();
addRow('well', well.geometries, [200, 120, 80]);
addRow('plinth', buildPlinthGeometry());
addRow('steps', buildStepsGeometry());
addRow('fence', buildFenceGeometry(), [60, 40, 40]);
addRow('crop_a', buildCropGeometry(0), [40, 40, 40]);
addRow('crop_b', buildCropGeometry(1), [40, 40, 40]);
addRow('stockpile', buildStockpileGeometry());

for (const row of rows) {
  const over = row.budget && row.tris.some((t, i) => t > row.budget![i]!);
  console.log(
    `${over ? 'OVER ' : 'ok   '}${row.key.padEnd(16)} ${row.tris.join(' / ')}${row.budget ? `  (budget ${row.budget.join(' / ')})` : ''}`,
  );
  if (over) fail(`${row.key}: over triangle budget`);
}

const figure = buildVillagerGeometry();
const figureTris = triangles(figure);
const parts = new Set<number>();
const partAttr = figure.getAttribute('aRig');
for (let i = 0; i < partAttr.count; i++) parts.add(partAttr.getW(i));
console.log(
  `${figureTris <= 300 ? 'ok   ' : 'OVER '}villager         ${figureTris} tris, parts ${[...parts].sort().join(',')}`,
);
if (figureTris > 300) fail('villager over triangle budget');
if (parts.size !== Object.keys(VillagerPart).length) fail('villager is missing rig parts');
if (figure.getAttribute('aRig')?.itemSize !== 4) fail('villager aRig (pivot, part) missing');
if (figure.getAttribute('color')?.itemSize !== 4) fail('villager colour alpha (tint flag) missing');
const tints = new Set<number>();
const colorAttr = figure.getAttribute('color');
for (let i = 0; i < colorAttr.count; i++) tints.add(colorAttr.getW(i));
if (!tints.has(0) || !tints.has(1)) fail('villager has no tinted or no untinted vertices');
// WebGPU allows 8 vertex buffers: geometry attributes + iPose, iAnim, iLook (+ uv if the material reads it).
const vertexBuffers = Object.keys(figure.attributes).length + 3 + 1;
console.log(`  villager vertex buffers (worst case, with uv): ${vertexBuffers}/8`);
if (vertexBuffers > 8) fail(`villager needs ${vertexBuffers} vertex buffers (limit 8)`);
figure.computeBoundingBox();
const fb = figure.boundingBox!;
console.log(`  villager height ${fb.max.y.toFixed(2)} m, min y ${fb.min.y.toFixed(2)}`);
if (fb.min.y < -1e-6 || fb.max.y < 1.4 || fb.max.y > 2) fail('villager height out of range');

for (const lods of [temple.geometries, well.geometries]) {
  for (const g of lods) {
    const a = g.getAttribute('normal');
    for (let i = 0; i < a.count; i++) {
      if (Math.abs(Math.hypot(a.getX(i), a.getY(i), a.getZ(i)) - 1) > 1e-4) {
        fail('non-unit normal');
        break;
      }
    }
  }
}

console.log(failures === 0 ? 'village kit check: OK' : `village kit check: ${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);
