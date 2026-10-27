// scripts/checks/hand/hand-runtime-check.ts — headless checks of the orb's hand at work on a real hamlet: lifting,
// carrying and putting down a tree, a field's wheat and a sheep, what the village sees, and what stays as it was.
// Run: node --experimental-strip-types scripts/checks/hand/hand-runtime-check.ts
import assert from 'node:assert/strict';
import { VILLAGE } from '../../../src/config/village.ts';
import { hand } from '../../../src/config/visual/hand.ts';
import { classifyDrop, costOf, reachOf } from '../../../src/hand/handRules.ts';
import type { HandKind } from '../../../src/hand/handTypes.ts';
import { headcount } from '../../../src/life/animals/animalSim.ts';
import type { RemoteSite } from '../../../src/world/village/model/types.ts';
import { TreeState, yieldOf } from '../../../src/world/village/sim/forest.ts';
import { localToWorld } from '../../../src/world/village/sim/geometry.ts';
import type { VillageSim } from '../../../src/world/village/sim/villageSim.ts';
import { check, finish } from '../lib/check.ts';
import {
  farmOf,
  handOn,
  morningHamlet,
  openSite,
  remoteSite,
  ripeField,
  templeOf,
  treeNearTemple,
  treesNearTemple,
} from '../lib/handFixtures.ts';
import { DT, savedHash } from '../lib/villageHeadless.ts';

const H = VILLAGE.HAND;
const CARRY = hand.CARRY;

// --- the same ending for every kind ---

/** One thing of a kind within the hand's reach, told the same way so one contract can be held to all three. */
interface KindWorld {
  sim: VillageSim;
  w: ReturnType<typeof handOn>;
  /** Where to stand to lift it. */
  at: { x: number; z: number };
  /** The thing's own world as text: the same before a lift and after it is put back. */
  world: () => string;
  /** Whether it was taken for good. */
  consumed: () => boolean;
  /** Whether the view was last told to put it back. */
  shownBack: () => boolean;
  /** Fills the store that takes its good. */
  fillStore: () => void;
}

const KINDS: { kind: HandKind; setup: () => KindWorld }[] = [
  {
    kind: 'tree',
    setup: () => {
      const sim = morningHamlet(30);
      const id = treeNearTemple(sim);
      const w = handOn(sim);
      return {
        sim,
        w,
        at: w.treeAt(id),
        world: () => JSON.stringify(sim.forest.serialize()),
        consumed: () => !w.standing(id),
        shownBack: () => w.log.at(-1) === `release:tree:${id}:true`,
        fillStore: () => sim.economy.addWood(Number.POSITIVE_INFINITY),
      };
    },
  },
  {
    kind: 'wheat',
    setup: () => {
      const sim = morningHamlet(300);
      const field = ripeField(sim);
      const w = handOn(sim);
      return {
        sim,
        w,
        at: field,
        world: () => String(field.growth),
        consumed: () => field.growth === 0,
        shownBack: () => w.log.at(-1) === `release:wheat:${field.id}:true`,
        fillStore: () => sim.economy.addFood(1000),
      };
    },
  },
  {
    kind: 'sheep',
    setup: () => {
      const sim = morningHamlet(30);
      const farm = farmOf(sim);
      const w = handOn(sim, { animals: farm.animals });
      const { flock } = farm;
      return {
        sim,
        w,
        at: flock.animals[0]!,
        world: () => `${flock.animals.length}/${headcount(flock)}/${flock.owed.length}`,
        consumed: () => flock.owed.length === 1,
        shownBack: () => farm.log.at(-1) === 'release:back',
        fillStore: () => sim.economy.addFood(1000),
      };
    },
  },
];

