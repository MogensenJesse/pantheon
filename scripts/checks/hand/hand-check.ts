// scripts/checks/hand/hand-check.ts — headless checks of the orb's hand: what it may take, where it may be put
// down, what a hold costs and gives back, and what the village makes of a deed (belief), on a real hamlet.
// Run: node --experimental-strip-types scripts/checks/hand/hand-check.ts
import assert from 'node:assert/strict';
import { PHASE0 } from '../../../src/config/phase0.ts';
import { VILLAGE } from '../../../src/config/village.ts';
import {
  beliefOf,
  createDeedLedger,
  type DeedWorld,
  witnessesWithin,
} from '../../../src/hand/deeds.ts';
import {
  classifyDrop,
  costOf,
  createHand,
  distanceTo,
  insideBuilding,
  isRipe,
  meetsNeed,
  pickTarget,
  reachOf,
} from '../../../src/hand/handRules.ts';
import type { HandCandidate, HandEnergy } from '../../../src/hand/handTypes.ts';
import {
  Activity,
  type Building,
  Role,
  type VillageEvent,
} from '../../../src/world/village/model/types.ts';
import { shortages } from '../../../src/world/village/sim/economy.ts';
import type { VillageSim } from '../../../src/world/village/sim/villageSim.ts';
import { check, finish } from '../lib/check.ts';
import {
  DAY_S,
  DT,
  dayPhaseAt,
  loadMap,
  makeSim,
  savedHash,
  stepSim,
} from '../lib/villageHeadless.ts';

const H = VILLAGE.HAND;
const D = H.DEED;
const map = loadMap('island-mountain');

const meter = (start: number) => {
  const state = { energy: start };
  const energy: HandEnergy = {
    amount: () => state.energy,
    spend: (n) => {
      state.energy -= n;
    },
    refund: (n) => {
      state.energy += n;
    },
  };
  return { state, energy };
};

const building = (over: Partial<Building>): Building => ({
  id: 1,
  type: 'house_a',
  x: 0,
  z: 0,
  rotY: 0,
  halfW: 2,
  halfD: 2,
  plinthTopY: 0,
  plinthBaseY: 0,
  stage: 2,
  progress: 0,
  level: 1,
  upgrade: 0,
  ring: 0,
  ...over,
});

const tree = (id: number, x: number, z = 0): HandCandidate => ({ kind: 'tree', id, x, z });

// --- aim ---

await check('aim: the nearest thing within the reach of its kind, and nothing out of reach', () => {
  const at = { x: 0, z: 0 };
  const sheep: HandCandidate = { kind: 'sheep', id: 7, x: 1, z: 0 };
  assert.equal(pickTarget([tree(2, 3), tree(1, 5), sheep], at)?.id, 7, 'the sheep is nearest');
  assert.equal(pickTarget([tree(2, 3), tree(1, 5)], at)?.id, 2, 'then the nearer tree');
  assert.equal(pickTarget([tree(1, reachOf('tree') + 0.1)], at), null, 'a tree out of reach');
  assert.equal(
    pickTarget([{ kind: 'sheep', id: 1, x: reachOf('sheep') + 0.1, z: 0 }], at),
    null,
    'a sheep has its own, shorter reach',
  );
  assert.equal(pickTarget([], at), null);
  assert.ok(pickTarget([tree(2, 3)], at, 1)?.id === 2);
  assert.equal(
    pickTarget([tree(2, 3)], at, 0.4),
    null,
    'a shorter reach (the skill tree) misses it',
  );
  assert.equal(pickTarget([tree(2, 3)], at, 2)?.id, 2);
  assert.equal(reachOf('tree', 1.6), H.REACH_M.tree * 1.6);
});

await check('aim: a tie goes to the lower kind and id, so the ring never flickers', () => {
  const at = { x: 0, z: 0 };
  assert.equal(pickTarget([tree(5, 3), tree(4, -3)], at)?.id, 4);
  assert.equal(pickTarget([tree(4, -3), tree(5, 3)], at)?.id, 4, 'whatever the order');
  const sheep: HandCandidate = { kind: 'sheep', id: 1, x: 0, z: 3 };
  assert.equal(pickTarget([sheep, tree(9, 3)], at)?.kind, 'tree', 'a tree before a sheep');
});

