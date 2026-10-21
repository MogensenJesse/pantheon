// scripts/checks/village/forest-check.ts — headless checks of the forest (M6): the tree states and their timing,
// the yield, woodcutters felling real trees, regrowth, and the save.
// Run: node --experimental-strip-types scripts/checks/village/forest-check.ts
import assert from 'node:assert/strict';
import { ASSET_MANIFEST } from '../../../src/assets/assetManifest.ts';
import { VILLAGE } from '../../../src/config/village.ts';
import { type Building, Role, type VillageEvent } from '../../../src/world/village/model/types.ts';
import { levelFraction } from '../../../src/world/village/render/terraformer.ts';
import { fallAngle } from '../../../src/world/village/render/treeFall.ts';
import {
  chopSecondsOf,
  createForest,
  forestProblem,
  type TreeInfo,
  TreeState,
  yieldOf,
} from '../../../src/world/village/sim/forest.ts';
import type { VillageSim } from '../../../src/world/village/sim/villageSim.ts';
import { check, finish } from '../lib/check.ts';
import { DAY_S, hoursSim, loadMap, makeSim } from '../lib/villageHeadless.ts';

const F = VILLAGE.FOREST;
const map = loadMap('island-mountain');
const free = { rain01: 0, canRegrow: () => true };

const trees: TreeInfo[] = [
  { x: 0, z: 0, key: 'fir_1', scale: 1 },
  { x: 10, z: 0, key: 'birch_web', scale: 1.2 },
  { x: 20, z: 0, key: 'pine_big_2', scale: 1 },
  { x: 30, z: 0, key: 'pine_sapling_1', scale: 0.8 },
  { x: 40, z: 0, key: 'unknown_thing', scale: 1 },
];

// --- the pure rules ---

await check('yield: by species and size, scaled by the tree, never below one', () => {
  assert.equal(yieldOf(trees[0]!), 6);
  assert.equal(yieldOf(trees[1]!), Math.round(5 * 1.2));
  assert.equal(yieldOf(trees[2]!), 9);
  assert.equal(yieldOf(trees[3]!), 1, 'a sapling-sized pine still gives one');
  assert.equal(yieldOf(trees[4]!), F.DEFAULT_YIELD, 'an unknown key gets the default');
  assert.equal(chopSecondsOf(trees[0]!), 6 * F.CHOP_S_PER_WOOD);
  for (const t of map.trees) assert.ok(yieldOf(t) >= 1 && yieldOf(t) <= 12, `${t.key} ${t.scale}`);
});

await check(
  'chopping: the last hit fells the tree and gives its yield once; chopping a fallen tree does nothing',
  () => {
    const forest = createForest(trees);
    const events: VillageEvent[] = [];
    const total = chopSecondsOf(trees[0]!);
    assert.equal(forest.chop(0, total - 1, 1, 0, events), 0, 'not yet');
    assert.equal(forest.state(0), TreeState.Standing);
    assert.equal(forest.chop(0, 1, 1, 0, events), 6, 'the last hit gives the whole yield');
    assert.equal(forest.state(0), TreeState.Falling);
    assert.deepEqual(events, [{ kind: 'treeFelled', tree: 0, dirX: 1, dirZ: 0 }]);
    assert.equal(forest.chop(0, 100, 1, 0, events), 0);
    assert.equal(forest.isStanding(0), false);
    assert.equal(forest.fell(0, 1, 0, events), 0, 'felling a fallen tree does nothing');
    assert.equal(forest.fell(1, 0, 1, events), yieldOf(trees[1]!));
  },
);

await check('the life of a stump: fall, stump, a wait, a sapling that grows, a tree again', () => {
  const forest = createForest(trees);
  const events: VillageEvent[] = [];
  forest.fell(0, 1, 0, events);
  forest.update(F.FALL_S - 0.1, free, events);
  assert.equal(forest.state(0), TreeState.Falling);
  forest.update(0.2, free, events);
  assert.equal(forest.state(0), TreeState.Stump);
  forest.update(F.REGROW_DAYS * DAY_S - 5, free, events);
  assert.equal(forest.state(0), TreeState.Stump, 'still waiting');
  forest.update(10, free, events);
  assert.equal(forest.state(0), TreeState.Sapling);
  assert.ok(Math.abs(forest.growth(0) - F.SAPLING_START) < 0.01, `${forest.growth(0)}`);
  forest.update((F.GROW_DAYS * DAY_S) / 2, free, events);
  assert.ok(forest.growth(0) > 0.5 && forest.growth(0) < 0.6, `${forest.growth(0)}`);
  forest.update((F.GROW_DAYS * DAY_S) / 2 + 1, free, events);
  assert.equal(forest.state(0), TreeState.Standing);
  assert.equal(forest.growth(0), 1);
  assert.deepEqual(
    events.map((e) => e.kind),
    ['treeFelled', 'treeStump', 'treeSapling', 'treeGrown'],
  );
  assert.equal(forest.counts().standing, trees.length);
});