for (const { kind, setup } of KINDS) {
  const cost = costOf(kind);

  await check(
    `${kind}: cancelled, it goes back, the energy returns once, and a second cancel does nothing`,
    () => {
      const k = setup();
      const before = k.world();
      k.w.moveTo(k.at);
      assert.ok(k.w.hand.pick().ok);
      assert.equal(k.w.hand.energyOnHold(), cost);
      assert.equal(k.w.hand.cancel(), true);
      assert.equal(k.world(), before, 'the world is as it was');
      assert.equal(k.w.state.energy, 100, 'refunded');
      assert.equal(k.w.hand.energyOnHold(), 0);
      assert.ok(k.shownBack(), 'the view was told to put it back');
      assert.equal(k.w.hand.cancel(), false);
      assert.equal(k.w.state.energy, 100, 'refunded once');
    },
  );

  await check(`${kind}: let go outside every zone, it goes back and the effort is lost`, () => {
    const k = setup();
    const before = k.world();
    const stock = { ...k.sim.economy.stock };
    k.w.moveTo(k.at);
    assert.ok(k.w.hand.pick().ok);
    assert.deepEqual(k.w.hand.drop({ x: -9999, z: -9999 }), { kind: 'released' });
    assert.equal(k.world(), before, 'the thing is where it was');
    assert.deepEqual({ ...k.sim.economy.stock }, stock, 'and the stores are as they were');
    assert.equal(k.w.state.energy, 100 - cost, 'forfeited');
    assert.equal(k.w.hand.held(), null);
    assert.ok(k.shownBack());
    // lifted again and cancelled, only that lift comes back
    assert.ok(k.w.hand.pick().ok);
    assert.equal(k.w.hand.cancel(), true);
    assert.equal(k.w.state.energy, 100 - cost, 'refunded: only the first lift was lost');
  });

  await check(
    `${kind}: a full store still takes it, keeps nothing and still counts as a deed`,
    () => {
      const k = setup();
      const before = k.world();
      k.fillStore();
      const stock = { ...k.sim.economy.stock };
      k.w.moveTo(k.at);
      assert.ok(k.w.hand.pick().ok);
      k.w.moveTo(templeOf(k.sim));
      const r = k.w.hand.drop();
      assert.ok(r.kind === 'delivered', JSON.stringify(r));
      assert.equal(r.delivery.kept, 0, 'no room');
      assert.deepEqual({ ...k.sim.economy.stock }, stock);
      assert.ok(k.consumed(), 'it is taken all the same');
      assert.notEqual(k.world(), before);
      assert.ok(r.delivery.impressed > 0, 'and the village is still impressed');
    },
  );
}

await check(
  'lift: the tree is only held; the sim, the stores and the woodcutters see nothing',
  () => {
    const sim = morningHamlet(30);
    const w = handOn(sim);
    const id = treeNearTemple(sim);
    const forest = JSON.stringify(sim.forest.serialize());
    const stock = { ...sim.economy.stock };
    w.moveTo(w.treeAt(id));
    const r = w.hand.pick();
    assert.ok(r.ok && r.held.kind === 'tree' && r.held.id === id, JSON.stringify(r));
    assert.equal(w.state.energy, 100 - costOf('tree'), 'paid at the lift');
    assert.equal(w.standing(id), true, 'still standing in the sim');
    assert.equal(JSON.stringify(sim.forest.serialize()), forest, 'the forest is as it was');
    assert.deepEqual({ ...sim.economy.stock }, stock, 'and so are the stores');
    assert.deepEqual(w.log, [`lift:tree:${id}`]);
    assert.equal(w.hand.energyOnHold(), costOf('tree'));
    assert.equal(w.hand.target(), null, 'nothing to aim at while the hand is full');
    assert.deepEqual(w.hand.pick(), { ok: false, reason: 'busy' });
  },
);

await check(
  'lift refusals: out of reach, not enough energy, blocked, and a skill-tree reach',
  () => {
    const sim = morningHamlet();
    const id = treeNearTemple(sim);
    const tree = { x: sim.forest.info(id).x, z: sim.forest.info(id).z };
    const out = { x: tree.x + reachOf('tree') + 2, z: tree.z };
    const far = handOn(sim);
    far.moveTo(out);
    assert.deepEqual(far.hand.pick(), { ok: false, reason: 'none' }, 'out of reach');
    const reaching = handOn(sim, { reachMul: () => 2 });
    reaching.moveTo(out);
    assert.ok(reaching.hand.pick().ok, 'a longer reach takes it');

    const tired = handOn(sim, {}, costOf('tree') - 1);
    tired.moveTo(tree);
    assert.deepEqual(tired.hand.pick(), { ok: false, reason: 'energy' });
    assert.equal(tired.state.energy, costOf('tree') - 1, 'nothing spent');
    assert.deepEqual(tired.log, [], 'and nothing lifted');

    const cheap = handOn(sim, { costMul: () => 0.5 }, costOf('tree') * 0.5);
    cheap.moveTo(tree);
    assert.ok(cheap.hand.pick().ok, 'a cheaper grip (the skill tree)');
    assert.equal(cheap.state.energy, 0);

    const blocked = handOn(sim, { blocked: () => true });
    blocked.moveTo(tree);
    assert.deepEqual(blocked.hand.pick(), { ok: false, reason: 'blocked' });
    assert.equal(blocked.hand.target(), null);
  },
);