await check('aim: a field is an area, measured to its edge and turned with it', () => {
  const field: HandCandidate = {
    kind: 'wheat',
    id: 3,
    x: 10,
    z: 0,
    area: { halfW: 4, halfD: 2, rotY: 0 },
  };
  assert.equal(distanceTo(field, { x: 10, z: 1 }), 0, 'inside');
  assert.ok(Math.abs(distanceTo(field, { x: 0, z: 0 }) - 6) < 1e-9, 'six metres from the edge');
  assert.equal(pickTarget([field], { x: 0, z: 0 }), null);
  assert.equal(pickTarget([field], { x: 6 - reachOf('wheat') + 0.1, z: 0 })?.id, 3);
  const turned: HandCandidate = {
    ...field,
    x: 0,
    z: 10,
    area: { halfW: 4, halfD: 2, rotY: Math.PI / 2 },
  };
  assert.ok(distanceTo(turned, { x: 0, z: 7 }) < 1e-6, 'its long side now runs along z');
  assert.ok(Math.abs(distanceTo(turned, { x: 3, z: 10 }) - 1) < 1e-6, 'and it is 2 m wide in x');
  assert.equal(isRipe(H.WHEAT.MIN_RIPE), true);
  assert.equal(isRipe(H.WHEAT.MIN_RIPE - 0.01), false);
});

// --- where it may be put down ---

const temple = building({ id: 1, type: 'temple', halfW: 5, halfD: 5 });
const site = building({ id: 2, type: 'house_b', x: 20, stage: 0 });
const granary = building({ id: 3, type: 'granary', x: -20 });
const upgrading = building({ id: 4, type: 'workshop', z: 20, upgrade: 100 });
const house = building({ id: 5, type: 'house_a', x: 40 });
const all = [temple, site, granary, upgrading, house];

await check('drop zones: wood to a store or, better, to a site; food only to a store', () => {
  const zoneAt = (good: 'wood' | 'food', x: number, z: number) => {
    const d = classifyDrop(good, { x, z }, all);
    return d.zone === 'none' ? 'none' : `${d.zone}:${d.building.id}`;
  };
  assert.equal(zoneAt('wood', 0, 0), 'store:1', 'the temple takes wood');
  assert.equal(zoneAt('food', 0, 0), 'store:1', 'and food');
  assert.equal(zoneAt('wood', 20, 0), 'site:2', 'wood at a site is work');
  assert.equal(zoneAt('food', 20, 0), 'none', 'a site takes no food');
  assert.equal(zoneAt('food', -20, 0), 'store:3');
  assert.equal(
    zoneAt('wood', 0, 20),
    'site:4',
    'a finished building with an upgrade under way is a site for wood',
  );
  assert.equal(
    zoneAt('food', 0, 20),
    'store:4',
    'and it is a store too: food goes in, not into the upgrade',
  );
});

await check('drop zones: the margin, houses, unfinished stores and the nearest of several', () => {
  const margin = H.ZONE_MARGIN_M;
  assert.equal(insideBuilding(site, { x: 20 + site.halfW + margin - 0.01, z: 0 }, margin), true);
  assert.equal(insideBuilding(site, { x: 20 + site.halfW + margin + 0.01, z: 0 }, margin), false);
  assert.equal(classifyDrop('wood', { x: 40, z: 0 }, all).zone, 'none', 'a house is not a store');
  const unbuilt = building({ id: 6, type: 'granary', x: 60, stage: 1 });
  assert.equal(
    classifyDrop('food', { x: 60, z: 0 }, [unbuilt]).zone,
    'none',
    'a granary still a frame',
  );
  assert.equal(
    classifyDrop('wood', { x: 60, z: 0 }, [unbuilt]).zone,
    'site',
    'but a site for wood',
  );
  const near = building({ id: 7, type: 'house_c', x: 6, stage: 0 });
  const far = building({ id: 8, type: 'house_c', x: 9, stage: 0 });
  const d = classifyDrop('wood', { x: 7, z: 0 }, [far, temple, near]);
  assert.ok(
    d.zone === 'site' && d.building.id === 7,
    'a site wins over the temple, the nearest site wins',
  );
  // turned buildings: a long side along z
  const turned = building({
    id: 9,
    type: 'granary',
    x: 0,
    z: 0,
    halfW: 6,
    halfD: 1,
    rotY: Math.PI / 2,
  });
  assert.equal(classifyDrop('food', { x: 0, z: 5 }, [turned]).zone, 'store');
  assert.equal(classifyDrop('food', { x: 5, z: 0 }, [turned]).zone, 'none', 'it is not 5 m wide');
});

