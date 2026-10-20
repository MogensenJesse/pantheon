// scripts/village/sim-smoke.ts — headless run of the village sim on real map heights, with layout metrics
// Run: node --experimental-strip-types scripts/village/sim-smoke.ts [mapId] [x,z,rotY]
import { createHash } from 'node:crypto';
import { VILLAGE } from '../../src/config/village.ts';
import {
  Activity,
  Anim,
  Mode,
  ROLE_COUNT,
  Role,
  Sex,
} from '../../src/world/village/model/types.ts';
import { wrapAngle } from '../../src/world/village/sim/geometry.ts';
import type { VillageSim } from '../../src/world/village/sim/villageSim.ts';
import {
  buildingsOverlap,
  DAY_S,
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

/**
 * Stable fingerprint of the whole sim state (buildings, fields, villagers, wear, laid-path stats).
 * Behaviour-preserving refactors must leave it unchanged.
 */
function stateHash(sim: VillageSim): string {
  const v = sim.villagers;
  const hash = createHash('sha1');
  hash.update(JSON.stringify([sim.buildings, sim.fields, sim.network.stats()]));
  for (const array of [v.x, v.z, v.yaw, v.role, v.home, v.activity, v.mode, v.target]) {
    hash.update(Buffer.from(array.buffer, array.byteOffset, v.count * array.BYTES_PER_ELEMENT));
  }
  hash.update(
    Buffer.from(sim.wear.data.buffer, sim.wear.data.byteOffset, sim.wear.data.byteLength),
  );
  return hash.digest('hex').slice(0, 12);
}

let failures = 0;
const fail = (msg: string) => {
  failures++;
  console.error(`FAIL ${msg}`);
};
const percentile = (values: number[], p: number) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] ?? 0;
};

const ACTIVITY_NAMES = ['sleep', 'pray', 'work', 'wander', 'eat', 'shelter', 'mourn'];

interface WalkStats {
  onPath: number;
  offPath: number;
}