await check(
  'drop at the temple: the tree is uprooted, its wood joins the store, the village sees it',
  () => {
    const sim = morningHamlet(30);
    const w = handOn(sim);
    const temple = templeOf(sim);
    const id = treeNearTemple(sim);
    const wood = yieldOf(sim.forest.info(id));
    const before = sim.economy.stock.wood;
    w.moveTo(w.treeAt(id));
    assert.ok(w.hand.pick().ok);
    assert.deepEqual(w.hand.zone({ x: 0, z: 0 }), { zone: 'none' });
    w.moveTo(temple);
    const r = w.hand.drop();
    assert.ok(r.kind === 'delivered', r.kind);
    assert.equal(w.standing(id), false, 'uprooted');
    assert.equal(sim.forest.state(id), TreeState.Stump);
    assert.deepEqual(r.delivery.zone, 'store');
    assert.equal(r.delivery.amount, wood);
    assert.equal(r.delivery.kept, Math.min(wood, sim.economy.caps().wood - before));
    assert.equal(sim.economy.stock.wood, before + r.delivery.kept);
    assert.ok(w.events.some((e) => e.kind === 'treeUprooted' && e.tree === id));
    assert.equal(
      w.log.at(-1),
      `release:tree:${id}:false`,
      'the sim’s own events finish the picture',
    );
    assert.equal(w.state.energy, 100 - costOf('tree'), 'the energy stays spent');
    assert.equal(w.hand.held(), null);
    assert.ok(r.delivery.impressed > 0, 'the idlers at the temple saw it');
    assert.deepEqual(w.hand.drop(), { kind: 'empty' });
  },
);

await check(
  'drop on a site: the wood is work for the builders and the stores are untouched',
  () => {
    const { sim, site } = openSite();
    const w = handOn(sim);
    const id = sim.forest.nearest(site.x, site.z, 1)[0]!;
    w.moveTo(w.treeAt(id));
    assert.ok(w.hand.pick().ok);
    const stock = { ...sim.economy.stock };
    const progress = site.progress;
    const stage = site.stage;
    w.moveTo(site);
    const r = w.hand.drop();
    assert.ok(r.kind === 'delivered' && r.delivery.zone === 'site', JSON.stringify(r));
    assert.deepEqual({ ...sim.economy.stock }, stock, 'a site takes work, not stock');
    const worked = r.delivery.amount * H.WORK_PER_WOOD_S;
    assert.ok(
      site.stage > stage || Math.abs(site.progress - progress - worked) < 1e-6,
      `${site.progress - progress} of ${worked}`,
    );
    assert.equal(r.delivery.kept, r.delivery.amount);
  },
);

await check(
  'drop at a remote camp: the wood is the crew’s work, the stores are untouched, stages roll over',
  () => {
    const sim = morningHamlet(30);
    const temple = templeOf(sim);
    const [first, second] = VILLAGE.RESTORATION.SITE_WORK_S as readonly number[] as [
      number,
      number,
    ];
    const remote = remoteSite({
      campX: temple.x + 400,
      campZ: temple.z,
      x: temple.x + 430,
      z: temple.z,
      progress: first - 1,
    });
    (sim.remoteSites as RemoteSite[]).push(remote);
    const camp = { x: remote.campX, z: remote.campZ };
    const w = handOn(sim);
    const [a, b] = treesNearTemple(sim, 2) as [number, number];
    const haul = (id: number) => {
      w.moveTo(w.treeAt(id));
      assert.ok(w.hand.pick().ok);
      assert.equal(w.hand.zone(camp)?.zone, 'remote');
      w.moveTo(camp);
      const r = w.hand.drop();
      assert.ok(r.kind === 'delivered' && r.delivery.zone === 'remote', JSON.stringify(r));
      assert.equal(r.delivery.kept, r.delivery.amount, 'all of it is work');
      return r.delivery.amount * H.WORK_PER_WOOD_S;
    };
    const stock = { ...sim.economy.stock };
    const worked = haul(a);
    assert.deepEqual({ ...sim.economy.stock }, stock, 'a site takes work, not stock');
    assert.equal(w.standing(a), false, 'the tree was uprooted');
    assert.equal(remote.stage, 1, 'the first stage is done');
    assert.ok(
      Math.abs(remote.progress - (worked - 1)) < 1e-6,
      `${remote.progress} into the second`,
    );
    const stages = () =>
      w.events.flatMap((e) => (e.kind === 'remoteStageCompleted' ? [e.stage] : []));
    assert.deepEqual(stages(), [1]);

    remote.progress = second - 1;
    haul(b);
    assert.equal(remote.stage, 2, 'the last wood finishes the place');
    assert.deepEqual(stages(), [1, 2], 'and the stage events come out in order');
    assert.equal(w.hand.zone(camp), null, 'nothing is held now');
    assert.equal(classifyDrop('wood', camp, sim.buildings, sim.remoteSites).zone, 'none');
  },
);