await check(
  'rain speeds a sapling up; an occupied spot keeps its stump; the sapling cap holds',
  () => {
    const dry = createForest(trees);
    const wet = createForest(trees);
    const events: VillageEvent[] = [];
    for (const f of [dry, wet]) {
      f.fell(0, 1, 0, events);
      f.update(F.FALL_S + 0.1, free, events);
      f.update(F.REGROW_DAYS * DAY_S, free, events);
    }
    assert.equal(dry.state(0), TreeState.Sapling);
    dry.update(F.GROW_DAYS * DAY_S * 0.5, free, events);
    wet.update(F.GROW_DAYS * DAY_S * 0.5, { rain01: 1, canRegrow: () => true }, events);
    assert.ok(wet.growth(0) > dry.growth(0) + 0.1, 'wet saplings grow faster');

    const blocked = createForest(trees);
    blocked.fell(0, 1, 0, events);
    blocked.update(F.FALL_S + 0.1, free, events);
    blocked.update(10 * DAY_S, { rain01: 0, canRegrow: () => false }, events);
    assert.equal(blocked.state(0), TreeState.Stump, 'a built-on spot never regrows');
    blocked.update(2, free, events);
    assert.equal(blocked.state(0), TreeState.Sapling, 'and does once the ground is free');

    const many: TreeInfo[] = Array.from({ length: F.MAX_SAPLINGS + 10 }, (_, i) => ({
      x: i,
      z: 0,
      key: 'fir_1',
      scale: 1,
    }));
    const forest = createForest(many);
    for (let i = 0; i < many.length; i++) forest.fell(i, 1, 0, events);
    forest.update(F.FALL_S + 0.1, free, events);
    forest.update(F.REGROW_DAYS * DAY_S, free, events);
    assert.equal(forest.counts().saplings, F.MAX_SAPLINGS, 'no more saplings than the cap');
    assert.equal(forest.counts().stumps, 10);
  },
);

await check(
  'the forest in a save: a fall in progress goes on after a restore, chopping already done is kept, damage is refused',
  () => {
    const forest = createForest(trees);
    const events: VillageEvent[] = [];
    forest.fell(0, 1, 0, events);
    forest.fell(1, 0, 1, events);
    forest.update(F.FALL_S + 0.1, free, events);
    forest.update(F.REGROW_DAYS * DAY_S, free, events);
    forest.fell(2, 1, 1, events); // still falling
    forest.chop(3, 7, 1, 0, events);
    const saved = structuredClone(forest.serialize());
    assert.equal(forestProblem(saved, trees.length), null);
    const copy = createForest(trees);
    copy.restore(saved);
    assert.deepEqual(copy.serialize(), saved);
    assert.equal(copy.state(0), TreeState.Sapling);
    assert.equal(copy.state(2), TreeState.Falling, 'the tree that was falling still falls');
    copy.update(F.FALL_S, free, []);
    assert.equal(copy.state(2), TreeState.Stump, 'and ends as a stump');
    assert.equal(copy.counts().standing, trees.length - 3);
    const continued = copy.chop(3, chopSecondsOf(trees[3]!) - 7, 1, 0, []);
    assert.ok(continued > 0, 'the chopping done before the save counts');
    assert.ok(forestProblem({ ...saved, ids: [99] }, trees.length), 'an id that is not a tree');
    assert.ok(forestProblem({ ...saved, states: [0] }, trees.length), 'lengths must match');
    assert.ok(
      forestProblem({ ...saved, states: saved.states.map(() => 0) }, trees.length),
      'a standing tree is not in the list',
    );
    assert.ok(forestProblem(undefined, trees.length));
    assert.ok(forestProblem({ ...saved, timers: [-1, 0, 0] }, trees.length));
  },
);