await check('needs: wood at a site, or goods a store was short of, count as meeting one', () => {
  const short = { food: true, wood: false };
  const s = classifyDrop('wood', { x: 20, z: 0 }, all);
  const t = classifyDrop('food', { x: 0, z: 0 }, all);
  assert.equal(
    meetsNeed('wood', s, { food: false, wood: false }),
    true,
    'a site is always waiting',
  );
  assert.equal(meetsNeed('food', t, short), true, 'an empty larder');
  assert.equal(
    meetsNeed('wood', classifyDrop('wood', { x: 0, z: 0 }, all), short),
    false,
    'wood is not short',
  );
  assert.equal(meetsNeed('food', { zone: 'none' }, short), false, 'nothing delivered');
  assert.deepEqual(
    shortages({ wood: 0, food: 0 }, 5),
    { food: true, wood: true },
    'the sim agrees',
  );
});

// --- the hold ---

await check(
  'the hold: one thing at a time, paid at pickup, and only a forced end gives it back',
  () => {
    const { state, energy } = meter(100);
    const hand = createHand(energy);
    const cost = costOf('tree');
    assert.equal(hand.held(), null);
    assert.equal(hand.pick(tree(1, 3), cost), 'ok');
    assert.equal(state.energy, 100 - cost, 'paid at pickup');
    assert.equal(hand.held()?.id, 1);
    assert.equal(hand.pick(tree(2, 4), cost), 'busy', 'the hand is full');
    assert.equal(state.energy, 100 - cost, 'and a refused pick costs nothing');

    assert.equal(hand.release('delivered')?.id, 1);
    assert.equal(state.energy, 100 - cost, 'delivered: the energy stays spent');
    assert.equal(hand.held(), null);

    assert.equal(hand.pick(tree(3, 3), cost), 'ok');
    assert.equal(hand.release('voluntary')?.id, 3);
    assert.equal(state.energy, 100 - 2 * cost, 'letting go outside a zone forfeits the energy');

    assert.equal(hand.pick(tree(4, 3), cost), 'ok');
    assert.equal(hand.release('forced')?.id, 4);
    assert.equal(state.energy, 100 - 2 * cost, 'a forced end gives it back');
  },
);

await check('the hold: ending it twice changes nothing, and a short orb cannot lift', () => {
  const { state, energy } = meter(100);
  const hand = createHand(energy);
  hand.pick(tree(1, 3), 10);
  assert.ok(hand.release('forced'));
  assert.equal(hand.release('forced'), null, 'a second cancel');
  assert.equal(state.energy, 100, 'refunded once');
  assert.equal(hand.release('voluntary'), null);
  assert.equal(hand.release('delivered'), null);

  const poor = meter(5);
  const empty = createHand(poor.energy);
  assert.equal(empty.pick(tree(1, 3), 10), 'energy');
  assert.equal(poor.state.energy, 5);
  assert.equal(empty.held(), null);
  assert.equal(empty.pick(tree(1, 3), 5), 'ok', 'exactly enough is enough');
  assert.equal(poor.state.energy, 0);

  assert.equal(costOf('tree', 0.6), H.COST.tree * 0.6, 'the skill tree cuts the cost');
  assert.ok(costOf('wheat') < costOf('tree') && costOf('sheep') < costOf('tree'), 'wood is heavy');
});

// --- deeds ---

/** A hamlet some way into a morning, with its villagers in a row we control. */
function hamlet() {
  const sim = makeSim(map, { mode: 'hamlet' });
  stepSim(sim, { seconds: 60, phase: () => 0.4 });
  const events: VillageEvent[] = [];
  const world = (over: Partial<DeedWorld> = {}): DeedWorld => ({
    villagers: sim.villagers,
    addBelief: (i, amount) => sim.addBelief(i, amount, events),
    notice: sim.notice,
    ...over,
  });
  return { sim, events, world };
}

