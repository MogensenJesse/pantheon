// scripts/checks/village/village-kit-check.ts — headless checks of the house kit metadata and the villagers.glb rig and colour slots
// Run: node --experimental-strip-types scripts/checks/village/village-kit-check.ts
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { BufferGeometry } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import {
  buildHouseKit,
  HOUSE_TYPES,
} from '../../../src/world/village/assets/placeholder/buildingKit.ts';
import {
  VillagerPart,
  VillagerSlot,
} from '../../../src/world/village/assets/placeholder/villagerFigure.ts';
import { figureFromKit } from '../../../src/world/village/assets/villagerKit.ts';
import { PLOT_TYPES } from '../../../src/world/village/model/buildings.ts';
import { ROLE_COUNT, Role, type RoleId, Sex } from '../../../src/world/village/model/types.ts';
import { check, finish } from '../lib/check.ts';

await check('every plot the player can mark has a kit', () => {
  for (const type of PLOT_TYPES) assert.ok(HOUSE_TYPES.includes(type as never), `${type} kit`);
});

for (const type of HOUSE_TYPES) {
  await check(`house kit ${type}: footprint, door and work slots agree with the geometry`, () => {
    const { stages, meta } = buildHouseKit(type);
    const [w, d] = meta.footprint;
    const finished = stages[2][0];
    finished.computeBoundingBox();
    const box = finished.boundingBox!;
    assert.ok(box.min.y >= -1e-6, `geometry below the floor (${box.min.y})`);
    assert.ok(
      Math.abs(box.max.x) <= w / 2 + 1 && Math.abs(box.max.z) <= d / 2 + 1,
      'bounds exceed footprint',
    );
    assert.ok(meta.height >= box.max.y - 1e-6, `height ${meta.height} below the roof ${box.max.y}`);
    assert.ok(Math.abs(meta.door[0]) <= w / 2, 'door outside the front wall');
    assert.equal(meta.door[1], d / 2, 'door is on the front edge');
    for (const [x, z] of meta.workSlots)
      assert.ok(Math.abs(x) > w / 2 || Math.abs(z) > d / 2, `work slot ${x},${z} inside the walls`);
  });
}

// The modelled kit (villagers.glb) must carry the rig and colour-slot layout the villager shader reads,
// one figure per role and sex (the renderer draws each with its own instanced draw).
function checkFigure(figure: BufferGeometry, role: RoleId): void {
  const rigAttr = figure.getAttribute('aRig');
  const colorAttr = figure.getAttribute('color');
  assert.equal(rigAttr?.itemSize, 4, 'aRig (pivot, part) missing');
  assert.equal(colorAttr?.itemSize, 4, 'colour alpha (slot) missing');
  const parts = new Set<number>();
  for (let i = 0; i < rigAttr!.count; i++) parts.add(rigAttr!.getW(i));
  // Six body parts; the work roles also hold a tool (hidden unless they work), priests a staff.
  const wantsTool = role !== Role.Priest && role !== Role.Idler;
  const want = [0, 1, 2, 3, 4, 5];
  if (wantsTool) want.push(VillagerPart.Tool);
  if (role === Role.Priest) want.push(VillagerPart.Staff);
  assert.equal([...parts].sort().join(','), want.join(','), 'rig parts');
  const slots = new Set<number>();
  for (let i = 0; i < colorAttr!.count; i++) slots.add(Math.round(colorAttr!.getW(i) * 3));
  assert.ok(
    slots.has(VillagerSlot.Fixed) && [...slots].every((x) => x >= 0 && x <= 3),
    `colour slots ${[...slots].join(',')}`,
  );
  // WebGPU allows 8 vertex buffers: geometry attributes + iPose, iAnim, iLook (+ uv if the material reads it).
  const vertexBuffers = Object.keys(figure.attributes).length + 3 + 1;
  assert.ok(vertexBuffers <= 8, `needs ${vertexBuffers} vertex buffers (limit 8)`);
  figure.computeBoundingBox();
  const fb = figure.boundingBox!;
  // The tool hangs below the feet in the rest pose (it is hidden unless working), so only the body counts.
  const heightOk = wantsTool
    ? fb.max.y >= 1.4
    : fb.min.y >= -1e-6 && fb.max.y >= 1.4 && fb.max.y <= 2;
  assert.ok(heightOk, `height ${fb.max.y.toFixed(2)} m out of range`);
}

await check('villagers.glb: every role and sex has the rig and colour-slot layout', async () => {
  const glb = readFileSync(
    new URL('../../../public/models/village-kit/villagers.glb', import.meta.url),
  );
  const kit = (
    await new GLTFLoader().parseAsync(
      glb.buffer.slice(glb.byteOffset, glb.byteOffset + glb.byteLength) as ArrayBuffer,
      '',
    )
  ).scene;
  for (let role = 0; role < ROLE_COUNT; role++) {
    for (const sex of [Sex.Male, Sex.Female]) {
      const figure = figureFromKit(kit, role as RoleId, sex);
      assert.ok(figure, `role ${role} sex ${sex}: missing from villagers.glb`);
      try {
        checkFigure(figure, role as RoleId);
      } catch (err) {
        throw new Error(`role ${role} sex ${sex}: ${(err as Error).message}`);
      }
    }
  }
});

finish('village kit check: OK');