await check(
  'a woodcutter fells the held tree, or the hand is blocked: the hold ends and the energy returns',
  () => {
    const sim = morningHamlet();
    const id = treeNearTemple(sim);
    const w = handOn(sim);
    w.moveTo(w.treeAt(id));
    assert.ok(w.hand.pick().ok);
    assert.equal(w.hand.update(DT), null, 'nothing wrong yet');
    sim.forest.fell(id, 1, 0, []);
    assert.equal(w.hand.update(DT), 'gone');
    assert.equal(w.hand.held(), null);
    assert.equal(w.state.energy, 100, 'refunded');
    assert.equal(w.log.at(-1), `release:tree:${id}:true`);

    let blocked = false;
    const b = handOn(sim, { blocked: () => blocked });
    const id2 = treeNearTemple(sim);
    b.moveTo(b.treeAt(id2));
    assert.ok(b.hand.pick().ok);
    blocked = true;
    assert.equal(b.hand.update(DT), 'blocked');
    assert.equal(b.state.energy, 100);
    assert.equal(b.standing(id2), true);
  },
);

await check(
  'aim: the ring finds the nearest tree a few times a second, and none while one is held',
  () => {
    const sim = morningHamlet();
    const id = treeNearTemple(sim);
    const w = handOn(sim);
    assert.equal(w.hand.target(), null, 'not looked yet');
    w.moveTo(w.treeAt(id));
    w.hand.update(0.2);
    assert.equal(w.hand.target()?.id, id);
    w.moveTo({ x: -9999, z: -9999 });
    w.hand.update(0.05);
    assert.equal(w.hand.target()?.id, id, 'between looks it keeps the last answer');
    w.hand.update(0.1);
    assert.equal(w.hand.target(), null);
  },
);

await check(
  'carrying: the tree is posed on the orb each frame while held, trailing its heading',
  () => {
    const sim = morningHamlet();
    const id = treeNearTemple(sim);
    const w = handOn(sim);
    w.hand.frame(0.016, { x: 0, y: 2, z: 0 });
    assert.deepEqual(w.log, [], 'nothing is posed while nothing is held');
    w.moveTo(w.treeAt(id));
    assert.ok(w.hand.pick().ok);
    w.hand.frame(0.016, { x: 0, y: 2, z: 0 });
    for (let k = 1; k <= 20; k++) w.hand.frame(0.1, { x: k * 0.5, y: 2, z: 0 });
    assert.equal(w.poses.length, 21);
    const last = w.poses.at(-1)!;
    assert.ok(
      Math.abs(last.yaw - Math.PI / 2) < 0.05,
      `heading ${last.yaw} follows the way it moves`,
    );
    assert.equal(last.y, 2 - CARRY.HANG_M, 'the root hangs just under the orb');
    assert.equal(last.x, 10);
    assert.equal(last.tilt, CARRY.TILT_RAD);
    assert.equal(last.scale, CARRY.TREE_SCALE);
    for (let k = 0; k < 10; k++) w.hand.frame(0.1, { x: 10, y: 2, z: 0 });
    assert.equal(w.poses.at(-1)!.yaw, last.yaw, 'a hovering orb does not spin its tree');
    w.hand.cancel();
    w.hand.frame(0.1, { x: 10, y: 2, z: 0 });
    assert.equal(w.poses.length, 31, 'and nothing is posed once it is put back');
  },
);

