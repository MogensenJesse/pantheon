// scripts/checks/village/sim-smoke.ts — headless run of the village sim on real map heights: growth, layout and path invariants
// Run: node --experimental-strip-types scripts/checks/village/sim-smoke.ts [mapId] [x,z,rotY]
import assert from 'node:assert/strict';
import { VILLAGE } from '../../../src/config/village.ts';
import { wrapAngle } from '../../../src/core/math/scalar.ts';
import { Anim, Mode, Role } from '../../../src/world/village/model/types.ts';
import type { VillageSim } from '../../../src/world/village/sim/villageSim.ts';
import { check, finish } from '../lib/check.ts';
import {
  buildingsOverlap,
  dayPhaseAt,
  type LoadedMap,
  loadMap,
  makeSim,
  simulate,
} from '../lib/villageHeadless.ts';

const [mapArg, seedArg] = process.argv.slice(2);
const targets: {
  mapId: string;
  seed?: { x: number; z: number; rotY: number };
  /** Hostile terrain: only robustness is checked, not the layout targets. */
  stress?: boolean;
}[] = mapArg
  ? [{ mapId: mapArg, seed: seedArg ? parseSeed(seedArg) : undefined }]
  : [
      { mapId: 'island-mountain' },
      { mapId: 'dala', seed: { x: 280, z: 540, rotY: 0 } },
      { mapId: 'dala', seed: { x: 300, z: -60, rotY: 0 }, stress: true },
    ];

function parseSeed(text: string) {
  const [x, z, rotY = '0'] = text.split(',');
  return { x: Number(x), z: Number(z), rotY: Number(rotY) };
}

const percentile = (values: number[], p: number) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] ?? 0;
};

/** Run a scenario, tracking how much of the villagers' walking stays on paths. */
function run(map: LoadedMap, hours: number, vigil: boolean) {
  const sim = makeSim(map);
  const walk = { onPath: 0, offPath: 0 };
  /** Villager-steps spent standing in each pose outdoors (hammer, hoe, chop, fish ...). */
  const poses = new Array<number>(8).fill(0);
  const lastX = new Float32Array(VILLAGE.VILLAGERS.MAX);
  const lastZ = new Float32Array(VILLAGE.VILLAGERS.MAX);
  simulate(sim, {
    hours,
    phase: vigil ? () => 0.02 : dayPhaseAt,
    vigil,
    presence: false,
    // The smoke is about layout and paths: the village is fed so it grows to full size on any terrain.
    fed: true,
    onStep: () => {
      const v = sim.villagers;
      for (let i = 0; i < v.count; i++) {
        if (v.mode[i] === Mode.Acting && !v.indoors[i]) poses[v.anim[i]!]!++;
        if (v.mode[i] === Mode.Walking && !v.indoors[i]) {
          const d = Math.hypot(v.x[i]! - lastX[i]!, v.z[i]! - lastZ[i]!);
          if (d > 0 && d < 1) {
            const onPath =
              sim.pathfinder.pathinessAt((v.x[i]! + lastX[i]!) / 2, (v.z[i]! + lastZ[i]!) / 2) >=
              VILLAGE.PATHS.ON_PATH_MIN;
            if (onPath) walk.onPath += d;
            else walk.offPath += d;
          }
        }
        lastX[i] = v.x[i]!;
        lastZ[i] = v.z[i]!;
      }
      return true;
    },
  });
  return { sim, walk, poses };
}

function layoutMetrics(sim: VillageSim) {
  const ring = sim.buildings.filter((b) => b.ring >= 0);
  const offsets = ring.map((b) => Math.abs(sim.rings.nearestRing(b.x, b.z).offset));
  const facing =
    ring.filter(
      (b) => Math.abs(wrapAngle(Math.atan2(sim.seed.x - b.x, sim.seed.z - b.z) - b.rotY)) < 0.52,
    ).length / Math.max(1, ring.length);
  // Nearest-neighbour gap variation: about 0.25 for even blue noise, 0.5 for random, above 0.7 clumped.
  const gaps = ring.map((b) =>
    Math.min(
      ...sim.buildings
        .filter((o) => o !== b)
        .map(
          (o) =>
            Math.hypot(o.x - b.x, o.z - b.z) -
            Math.hypot(o.halfW, o.halfD) -
            Math.hypot(b.halfW, b.halfD),
        ),
    ),
  );
  const meanGap = gaps.reduce((sum, g) => sum + g, 0) / gaps.length;
  const spacingCv =
    Math.sqrt(gaps.reduce((sum, g) => sum + (g - meanGap) ** 2, 0) / gaps.length) / meanGap;
  const roadClear = Math.min(
    ...ring.map((b) => sim.rings.roadDistance(b.x, b.z) - Math.max(b.halfW, b.halfD)),
  );
  return {
    medianOffset: percentile(offsets, 0.5),
    p90Offset: percentile(offsets, 0.9),
    facing,
    spacingCv,
    roadClear,
  };
}