const AT = { x: 0, z: 0 };

/** Puts villager `i` at distance `d` from AT, outdoors, awake, alive, with no belief. */
function place(sim: VillageSim, i: number, d: number) {
  const v = sim.villagers;
  v.x[i] = d;
  v.z[i] = 0;
  v.indoors[i] = 0;
  v.dying[i] = 0;
  v.activity[i] = Activity.Work;
  v.belief[i] = 0;
}

/** Everyone far away except `near`, who stands at the given distances. */
function stage(sim: VillageSim, near: number[]) {
  const v = sim.villagers;
  assert.ok(v.count >= 6, `${v.count} villagers`);
  for (let i = 0; i < v.count; i++) place(sim, i, 1e6 + i);
  for (const [i, d] of near.entries()) place(sim, i, d);
}

await check('witnesses: outdoors, awake, alive and in range, and nobody else', () => {
  const { sim, world } = hamlet();
  stage(sim, [2, 2, 2, 2, D.WITNESS_M + 1, D.WITNESS_M - 1]);
  sim.villagers.indoors[1] = 1;
  sim.villagers.activity[2] = Activity.Sleep;
  sim.villagers.dying[3] = 0.5;
  assert.deepEqual(witnessesWithin(world(), AT, D.WITNESS_M), [0, 5]);
});

await check(
  'a deed: witnesses gain belief by its worth and stop to look; a delivery is worth more',
  () => {
    const { sim, world } = hamlet();
    stage(sim, [3, 5, 7]);
    const ledger = createDeedLedger(world());
    const lift = ledger.perform({ kind: 'lift', what: 'tree', at: AT });
    assert.deepEqual(lift.impressed, [0, 1, 2]);
    assert.deepEqual(lift.converted, []);
    for (const i of [0, 1, 2]) assert.ok(Math.abs(sim.villagers.belief[i]! - D.LIFT_BELIEF) < 1e-6);
    const drop = ledger.perform({ kind: 'deliver', what: 'tree', at: AT });
    assert.deepEqual(drop.impressed, [0, 1, 2], 'a delivery has its own cooldown, not the lift’s');
    assert.ok(
      Math.abs(sim.villagers.belief[0]! - (D.LIFT_BELIEF + D.DELIVER_BELIEF)) < 1e-6,
      `${sim.villagers.belief[0]}`,
    );
    assert.ok(
      beliefOf({ kind: 'deliver', what: 'tree' }) > beliefOf({ kind: 'lift', what: 'tree' }),
    );
    assert.equal(
      beliefOf({ kind: 'deliver', what: 'tree', needMet: true }),
      beliefOf({ kind: 'deliver', what: 'tree' }) * D.NEED_MUL,
      'an open need doubles it',
    );
    assert.equal(
      beliefOf({ kind: 'lift', what: 'tree', needMet: true }),
      beliefOf({ kind: 'lift', what: 'tree' }),
      'a lift meets no need',
    );
    assert.ok(
      beliefOf({ kind: 'deliver', what: 'wheat' }) < beliefOf({ kind: 'deliver', what: 'tree' }),
    );
  },
);

await check(
  'a deed: nobody is paid twice inside the cooldown, so lift and cancel cannot be farmed',
  () => {
    const { sim, world } = hamlet();
    stage(sim, [3, 5]);
    const ledger = createDeedLedger(world());
    const lift = { kind: 'lift', what: 'tree', at: AT } as const;
    assert.equal(ledger.perform(lift).impressed.length, 2);
    const once = sim.villagers.belief[0]!;
    for (let k = 0; k < 20; k++) {
      ledger.update(1);
      assert.equal(
        ledger.perform(lift).impressed.length,
        0,
        `second ${k + 1} of ${D.LIFT_COOLDOWN_S}`,
      );
      if (k + 2 >= D.LIFT_COOLDOWN_S) break;
    }
    assert.equal(sim.villagers.belief[0], once, 'no belief from the repeats');
    assert.ok(ledger.cooldown(0, 'lift') > 0);
    ledger.update(D.LIFT_COOLDOWN_S);
    assert.equal(ledger.cooldown(0, 'lift'), 0);
    assert.equal(ledger.perform(lift).impressed.length, 2, 'paid again when it has run out');
  },
);