await check(
  'the hand and the sim: a lift and cancel leave the world byte for byte, a delivery changes it once',
  () => {
    const run = (script: (w: ReturnType<typeof handOn>) => void) => {
      const sim = morningHamlet(30);
      script(handOn(sim));
      return JSON.stringify({
        forest: sim.forest.serialize(),
        economy: sim.economy.stock,
      });
    };
    const idle = run(() => {});
    const lifted = run((w) => {
      w.moveTo(w.treeAt(treeNearTemple(w.sim)));
      w.hand.pick();
      w.hand.cancel();
    });
    assert.equal(lifted, idle, 'a lift that was cancelled leaves trees and stores as they were');
    const delivered = run((w) => {
      const t = templeOf(w.sim);
      w.moveTo(w.treeAt(treeNearTemple(w.sim)));
      w.hand.pick();
      w.moveTo(t);
      w.hand.drop();
    });
    assert.notEqual(delivered, idle, 'a delivery does change them');
  },
);
// --- wheat ---

await check('aim: wheat is lifted only when ripe, and from its edge', () => {
  const sim = morningHamlet();
  const f = ripeField(sim, H.WHEAT.MIN_RIPE - 0.01);
  const w = handOn(sim);
  // No tree stands near these spots, so the field is the only thing in reach.
  const alone = (at: { x: number; z: number }) => {
    assert.equal(sim.forest.within(at.x, at.z, H.REACH_M.tree, []).length, 0);
    return at;
  };
  w.moveTo(alone(f));
  assert.deepEqual(w.hand.pick(), { ok: false, reason: 'none' }, 'unripe wheat is left alone');
  f.growth = H.WHEAT.MIN_RIPE;
  const edge = (m: number) => {
    const [x, z] = localToWorld(f, f.halfW + m, 0);
    return alone({ x, z });
  };
  w.moveTo(edge(H.REACH_M.wheat + 0.5));
  assert.deepEqual(w.hand.pick(), { ok: false, reason: 'none' }, 'out of reach of the edge');
  w.moveTo(edge(H.REACH_M.wheat - 0.5));
  const r = w.hand.pick();
  assert.ok(r.ok && r.held.kind === 'wheat' && r.held.id === f.id, JSON.stringify(r));
  assert.equal(w.state.energy, 100 - costOf('wheat'));
});

await check(
  'lift wheat: only held, the field and the stores are untouched, farmers look on',
  () => {
    const sim = morningHamlet(300);
    const f = ripeField(sim);
    const w = handOn(sim);
    const stock = { ...sim.economy.stock };
    w.moveTo(f);
    const r = w.hand.pick();
    assert.ok(r.ok && r.held.kind === 'wheat', JSON.stringify(r));
    assert.ok(r.impressed >= 1, 'the farmers at the field are impressed by the lift');
    assert.equal(f.growth, 1, 'the wheat is still on the field');
    assert.deepEqual({ ...sim.economy.stock }, stock);
    assert.deepEqual(w.log, [`lift:wheat:${f.id}`]);
    assert.equal(w.hand.target(), null);
    w.hand.frame(0.016, { x: f.x, y: 2, z: f.z });
    const pose = w.poses.at(-1)!;
    assert.equal(pose.scale, CARRY.SHEAF_SCALE);
    assert.equal(pose.tilt, 0, 'a sheaf hangs level');
    assert.equal(pose.y, 2 - CARRY.SHEAF_DROP_M);
    assert.equal(w.log.at(-1), `pose:wheat:${f.id}`);
  },
);

await check(
  'deliver wheat: the field is reaped, the larder gets the food, the lift is spent',
  () => {
    const sim = morningHamlet(30);
    const f = ripeField(sim);
    const w = handOn(sim);
    const food = sim.economy.stock.food;
    w.moveTo(f);
    assert.ok(w.hand.pick().ok);
    w.moveTo(templeOf(sim));
    const r = w.hand.drop();
    assert.ok(r.kind === 'delivered' && r.delivery.what === 'wheat', JSON.stringify(r));
    assert.equal(r.delivery.zone, 'store');
    assert.equal(r.delivery.amount, VILLAGE.ECONOMY.FIELD_YIELD, 'a ripe field gives its yield');
    assert.equal(sim.economy.stock.food, food + r.delivery.kept);
    assert.ok(r.delivery.kept > 0);
    assert.equal(f.growth, 0, 'the field starts again');
    assert.equal(w.log.at(-1), `release:wheat:${f.id}:false`);
    assert.equal(w.state.energy, 100 - costOf('wheat'), 'delivered: the energy stays spent');
    assert.equal(w.hand.held(), null);
  },
);

