// scripts/checks/village/forest-check.ts — headless checks of the forest: the tree states and their timing,
// the yield, woodcutters felling real trees, regrowth, and the save.
// Run: node --experimental-strip-types scripts/checks/village/forest-check.ts
import assert from 'node:assert/strict';
import { ASSET_MANIFEST } from '../../../src/assets/assetManifest.ts';
import { VILLAGE } from '../../../src/config/village.ts';
import { Role, type VillageEvent } from '../../../src/world/village/model/types.ts';
import {
  chopSecondsOf,
  createForest,
  forestProblem,
  type TreeInfo,
  TreeState,
  yieldOf,
} from '../../../src/world/village/sim/forest.ts';
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

await check(
  'yield: by species, scaled by the tree, never below one, a default for unknown keys',
  () => {
    assert.equal(yieldOf(trees[0]!), F.YIELD.fir);
    assert.equal(yieldOf(trees[1]!), Math.round(F.YIELD.birch! * 1.2));
    assert.equal(yieldOf(trees[3]!), 1, 'a sapling-sized pine still gives one');
    assert.equal(yieldOf(trees[4]!), F.DEFAULT_YIELD, 'an unknown key gets the default');
    assert.equal(chopSecondsOf(trees[0]!), yieldOf(trees[0]!) * F.CHOP_S_PER_WOOD);
  },
);

await check(
  'chopping: the last hit fells the tree and gives its yield once; chopping a fallen tree does nothing',
  () => {
    const forest = createForest(trees);
    const events: VillageEvent[] = [];
    const total = chopSecondsOf(trees[0]!);
    assert.equal(forest.chop(0, total - 1, 1, 0, events), 0, 'not yet');
    assert.equal(forest.state(0), TreeState.Standing);
    assert.equal(
      forest.chop(0, 1, 1, 0, events),
      yieldOf(trees[0]!),
      'the last hit gives the whole yield',
    );
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
  assert.ok(forest.growth(0) > F.SAPLING_START && forest.growth(0) < 1, `${forest.growth(0)}`);
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
  'uproot: a standing tree goes straight to a stump with its whole yield, once; it grows back like a felled one',
  () => {
    const forest = createForest(trees, { woodAdd: () => 2 });
    const events: VillageEvent[] = [];
    assert.equal(forest.uproot(0, events), yieldOf(trees[0]!) + 2, 'the yield and Sharp axes');
    assert.equal(forest.state(0), TreeState.Stump, 'no fall: a stump at once');
    assert.equal(forest.isStanding(0), false);
    assert.deepEqual(events, [{ kind: 'treeUprooted', tree: 0 }]);
    assert.equal(forest.uproot(0, events), 0, 'a stump gives nothing');
    assert.equal(forest.fell(0, 1, 0, events), 0, 'and cannot be felled');
    assert.equal(forest.chop(0, 1000, 1, 0, events), 0, 'or chopped');
    assert.equal(events.length, 1, 'only the first uproot made an event');
    assert.equal(forest.counts().standing, trees.length - 1);
    assert.equal(forest.counts().stumps, 1);

    forest.update(F.REGROW_DAYS * DAY_S - 5, free, events);
    assert.equal(forest.state(0), TreeState.Stump, 'still waiting');
    forest.update(10, free, events);
    assert.equal(forest.state(0), TreeState.Sapling);
    forest.update(F.GROW_DAYS * DAY_S + 1, free, events);
    assert.equal(forest.state(0), TreeState.Standing);
    assert.deepEqual(
      events.map((e) => e.kind),
      ['treeUprooted', 'treeSapling', 'treeGrown'],
      'a stump that was uprooted is not announced as a fall that ended',
    );

    const falling = createForest(trees);
    falling.fell(1, 0, 1, []);
    assert.equal(falling.uproot(1, []), 0, 'a falling tree cannot be uprooted');
    assert.equal(falling.state(1), TreeState.Falling);
  },
);

await check(
  'uproot: chopping already done on the tree is dropped, and the tree is saved as a stump',
  () => {
    const forest = createForest(trees);
    const events: VillageEvent[] = [];
    forest.chop(3, 7, 1, 0, events);
    assert.ok(
      forest.serialize().chopSeconds.some((s) => s > 0),
      'chopping is saved',
    );
    assert.ok(forest.uproot(3, events) > 0);
    const saved = structuredClone(forest.serialize());
    assert.equal(forestProblem(saved, trees.length), null);
    assert.deepEqual(saved.ids, [3]);
    assert.deepEqual(saved.states, [TreeState.Stump]);
    assert.deepEqual(saved.chopIds, [], 'no half-chopped tree is left behind');
    assert.deepEqual(saved.chopSeconds, []);
    const copy = createForest(trees);
    copy.restore(saved);
    assert.equal(copy.state(3), TreeState.Stump);
    assert.deepEqual(copy.serialize(), saved);
  },
);

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
    assert.ok(wet.growth(0) > dry.growth(0), 'wet saplings grow faster');

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
  'woodcutters fell real trees: wood arrives in the yield of each, one woodcutter per tree',
  () => {
    const sim = makeSim(map, { mode: 'hamlet' });
    const startWood = sim.economy.stock.wood;
    let yielded = 0;
    let felled = 0;
    const fellOrder: number[] = [];
    let spent = 0;
    hoursSim(sim, 1, (_t, events) => {
      // the village uses its wood (a full store would stop the woodcutters)
      if (sim.economy.stock.wood > 20 && sim.economy.spendWood(10)) spent += 10;
      for (const e of events) {
        if (e.kind === 'treeFelled') {
          felled++;
          fellOrder.push(e.tree);
          yielded += yieldOf(sim.forest.info(e.tree));
        }
      }
      // one woodcutter per tree spot
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
    assert.ok(felled > 0, 'woodcutters felled trees');
    assert.equal(
      c.standing + c.falling + c.stumps + c.saplings,
      c.trees,
      'every tree is in exactly one state',
    );
    assert.ok(sim.economy.stock.wood + spent <= startWood + yielded + 1e-6, 'no wood from nowhere');
    assert.equal(new Set(fellOrder).size, fellOrder.length, 'no tree was felled twice');
  },
);

await check('a full wood store: woodcutters do not fell trees for nothing', () => {
  const sim = makeSim(map, { mode: 'hamlet' });
  sim.economy.addWood(1000);
  let felled = 0;
  hoursSim(sim, 0.3, (_t, events) => {
    sim.economy.addWood(1000);
    felled += events.filter((e) => e.kind === 'treeFelled').length;
  });
  assert.equal(felled, 0);
});

await check('every tree the game places has a yield of its own, not the default', () => {
  for (const { key } of ASSET_MANIFEST.trees) {
    const known = [key, key.replace(/_\d+$/, ''), key.split('_')[0]!].some((k) => k in F.YIELD);
    assert.ok(known, `${key} falls through to DEFAULT_YIELD`);
  }
});

finish('all forest checks passed');