await check('a deed: witnesses stop and look even when they cannot be paid', () => {
  const { sim, world } = hamlet();
  stage(sim, [3, 5]);
  const looked: number[] = [];
  const ledger = createDeedLedger(
    world({
      canBelieve: () => false,
      notice: (i) => {
        looked.push(i);
        return true;
      },
    }),
  );
  const r = ledger.perform({ kind: 'deliver', what: 'tree', at: AT, needMet: true });
  assert.deepEqual(r.witnesses, [0, 1]);
  assert.deepEqual(looked, [0, 1], 'the elder looks too');
  assert.deepEqual(r.impressed, [], 'but his belief waits for his quest step');
  assert.equal(sim.villagers.belief[0], 0);
  assert.equal(ledger.cooldown(0, 'deliver'), 0, 'and an unpaid look starts no cooldown');
});

await check('the elder gate: only the elder is held back, and only until his step', () => {
  const { sim, world } = hamlet();
  stage(sim, [3, 5, 7]);
  let open = false;
  const ledger = createDeedLedger(world({ canBelieve: (i) => i !== 1 || open }));
  assert.deepEqual(ledger.perform({ kind: 'deliver', what: 'tree', at: AT }).impressed, [0, 2]);
  ledger.update(D.DELIVER_COOLDOWN_S);
  open = true;
  assert.deepEqual(ledger.perform({ kind: 'deliver', what: 'tree', at: AT }).impressed, [0, 1, 2]);
});

await check('deeds count whatever the stores hold: a full larder and woodshed pay the same', () => {
  const { sim, world } = hamlet();
  stage(sim, [3, 5]);
  sim.economy.addWood(Number.POSITIVE_INFINITY);
  sim.economy.addFood(Number.POSITIVE_INFINITY);
  const r = createDeedLedger(world()).perform({ kind: 'deliver', what: 'tree', at: AT });
  assert.deepEqual(r.impressed, [0, 1]);
  assert.ok(sim.villagers.belief[0]! > 0);
});

await check(
  'belief reaches exactly full: the last small payout converts even when rounding falls short',
  () => {
    // a world whose belief is a float32 that adds a fixed small step, as the sim's does
    const belief = new Float32Array(1);
    const pool = {
      count: 1,
      x: new Float32Array(1),
      z: new Float32Array(1),
      indoors: new Uint8Array(1),
      dying: new Float32Array(1),
      activity: new Uint8Array(1).fill(Activity.Work),
      belief,
    };
    // fifty float32 steps of a fiftieth end a hair under 1 (0.9999996)
    const step = 0.02;
    let adds = 0;
    const converted: number[] = [];
    const ledger = createDeedLedger({
      villagers: pool as never,
      addBelief: (i, amount) => {
        const before = belief[i]!;
        belief[i] = Math.min(1, before + (amount >= 1 ? 1 : step));
        adds++;
        if (before < 1 && belief[i]! >= 1) {
          converted.push(i);
          return true;
        }
        return false;
      },
    });
    let n = 0;
    while (converted.length === 0 && n < 60) {
      n++;
      ledger.update(D.DELIVER_COOLDOWN_S);
      ledger.perform({ kind: 'deliver', what: 'tree', at: AT });
    }
    assert.equal(converted.length, 1, 'converted once');
    assert.equal(belief[0], 1, 'and exactly 1');
    assert.equal(n, Math.round(1 / step), 'on the last small payout, not one later');
    assert.equal(adds, n + 1, 'which took one more nudge to full');
  },
);

await check(
  'a villager who dies leaves the pool: their cooldown goes and the last one’s follows its slot',
  () => {
    const { sim, world } = hamlet();
    stage(sim, [3, 5, 7]);
    const ledger = createDeedLedger(world());
    ledger.perform({ kind: 'deliver', what: 'tree', at: AT });
    ledger.update(4);
    const left = ledger.cooldown(2, 'deliver');
    assert.ok(left > 0);
    ledger.villagerRemoved(0, 2); // villager 0 died, villager 2 moved into slot 0
    assert.equal(
      ledger.cooldown(0, 'deliver'),
      left,
      'slot 0 carries the cooldown of the villager who moved',
    );
    assert.equal(ledger.cooldown(2, 'deliver'), 0);
    ledger.villagerRemoved(1, -1); // the last one died: nobody moved
    assert.equal(ledger.cooldown(1, 'deliver'), 0);
  },
);