await check(
  'a farmer reaps the field while the hand holds its wheat: the hold ends and refunds',
  () => {
    const sim = morningHamlet();
    const f = ripeField(sim);
    const w = handOn(sim);
    w.moveTo(f);
    assert.ok(w.hand.pick().ok);
    f.growth = 0;
    assert.equal(w.hand.update(0.05), 'gone');
    assert.equal(w.state.energy, 100);
    assert.equal(w.hand.held(), null);
    assert.equal(w.log.at(-1), `release:wheat:${f.id}:true`);
    // The same race at the drop itself: nothing to take, the energy comes back.
    f.growth = 1;
    assert.ok(w.hand.pick().ok);
    f.growth = 0.5;
    w.moveTo(templeOf(sim));
    assert.deepEqual(w.hand.drop(), { kind: 'gone' });
    assert.equal(w.state.energy, 100);
    assert.equal(f.growth, 0.5, 'the field is as the farmers left it');
  },
);

await check('wheat is food: it is never worked on a site', () => {
  const { sim, site } = openSite();
  const f = ripeField(sim);
  const w = handOn(sim);
  w.moveTo(f);
  assert.ok(w.hand.pick().ok);
  const progress = site.progress;
  assert.deepEqual(w.hand.drop(site), { kind: 'released' }, 'a site does not take food');
  assert.equal(site.progress, progress);
});

// --- sheep ---

await check('sheep: the nearest in reach is lifted, held out of the flock and counted', () => {
  const sim = morningHamlet();
  const farm = farmOf(sim);
  const w = handOn(sim, { animals: farm.animals });
  const sheep = farm.flock.animals[0]!;
  w.moveTo(sheep);
  const r = w.hand.pick();
  assert.ok(r.ok && r.held.kind === 'sheep' && r.held.id === sheep.id, JSON.stringify(r));
  assert.equal(w.state.energy, 100 - costOf('sheep'));
  assert.equal(farm.flock.animals.length, 3);
  assert.equal(headcount(farm.flock), 4);
  assert.deepEqual(w.log, [], 'the village view is not asked to show a sheep');
  w.hand.frame(0.016, { x: sheep.x, y: 3, z: sheep.z });
  assert.deepEqual(farm.log, [`pose:${CARRY.SHEEP_SCALE}:${3 - CARRY.SHEEP_DROP_M}`]);
  assert.equal(w.hand.cancel(), true);
  assert.equal(farm.flock.animals.length, 4, 'back in the flock');
  assert.equal(w.state.energy, 100);
  assert.equal(farm.log.at(-1), 'release:back');
});

await check('sheep: without the farm the hand has no sheep to lift', () => {
  const sim = morningHamlet();
  const farm = farmOf(sim);
  const w = handOn(sim);
  w.moveTo(farm.flock.animals[0]!);
  assert.deepEqual(w.hand.pick(), { ok: false, reason: 'none' });
});

await check('sheep: delivered, it is food for the larder and the flock owes a replacement', () => {
  const sim = morningHamlet(30);
  const farm = farmOf(sim);
  const w = handOn(sim, { animals: farm.animals });
  w.moveTo(farm.flock.animals[0]!);
  assert.ok(w.hand.pick().ok);
  const food = sim.economy.stock.food;
  w.moveTo(templeOf(sim));
  const r = w.hand.drop();
  assert.ok(r.kind === 'delivered' && r.delivery.what === 'sheep', JSON.stringify(r));
  assert.equal(r.delivery.amount, H.ANIMAL_FOOD.sheep);
  assert.equal(sim.economy.stock.food, food + r.delivery.kept);
  assert.equal(farm.flock.animals.length, 3);
  assert.equal(
    farm.flock.owed.length,
    1,
    'a replacement is on its way (the flock’s own rules: animal-check)',
  );
  assert.equal(w.state.energy, 100 - costOf('sheep'));
});

// --- the overview’s cursor ---