for (const target of targets) {
  const map = loadMap(target.mapId, target.seed);
  const id = `${map.mapId}${target.stress ? ' (stress)' : ''}`;
  const day = run(map, 6, false);
  const { sim } = day;
  const s = sim.stats();
  const b = sim.buildings;
  const pool = sim.villagers;

  await check(
    `${id}: the village grows, nobody is lost or in the water, no buildings overlap`,
    () => {
      assert.ok(
        s.finished >= (target.stress ? 25 : 60),
        `only ${s.finished} finished buildings in 6 h`,
      );
      for (let i = 0; i < b.length; i++)
        for (let j = i + 1; j < b.length; j++)
          assert.ok(!buildingsOverlap(b[i]!, b[j]!), `buildings ${i}/${j} overlap`);
      for (let i = 0; i < pool.count; i++) {
        const x = pool.x[i]!;
        const z = pool.z[i]!;
        assert.ok(Number.isFinite(x) && Number.isFinite(z), `villager ${i} NaN`);
        if (!pool.indoors[i])
          assert.ok(map.sampler.getY(x, z) >= map.waterLevelM, `villager ${i} in the water`);
      }
    },
  );
  if (target.stress) continue;

  await check(
    `${id}: buildings sit on their rings, face the temple, are spaced and keep the road clear`,
    () => {
      const m = layoutMetrics(sim);
      assert.ok(m.medianOffset <= 3.5 && m.p90Offset <= 7, 'buildings stray from their rings');
      assert.ok(
        m.facing >= 0.85,
        `only ${(m.facing * 100).toFixed(0)}% of buildings face the temple`,
      );
      assert.ok(
        m.spacingCv >= 0.2 && m.spacingCv <= 0.65,
        `spacing too regular or clumped (CV ${m.spacingCv.toFixed(2)})`,
      );
      assert.ok(
        m.roadClear >= VILLAGE.RINGS.ROAD_CLEAR_M * 0.9,
        'building in the main-road corridor',
      );
    },
  );

  await check(`${id}: paths connect the village and carry most of the walking`, () => {
    const { network } = s;
    const total = day.walk.onPath + day.walk.offPath;
    const onPathShare = total > 0 ? day.walk.onPath / total : 0;
    assert.ok(
      network.connectedShare >= 0.9,
      `only ${(network.connectedShare * 100).toFixed(0)}% connected by paths`,
    );
    assert.ok(
      network.tracks <= s.fields + 8,
      `${network.tracks} searched footpaths criss-cross the rings`,
    );
    assert.ok(network.radials >= 3, `only ${network.radials} radial lanes`);
    assert.ok(
      network.arcShare >= 0.85,
      `only ${(network.arcShare * 100).toFixed(0)}% of doors sit on a ring road`,
    );
    assert.ok(
      onPathShare >= 0.55 && onPathShare <= 0.92,
      `${(onPathShare * 100).toFixed(0)}% of walking on paths (want 55-92%)`,
    );
  });

  await check(
    `${id}: fields, farmers and a well; woodcutters and fishermen work where there is wood and water`,
    () => {
      const count = (role: number) => {
        let n = 0;
        for (let i = 0; i < pool.count; i++) if (pool.role[i] === role) n++;
        return n;
      };
      const { trees, shores } = sim.workSpots;
      assert.ok(
        s.fields >= 2 && count(Role.Farmer) >= 4 && b.some((x) => x.type === 'well'),
        'fields/farmers/well missing',
      );
      if (trees.length > 0) {
        assert.ok(count(Role.Woodcutter) > 0, 'trees nearby but no woodcutters');
        assert.ok(day.poses[Anim.Chop]! > 0, 'woodcutters never chop');
      }
      if (shores.length > 0) {
        assert.ok(count(Role.Fisherman) > 0, 'a shore nearby but no fishermen');
        assert.ok(day.poses[Anim.Fish]! > 0, 'fishermen never fish');
      }
    },
  );

  await check(`${id}: growth does not stall in the vigil phase`, () => {
    const vigil = run(map, 3, true).sim.stats();
    assert.ok(vigil.finished >= 8, `vigil growth stalled (${vigil.finished} finished)`);
  });
}

finish('village sim smoke: OK');