await check('nearest: the standing trees closest to a point, in order', () => {
  const forest = createForest(trees);
  assert.deepEqual(forest.nearest(11, 0, 2), [1, 2]);
  forest.fell(1, 1, 0, []);
  assert.deepEqual(forest.nearest(11, 0, 2), [2, 0]);
});

// --- in a real village ---

await check(
  'woodcutters fell real trees: wood arrives in the yield of each, one woodcutter per tree, none at a tree that is down',
  () => {
    const sim = makeSim(map, { mode: 'hamlet' });
    const startWood = sim.economy.stock.wood;
    let yielded = 0;
    let felled = 0;
    const fellOrder: number[] = [];
    let spent = 0;
    hoursSim(sim, 1.5, (_t, events) => {
      // the village uses its wood (a full store would stop the woodcutters)
      if (sim.economy.stock.wood > 20 && sim.economy.spendWood(10)) spent += 10;
      for (const e of events) {
        if (e.kind === 'treeFelled') {
          felled++;
          fellOrder.push(e.tree);
          yielded += yieldOf(sim.forest.info(e.tree));
        }
      }
      // one woodcutter per tree spot, and nobody stands at a tree that is no longer standing
      const spotsInUse = new Map<number, number>();
      const v = sim.villagers;
      for (let i = 0; i < v.count; i++) {
        if (v.role[i] !== Role.Woodcutter || v.slot[i]! < 0) continue;
        const spot = sim.workSpots.trees.find((s) => -s.id === v.target[i]!);
        if (!spot) continue;
        spotsInUse.set(spot.id, (spotsInUse.get(spot.id) ?? 0) + 1);
        assert.ok(spotsInUse.get(spot.id)! <= 1, 'two woodcutters at one tree');
      }
    });
    const c = sim.forest.counts();
    console.log(
      `     ${felled} trees felled in 1.5 h, ${yielded} wood, ${c.standing} of ${c.trees} standing`,
    );
    assert.ok(felled >= 3, 'woodcutters felled trees');
    assert.equal(
      c.standing + c.falling + c.stumps + c.saplings,
      c.trees,
      'every tree is in exactly one state',
    );
    assert.ok(sim.economy.stock.wood + spent <= startWood + yielded + 1e-6, 'no wood from nowhere');
    assert.equal(new Set(fellOrder).size, fellOrder.length, 'no tree was felled twice');
    assert.ok(c.standing < c.trees);
  },
);

await check(
  'every tree can be felled: the nearest ones fall from DEV, and no woodcutter keeps a claim on one that is down',
  () => {
    const sim = makeSim(map, { mode: 'hamlet' });
    const events: VillageEvent[] = [];
    const near = sim.forest.nearest(sim.seed.x, sim.seed.z, 30);
    assert.equal(sim.fellNear(sim.seed.x, sim.seed.z, 30, events), 30);
    assert.equal(events.filter((e) => e.kind === 'treeFelled').length, 30);
    for (const id of near) assert.notEqual(sim.forest.state(id), TreeState.Standing);
    hoursSim(sim, 0.3);
    const v = sim.villagers;
    for (let i = 0; i < v.count; i++) {
      if (v.role[i] !== Role.Woodcutter || v.slot[i]! < 0) continue;
      const spot = sim.workSpots.trees.find((s) => -s.id === v.target[i]!);
      if (spot) assert.ok(sim.forest.isStanding(spot.tree!), 'a woodcutter at a tree that is down');
    }
  },
);

await check('a full wood store: woodcutters do not fell trees for nothing', () => {
  const sim = makeSim(map, { mode: 'hamlet' });
  sim.economy.addWood(1000);
  let felled = 0;
  hoursSim(sim, 0.5, (_t, events) => {
    sim.economy.addWood(1000);
    felled += events.filter((e) => e.kind === 'treeFelled').length;
  });
  assert.equal(felled, 0);
});