await check(
  'looking: a look at a point leaves the orb’s target alone, and an inactive hand does not look',
  () => {
    const sim = morningHamlet();
    const [a, b] = treesNearTemple(sim, 2) as [number, number];
    let active = true;
    const w = handOn(sim, { active: () => active });
    w.moveTo(w.treeAt(a));
    w.hand.update(1);
    const seen = w.hand.target();
    assert.ok(seen && seen.id === a, 'the orb stands at the first tree');
    const other = w.hand.targetAt(w.treeAt(b));
    assert.ok(other && other.id === b, 'the cursor is at the second');
    assert.equal(w.hand.target()?.id, a, 'the orb’s target is still the first');
    assert.equal(seen.id, a, 'and the object it handed out was not rewritten');
    active = false;
    w.hand.update(1);
    assert.equal(w.hand.target(), null, 'nobody is looking: nothing is aimed at');
    assert.ok(w.hand.targetAt(w.treeAt(b)), 'but a look at a point still works');
  },
);

await check('overview aim: the hand looks at the cursor, not at the orb', () => {
  const sim = morningHamlet();
  const w = handOn(sim);
  const id = treeNearTemple(sim);
  const at = w.treeAt(id);
  // The orb stays at the origin, far from every tree.
  assert.equal(w.hand.target(), null);
  const seen = w.hand.targetAt(at);
  assert.ok(seen && seen.kind === 'tree' && seen.id === id, JSON.stringify(seen));
  assert.equal(w.hand.targetAt({ x: -9999, z: -9999 }), null);
  const r = w.hand.pick(at);
  assert.ok(r.ok && r.held.id === id, JSON.stringify(r));
  assert.equal(w.hand.targetAt(at), null, 'nothing to aim at while the hand is full');
  assert.deepEqual(w.log, [`lift:tree:${id}`]);
});

await check('put back: the thing stays where it was and the effort is lost, once', () => {
  const sim = morningHamlet();
  const w = handOn(sim);
  assert.equal(w.hand.putBack(), false, 'nothing held, nothing to put back');
  assert.equal(w.state.energy, 100);
  const id = treeNearTemple(sim);
  const forest = JSON.stringify(sim.forest.serialize());
  assert.ok(w.hand.pick(w.treeAt(id)).ok);
  assert.equal(w.hand.putBack(), true);
  assert.equal(w.hand.held(), null);
  assert.equal(w.hand.energyOnHold(), 0);
  assert.equal(w.state.energy, 100 - costOf('tree'), 'forfeited, unlike a cancel');
  assert.equal(JSON.stringify(sim.forest.serialize()), forest, 'the tree never left');
  assert.equal(w.hand.putBack(), false, 'a second call changes nothing');
  assert.deepEqual(w.log, [`lift:tree:${id}`, `release:tree:${id}:true`]);
  // It can be lifted again once the effort is paid for again.
  assert.ok(w.hand.pick(w.treeAt(id)).ok);
  assert.equal(w.state.energy, 100 - 2 * costOf('tree'));
});

await check(
  'overview parity: lifting and putting down at points leaves the village as flying there does',
  () => {
    const build = () => {
      const sim = morningHamlet(30);
      return sim;
    };
    const flown = build();
    const clicked = build();
    const roam = handOn(flown);
    const overview = handOn(clicked);
    const id = treeNearTemple(flown);
    const tree = roam.treeAt(id);
    const temple = templeOf(flown);

    roam.moveTo(tree);
    assert.ok(roam.hand.pick().ok);
    roam.moveTo(temple);
    const a = roam.hand.drop();

    // The overview's orb never moves: the cursor picks the tree, then the temple (a roof clicked high up
    // lands the ground ray far behind it, so the building's middle stands for it).
    assert.ok(overview.hand.pick(tree).ok);
    assert.equal(overview.hand.zone({ x: temple.x, z: temple.z })?.zone, 'store');
    const b = overview.hand.drop({ x: temple.x, z: temple.z });

    assert.ok(a.kind === 'delivered' && b.kind === 'delivered');
    assert.deepEqual(a.delivery, b.delivery);
    assert.equal(savedHash(clicked), savedHash(flown), 'the same village either way');
    assert.deepEqual({ ...clicked.economy.stock }, { ...flown.economy.stock });
    assert.equal(overview.state.energy, roam.state.energy);
    assert.deepEqual(
      Array.from(clicked.villagers.belief),
      Array.from(flown.villagers.belief),
      'and the same witnesses were impressed',
    );
  },
);
finish('all hand runtime checks passed');