/** Run a scenario, tracking how much of the villagers' walking stays on paths. */
function run(map: LoadedMap, hours: number, vigil: boolean, presence: boolean) {
  const sim = makeSim(map);
  const walk: WalkStats = { onPath: 0, offPath: 0 };
  /** Villager-steps spent standing in each pose outdoors (hammer, hoe, chop, fish ...). */
  const poses = new Array<number>(8).fill(0);
  /** Villager-steps per hour of the day (phase x 24) and activity, for the day's shape. */
  const byHour = Array.from({ length: 24 }, () => new Array<number>(ACTIVITY_NAMES.length).fill(0));
  const lastX = new Float32Array(VILLAGE.VILLAGERS.MAX);
  const lastZ = new Float32Array(VILLAGE.VILLAGERS.MAX);
  const t0 = performance.now();
  simulate(sim, {
    hours,
    phase: vigil ? () => 0.02 : (t) => (0.3 + t / DAY_S) % 1,
    vigil,
    presence,
    // The smoke is about layout and paths: the village is fed so it grows to full size on any terrain.
    fed: true,
    onStep: (t) => {
      const v = sim.villagers;
      const hour = Math.floor((vigil ? 0.02 : (0.3 + t / DAY_S) % 1) * 24);
      for (let i = 0; i < v.count; i++) {
        byHour[hour]![v.activity[i]!]!++;
        if (v.mode[i] === Mode.Acting && !v.indoors[i]) poses[v.anim[i]!]!++;
        if (v.mode[i] === Mode.Walking && !v.indoors[i]) {
          const d = Math.hypot(v.x[i]! - lastX[i]!, v.z[i]! - lastZ[i]!);
          if (d > 0 && d < 1) {
            const onPath =
              sim.pathfinder.pathinessAt((v.x[i]! + lastX[i]!) / 2, (v.z[i]! + lastZ[i]!) / 2) >=
              0.5;
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
  return { sim, walk, poses, byHour, ms: performance.now() - t0 };
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
    count: ring.length,
    medianOffset: percentile(offsets, 0.5),
    p90Offset: percentile(offsets, 0.9),
    facing,
    spacingCv,
    meanGap,
    roadClear,
  };
}

for (const target of targets) {
  const map = loadMap(target.mapId, target.seed);
  console.log(
    `\n=== ${map.mapId}: seed (${map.seed.x.toFixed(0)}, ${map.seed.z.toFixed(0)}) yaw ${map.seed.rotY.toFixed(2)}, water ${map.waterLevelM} m`,
  );

  const day = run(map, 6, false, false);
  const { sim } = day;
  const s = sim.stats();
  const m = layoutMetrics(sim);
  const total = day.walk.onPath + day.walk.offPath;
  const onPathShare = total > 0 ? day.walk.onPath / total : 0;
  console.log(
    `daily cycle 6 h (${(day.ms / 1000).toFixed(1)} s CPU): buildings ${s.buildings} (finished ${s.finished}), villagers ${s.villagers}/${s.beds}, fields ${s.fields}, rings ${s.ringCounts.join('/')}`,
  );
  console.log(
    `  rings: ${m.count} buildings, offset median ${m.medianOffset.toFixed(1)} m p90 ${m.p90Offset.toFixed(1)} m, facing temple ${(m.facing * 100).toFixed(0)}%, neighbour gap ${m.meanGap.toFixed(1)} m (CV ${m.spacingCv.toFixed(2)}), road clearance ${m.roadClear.toFixed(1)} m`,
  );
  console.log(
    `  paths: ${s.network.links} links, ${s.network.radials} radial lanes, ${s.network.tracks} searched tracks, connected ${(s.network.connectedShare * 100).toFixed(0)}%, on a ring road ${(s.network.arcShare * 100).toFixed(0)}%, skipped ${s.network.skipped}; walking on paths ${(onPathShare * 100).toFixed(0)}% of ${total.toFixed(0)} m`,
  );

  if (target.stress) {
    if (s.finished < 25) fail(`${map.mapId}: stress seed built only ${s.finished} buildings`);
  } else {
    if (s.finished < 60) fail(`${map.mapId}: only ${s.finished} finished buildings in 6 h`);
    if (m.medianOffset > 3.5 || m.p90Offset > 7)
      fail(`${map.mapId}: buildings stray from their rings`);
    if (m.facing < 0.85)
      fail(`${map.mapId}: only ${(m.facing * 100).toFixed(0)}% of buildings face the temple`);
    if (!(m.spacingCv >= 0.2 && m.spacingCv <= 0.65))
      fail(`${map.mapId}: spacing too regular or clumped (CV ${m.spacingCv.toFixed(2)})`);
    if (m.roadClear < VILLAGE.RINGS.ROAD_CLEAR_M * 0.9)
      fail(`${map.mapId}: building in the main-road corridor`);
    if (s.network.connectedShare < 0.9)
      fail(`${map.mapId}: only ${(s.network.connectedShare * 100).toFixed(0)}% connected by paths`);
    if (s.network.tracks > s.fields + 8)
      fail(`${map.mapId}: ${s.network.tracks} searched footpaths criss-cross the rings`);
    if (s.network.radials < 3) fail(`${map.mapId}: only ${s.network.radials} radial lanes`);
    if (s.network.arcShare < 0.85)
      fail(
        `${map.mapId}: only ${(s.network.arcShare * 100).toFixed(0)}% of doors sit on a ring road`,
      );
    if (!(onPathShare >= 0.55 && onPathShare <= 0.92))
      fail(`${map.mapId}: ${(onPathShare * 100).toFixed(0)}% of walking on paths (want 55-92%)`);
  }

  const b = sim.buildings;
  for (let i = 0; i < b.length; i++) {
    for (let j = i + 1; j < b.length; j++)
      if (buildingsOverlap(b[i]!, b[j]!)) fail(`${map.mapId}: buildings ${i}/${j} overlap`);
  }
  const pool = sim.villagers;
  for (let i = 0; i < pool.count; i++) {
    const x = pool.x[i]!;
    const z = pool.z[i]!;
    if (!Number.isFinite(x) || !Number.isFinite(z)) fail(`${map.mapId}: villager ${i} NaN`);
    else if (!pool.indoors[i] && map.sampler.getY(x, z) < map.waterLevelM)
      fail(`${map.mapId}: villager ${i} in the water`);
  }
  const roles = new Array<number>(ROLE_COUNT).fill(0);
  let women = 0;
  for (let i = 0; i < pool.count; i++) {
    roles[pool.role[i]!]!++;
    if (pool.sex[i] === Sex.Female) women++;
  }
  const farmers = roles[Role.Farmer]!;
  if (!target.stress && (s.fields < 2 || farmers < 4 || !b.some((x) => x.type === 'well')))
    fail(`${map.mapId}: fields/farmers/well missing`);
  const { trees, shores } = sim.workSpots;
  const [builders, priests, idlers, , woodcutters, fishermen] = roles;
  console.log(
    `  people: ${builders} builders, ${farmers} farmers, ${woodcutters} woodcutters, ${fishermen} fishermen, ${priests} priests, ${idlers} idlers, ${women}/${pool.count} women; workplaces: ${trees.length} trees, ${shores.length} shore spots`,
  );
  const { poses } = day;
  console.log(
    `  working poses (villager-steps): hammer ${poses[Anim.Work]}, hoe ${poses[Anim.Hoe]}, chop ${poses[Anim.Chop]}, fish ${poses[Anim.Fish]}`,
  );
  // The day's shape: the share of villager-time in each activity, by hour of the day (0 midnight).
  console.log(
    `  day by hour (% of people): ${ACTIVITY_NAMES.map((n) => n.slice(0, 5).padEnd(5)).join(' ')}`,
  );
  for (let h = 0; h < 24; h++) {
    const row = day.byHour[h]!;
    const total = row.reduce((a, b) => a + b, 0) || 1;
    if (h % 2 === 0 || (h >= 10 && h <= 12) || (h >= 16 && h <= 18)) {
      console.log(
        `    ${String(h).padStart(2)} h               ${row.map((n) => `${Math.round((100 * n) / total)}`.padStart(5)).join(' ')}`,
      );
    }
  }
  if (!target.stress) {
    const share = (hours: number[], activity: number) => {
      let n = 0;
      let all = 0;
      for (const h of hours) {
        n += day.byHour[h]![activity]!;
        all += day.byHour[h]!.reduce((a, b) => a + b, 0);
      }
      return n / Math.max(1, all);
    };
    if (share([10, 11], Activity.Eat) < 0.05) fail(`${map.mapId}: nobody goes to the midday meal`);
    if (share([16, 17], Activity.Eat) < 0.03) fail(`${map.mapId}: nobody goes to the evening meal`);
    if (share([7, 8, 9], Activity.Work) < 0.15) fail(`${map.mapId}: nobody works in the morning`);
    if (share([2, 3], Activity.Sleep) < 0.9) fail(`${map.mapId}: the village is awake at night`);
    if (trees.length > 0 && woodcutters === 0)
      fail(`${map.mapId}: trees nearby but no woodcutters`);
    if (shores.length > 0 && fishermen === 0) fail(`${map.mapId}: a shore nearby but no fishermen`);
    if (woodcutters > 0 && poses[Anim.Chop]! === 0) fail(`${map.mapId}: woodcutters never chop`);
    if (fishermen > 0 && poses[Anim.Fish]! === 0) fail(`${map.mapId}: fishermen never fish`);
    if (women < pool.count * 0.3 || women > pool.count * 0.7) fail(`${map.mapId}: lopsided sexes`);
  }

  const again = run(map, 6, false, false).sim;
  const snap = (v: VillageSim) =>
    JSON.stringify([v.buildings, Array.from(v.villagers.x.slice(0, v.villagers.count))]);
  const same = snap(sim) === snap(again);
  console.log(`  deterministic=${same} state=${stateHash(sim)}`);
  if (!same) fail(`${map.mapId}: not deterministic`);

  const vigil = run(map, 3, true, false).sim.stats();
  console.log(
    `Phase 0 vigil 3 h: buildings ${vigil.buildings} (finished ${vigil.finished}), villagers ${vigil.villagers}`,
  );
  if (vigil.finished < 8) fail(`${map.mapId}: vigil growth stalled (${vigil.finished} finished)`);

  const fast = run(map, 6, false, true).sim.stats();
  console.log(`full presence 6 h: buildings ${fast.buildings}, finished ${fast.finished}`);
}

console.log(
  failures === 0 ? '\nvillage sim smoke: OK' : `\nvillage sim smoke: ${failures} failure(s)`,
);
process.exit(failures === 0 ? 0 : 1);