// --- a village ---

/**
 * A plausible player. By day they take the standing tree nearest a woodcutter at work (who sees it lifted) to
 * the temple, one tree every `cycleS` seconds; at night nobody is out, so they wait for the morning. Plays
 * until `until` holds or `maxTrees` trees were delivered; returns the trees delivered.
 */
function playTrees(
  sim: VillageSim,
  o: { cycleS: number; maxTrees: number; until?: () => boolean },
): number {
  const events: VillageEvent[] = [];
  const v = sim.villagers;
  const hut = sim.buildings.find((b) => b.type === 'temple')!;
  const ledger = createDeedLedger({
    villagers: v,
    addBelief: (i, amount) => sim.addBelief(i, amount, events),
    notice: sim.notice,
    canBelieve: (i) => i !== sim.elder,
  });
  const { SUNRISE, SUNSET } = PHASE0.DAY;
  let t = 0;
  let trees = 0;
  while (trees < o.maxTrees && t < 4 * DAY_S) {
    stepSim(sim, { seconds: o.cycleS, from: t, onStep: () => ledger.update(DT) });
    t += o.cycleS;
    const phase = dayPhaseAt(t);
    if (phase < SUNRISE + 0.02 || phase > SUNSET - 0.03) continue;
    let near: { x: number; z: number } = hut;
    for (let i = 0; i < v.count; i++) {
      if (v.role[i] === Role.Woodcutter && !v.indoors[i]) {
        near = { x: v.x[i]!, z: v.z[i]! };
        break;
      }
    }
    const id = sim.forest.nearest(near.x, near.z, 1)[0]!;
    ledger.perform({ kind: 'lift', what: 'tree', at: sim.forest.info(id) });
    sim.economy.addWood(sim.uprootTree(id, events));
    const drop = classifyDrop('wood', hut, sim.buildings);
    assert.equal(drop.zone, 'store', 'the temple takes wood');
    const needMet = meetsNeed('wood', drop, shortages(sim.economy.stock, v.count));
    ledger.perform({ kind: 'deliver', what: 'tree', at: hut, needMet });
    trees++;
    if (o.until?.()) break;
  }
  return trees;
}

await check('pacing: deeds alone convert five villagers in about a dozen minutes of play', () => {
  const sim = makeSim(map, { mode: 'hamlet' });
  const cycleS = 40;
  const goal = PHASE0.QUEST.CONVERTS_GOAL;
  const trees = playTrees(sim, { cycleS, maxTrees: 60, until: () => sim.believers() >= goal });
  assert.ok(sim.believers() >= goal, `${sim.believers()} believers after ${trees} trees`);
  const minutes = (trees * cycleS) / 60;
  console.log(
    `     ${trees} trees, about ${minutes.toFixed(0)} min of deeds for ${goal} believers`,
  );
  assert.ok(trees >= 10, `${trees} trees is too quick: belief should be earned`);
  assert.ok(trees <= 24, `${trees} trees is too slow`);
});

await check(
  'determinism: the same deeds give the same village, and an idle hand changes nothing',
  () => {
    const run = () => {
      const sim = makeSim(map, { mode: 'hamlet' });
      playTrees(sim, { cycleS: 30, maxTrees: 3 });
      return savedHash(sim);
    };
    assert.equal(run(), run());

    const plain = makeSim(map, { mode: 'hamlet' });
    stepSim(plain, { seconds: 90 });
    const idle = makeSim(map, { mode: 'hamlet' });
    const ledger = createDeedLedger({ villagers: idle.villagers, addBelief: () => false });
    createHand(meter(100).energy);
    stepSim(idle, { seconds: 90, onStep: () => ledger.update(DT) });
    assert.equal(
      savedHash(idle),
      savedHash(plain),
      'a hand that does nothing leaves the sim alone',
    );
  },
);

finish('all hand checks passed');