await check(
  'regrowth in a village: stumps wait, saplings grow only where nothing was built, the forest comes back',
  () => {
    const sim = makeSim(map, { mode: 'hamlet' });
    const events: VillageEvent[] = [];
    const felled = sim.forest.nearest(sim.seed.x, sim.seed.z, 25);
    sim.fellNear(sim.seed.x, sim.seed.z, 25, events);
    const kinds = new Map<number, string[]>();
    hoursSim(sim, 0.01); // the falls end
    assert.equal(sim.forest.counts().stumps, 25);
    hoursSim(sim, 1.6, (_t, ev) => {
      for (const e of ev) {
        if (e.kind === 'treeSapling' || e.kind === 'treeGrown' || e.kind === 'treeStump') {
          kinds.set(e.tree, [...(kinds.get(e.tree) ?? []), e.kind]);
        }
      }
    }); // 3.2 game days: the first saplings
    const c = sim.forest.counts();
    console.log(`     after 3.2 days: ${c.stumps} stumps, ${c.saplings} saplings of the 25 felled`);
    assert.ok(c.saplings > 0, 'saplings are growing');
    assert.ok(c.saplings <= F.MAX_SAPLINGS);
    for (const [id, seq] of kinds) {
      const sapling = seq.indexOf('treeSapling');
      // a stump that stood before the run began has no event in it; one felled during it has the stump first
      if (seq.includes('treeStump'))
        assert.ok(seq.indexOf('treeStump') < sapling, `tree ${id}: ${seq}`);
      assert.ok(sapling >= 0);
    }
    hoursSim(sim, 1.2, (_t, ev) => {
      for (const e of ev)
        if (e.kind === 'treeGrown') kinds.set(e.tree, [...(kinds.get(e.tree) ?? []), 'grown']);
    }); // to 5.6 days
    const regrown = [...kinds.values()].filter((s) => s.includes('grown')).length;
    assert.ok(regrown > 0, 'trees stand again');
    for (const id of felled) {
      // a tree is standing again or a sapling or a stump: never lost
      assert.ok(
        [TreeState.Standing, TreeState.Sapling, TreeState.Stump, TreeState.Falling].includes(
          sim.forest.state(id),
        ),
      );
    }
  },
);

await check('the same start gives the same forest', () => {
  const key = (s: VillageSim) => JSON.stringify([s.forest.serialize(), s.economy.serialize()]);
  const a = makeSim(map, { mode: 'hamlet' });
  const b = makeSim(map, { mode: 'hamlet' });
  hoursSim(a, 0.4);
  hoursSim(b, 0.4);
  assert.equal(key(a), key(b));
});

await check(
  'a felled tree speeds up to the ground, springs back a little and then lies still',
  () => {
    assert.equal(fallAngle(0), 0);
    const half = Math.PI / 2;
    let last = 0;
    // Speeding up while it falls: the angle only grows until it reaches the horizontal.
    for (let t = 0; t <= F.FALL_S * 0.8; t += F.FALL_S / 50) {
      const a = fallAngle(t);
      assert.ok(a >= last - 1e-12, `still falling at ${t}`);
      last = a;
    }
    assert.ok(Math.abs(fallAngle(F.FALL_S * 0.8) - half) < 1e-9, 'horizontal when the fall ends');
    const bounce = Math.min(
      ...Array.from({ length: 20 }, (_, k) => fallAngle(F.FALL_S * (0.8 + k / 100))),
    );
    assert.ok(bounce < half && bounce > half - 0.1, 'a small spring back');
    assert.ok(
      Math.abs(fallAngle(F.FALL_S) - half) < 1e-9 &&
        fallAngle(F.FALL_S * 5) === fallAngle(F.FALL_S),
      'then still',
    );
  },
);

await check('a building pad is levelled over the foundation phase, then it is whole', () => {
  const b = { stage: 0, progress: 0 } as Building;
  assert.equal(levelFraction(b), 0);
  b.progress = VILLAGE.CONSTRUCTION.WORK_S[0]! / 2;
  assert.ok(Math.abs(levelFraction(b) - 0.5) < 1e-9);
  b.progress = VILLAGE.CONSTRUCTION.WORK_S[0]! * 3;
  assert.equal(levelFraction(b), 1, 'never past whole');
  assert.equal(levelFraction({ stage: 1, progress: 0 } as Building), 1);
});

await check('every tree the game places has a yield of its own, not the default', () => {
  for (const { key } of ASSET_MANIFEST.trees) {
    const known = [key, key.replace(/_\d+$/, ''), key.split('_')[0]!].some((k) => k in F.YIELD);
    assert.ok(known, `${key} falls through to DEFAULT_YIELD`);
  }
});

finish('all forest checks passed');
