// scripts/village/village-kit-check.ts — headless sanity check of the placeholder village kit and the villager GLB
// Run: node --experimental-strip-types scripts/village/village-kit-check.ts
import { readFileSync } from 'node:fs';
import type { BufferGeometry } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import {
  buildHouseKit,
  HOUSE_TYPES,
} from '../../src/world/village/assets/placeholder/buildingKit.ts';
import {
  buildFenceGeometry,
  buildGraveGeometry,
  buildStockpileGeometry,
} from '../../src/world/village/assets/placeholder/dressingKit.ts';
import type { LodGeometries } from '../../src/world/village/assets/placeholder/kitUtil.ts';
import { MeshBuilder } from '../../src/world/village/assets/placeholder/meshBuilder.ts';
import { buildTempleKit, buildWellKit } from '../../src/world/village/assets/placeholder/temple.ts';
import {
  buildVillagerGeometry,
  VillagerPart,
  VillagerSlot,
} from '../../src/world/village/assets/placeholder/villagerFigure.ts';
import { figureFromKit } from '../../src/world/village/assets/villagerKit.ts';
import { ROLE_COUNT, Role, type RoleId, Sex } from '../../src/world/village/model/types.ts';

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
addRow('fence', buildFenceGeometry(), [60, 40, 40]);
addRow('stockpile', buildStockpileGeometry());
addRow('grave', buildGraveGeometry());

for (const row of rows) {
  const over = row.budget && row.tris.some((t, i) => t > row.budget![i]!);
  console.log(
    `${over ? 'OVER ' : 'ok   '}${row.key.padEnd(16)} ${row.tris.join(' / ')}${row.budget ? `  (budget ${row.budget.join(' / ')})` : ''}`,
  );
  if (over) fail(`${row.key}: over triangle budget`);
}

// One figure per role and sex (the renderer draws each with its own instanced draw): the placeholders and
// the modelled kit (villagers.glb) must both carry the rig and colour-slot layout the villager shader reads.
function checkFigure(name: string, figure: BufferGeometry, role: RoleId, budget: number): number {
  const tris = triangles(figure);
  if (tris > budget) fail(`${name}: ${tris} triangles, over the budget of ${budget}`);
  const rigAttr = figure.getAttribute('aRig');
  const colorAttr = figure.getAttribute('color');
  if (rigAttr?.itemSize !== 4) fail(`${name}: aRig (pivot, part) missing`);
  if (colorAttr?.itemSize !== 4) fail(`${name}: colour alpha (slot) missing`);
  if (!rigAttr || !colorAttr) return tris;
  const parts = new Set<number>();
  for (let i = 0; i < rigAttr.count; i++) parts.add(rigAttr.getW(i));
  // Six body parts; the work roles also hold a tool (hidden unless they work), priests a staff.
  const wantsTool = role !== Role.Priest && role !== Role.Idler;
  const want = [0, 1, 2, 3, 4, 5];
  if (wantsTool) want.push(VillagerPart.Tool);
  if (role === Role.Priest) want.push(VillagerPart.Staff);
  if ([...parts].sort().join(',') !== want.join(',')) {
    fail(`${name}: rig parts ${[...parts].sort().join(',')}, want ${want.join(',')}`);
  }
  const slots = new Set<number>();
  for (let i = 0; i < colorAttr.count; i++) slots.add(Math.round(colorAttr.getW(i) * 3));
  if (!slots.has(VillagerSlot.Fixed) || [...slots].some((x) => x < 0 || x > 3))
    fail(`${name}: colour slots ${[...slots].join(',')}`);
  // WebGPU allows 8 vertex buffers: geometry attributes + iPose, iAnim, iLook (+ uv if the material reads it).
  const vertexBuffers = Object.keys(figure.attributes).length + 3 + 1;
  if (vertexBuffers > 8) fail(`${name}: needs ${vertexBuffers} vertex buffers (limit 8)`);
  figure.computeBoundingBox();
  const fb = figure.boundingBox!;
  // The tool hangs below the feet in the rest pose (it is hidden unless working), so only the body counts.
  if (wantsTool ? fb.max.y < 1.4 : fb.min.y < -1e-6 || fb.max.y < 1.4 || fb.max.y > 2) {
    fail(`${name}: height ${fb.max.y.toFixed(2)} m out of range`);
  }
  return tris;
}

const glb = readFileSync(new URL('../../public/models/village-kit/villagers.glb', import.meta.url));
const kit = (
  await new GLTFLoader().parseAsync(
    glb.buffer.slice(glb.byteOffset, glb.byteOffset + glb.byteLength) as ArrayBuffer,
    '',
  )
).scene;
for (const [label, budget] of [
  ['placeholder', 300],
  ['kit', 1200],
] as const) {
  const figureTris: number[] = [];
  for (let role = 0; role < ROLE_COUNT; role++) {
    for (const sex of [Sex.Male, Sex.Female]) {
      const name = `villager ${label} role ${role} sex ${sex}`;
      const figure =
        label === 'kit'
          ? figureFromKit(kit, role as RoleId, sex)
          : buildVillagerGeometry(role as RoleId, sex);
      if (!figure) {
        fail(`${name}: missing from villagers.glb`);
        continue;
      }
      figureTris.push(checkFigure(name, figure, role as RoleId, budget));
    }
  }
  console.log(
    `${Math.max(...figureTris) <= budget ? 'ok   ' : 'OVER '}villagers ${label.padEnd(11)} ${figureTris.length} figures, ${Math.min(...figureTris)}-${Math.max(...figureTris)} tris (budget ${budget})`,
  );
}

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
