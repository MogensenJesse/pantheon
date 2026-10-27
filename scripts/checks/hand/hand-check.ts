// scripts/checks/hand/hand-check.ts — headless checks of the orb's hand: what it may take, where it may be put
// down, what a hold costs and gives back, and what the village makes of a deed (belief), on a real hamlet.
// Run: node --experimental-strip-types scripts/checks/hand/hand-check.ts
import assert from 'node:assert/strict';
import { PHASE0 } from '../../../src/config/phase0.ts';
import { VILLAGE } from '../../../src/config/village.ts';
import { hand } from '../../../src/config/visual/hand.ts';
import { insideFootprint } from '../../../src/core/math/geom.ts';
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
  isRipe,
  meetsNeed,
  pickTarget,
  reachOf,
} from '../../../src/hand/handRules.ts';
import {
  createHandRuntime,
  type HandAnimals,
  type HandPorts,
} from '../../../src/hand/handRuntime.ts';
import type { HandCandidate, HandEnergy } from '../../../src/hand/handTypes.ts';
import { canArm, clickOwner, overviewPlace } from '../../../src/hand/overviewAim.ts';
import {
  type AnimalEnv,
  addAnimal,
  animalsWithin,
  createFlock,
  headcount,
  liftAnimal,
  releaseAnimal,
  stepFlock,
  stepOwed,
} from '../../../src/life/animals/animalSim.ts';
import {
  CONVERSION_QUEST,
  elderOpenToBelief,
  isDusk,
} from '../../../src/quests/content/conversion.ts';
import { newQuestState, type QuestEvent, stepQuest } from '../../../src/quests/quest.ts';
import type { CarriedPose } from '../../../src/world/village/model/carried.ts';
import {
  Activity,
  type Building,
  type RemoteSite,
  Role,
  type VillageEvent,
} from '../../../src/world/village/model/types.ts';
import { shortages } from '../../../src/world/village/sim/economy.ts';
import { TreeState, yieldOf } from '../../../src/world/village/sim/forest.ts';
import { localToWorld } from '../../../src/world/village/sim/geometry.ts';
import type { VillageSim } from '../../../src/world/village/sim/villageSim.ts';
import { check, finish } from '../lib/check.ts';
import { world as questWorld } from '../lib/questFixtures.ts';
import {
  convertVillage,
  DAY_S,
  DT,
  dayPhaseAt,
  loadMap,
  makeSim,
  savedHash,
  stepSim,
} from '../lib/villageHeadless.ts';

const H = VILLAGE.HAND;
const CARRY = hand.CARRY;
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
    if (d.zone === 'none') return 'none';
    return d.zone === 'remote' ? `remote:${d.site.id}` : `${d.zone}:${d.building.id}`;
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
  assert.equal(insideFootprint(site, 20 + site.halfW + margin - 0.01, 0, margin), true);
  assert.equal(insideFootprint(site, 20 + site.halfW + margin + 0.01, 0, margin), false);
  // The same test as the animals' and the overview's, so one turned frame answers for all three.
  const frame = { x: 10, z: 10, rotY: Math.PI / 2, halfW: 6, halfD: 1 };
  assert.equal(insideFootprint(frame, 10, 15), true, 'its long side now runs along z');
  assert.equal(insideFootprint(frame, 15, 10), false, 'and it is 2 m wide in x');
  assert.equal(insideFootprint(frame, 15, 10, 4.5), true, 'a margin grows it on every side');
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

/** A remote site (a restoration or an outpost) as the hand sees it: only where it is and how far along. */
const remoteSite = (over: Partial<RemoteSite>): RemoteSite => ({
  id: 1,
  kind: 'tree',
  x: 540,
  z: 0,
  campX: 500,
  campZ: 0,
  stage: 0,
  progress: 0,
  route: [],
  ...over,
});

await check(
  'remote sites: wood at the camp or the place is the crew’s work; food, far away and a finished site are not',
  () => {
    const R = H.REMOTE_DROP_M;
    const camp = remoteSite({});
    const wood = (x: number, z: number, sites = [camp]) =>
      classifyDrop('wood', { x, z }, all, sites);
    const atCamp = wood(500, 0);
    assert.ok(atCamp.zone === 'remote' && atCamp.site.id === 1, JSON.stringify(atCamp.zone));
    assert.deepEqual(
      atCamp.zone === 'remote' && [atCamp.x, atCamp.z],
      [500, 0],
      'the ring hangs at the camp',
    );
    const atPlace = wood(540 + R - 0.1, 0);
    assert.ok(atPlace.zone === 'remote' && atPlace.x === 540, 'the place itself counts too');
    assert.equal(wood(500 + R + 0.1, 0).zone, 'none', 'just outside the camp');
    assert.equal(wood(540 - R - 0.1, 0).zone, 'none', 'and just outside the place');
    assert.equal(classifyDrop('food', { x: 500, z: 0 }, all, [camp]).zone, 'none', 'no food');
    assert.equal(wood(500, 0, [remoteSite({ stage: 2 })]).zone, 'none', 'a finished site');
    assert.equal(wood(500, 0, []).zone, 'none', 'no sites');
    assert.equal(classifyDrop('wood', { x: 500, z: 0 }, all).zone, 'none', 'and no sites given');
    // of two camps the nearer middle wins
    const near = remoteSite({ id: 2, campX: 506 });
    const both = wood(504, 0, [camp, near]);
    assert.ok(both.zone === 'remote' && both.site.id === 2, 'the nearer camp');
    // a building zone is looked at first
    const atTemple = remoteSite({ id: 3, campX: temple.x, campZ: temple.z });
    assert.equal(wood(temple.x, temple.z, [atTemple]).zone, 'store', 'the temple comes first');
    // and it is always a need
    assert.equal(meetsNeed('wood', atCamp, { food: false, wood: false }), true);
  },
);

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
 * One trip of a plausible player: the standing tree nearest a woodcutter at work (who sees it lifted) goes to the
 * temple, where everyone about sees it put down.
 */
function deliverTree(sim: VillageSim, ledger: ReturnType<typeof createDeedLedger>) {
  const events: VillageEvent[] = [];
  const v = sim.villagers;
  const hut = sim.buildings.find((b) => b.type === 'temple')!;
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
}

/** Daylight hours: the villagers are out and about. */
const isDaytime = (phase: number) =>
  phase >= PHASE0.DAY.SUNRISE + 0.02 && phase <= PHASE0.DAY.SUNSET - 0.03;

/**
 * A plausible player. By day they take a tree to the temple every `cycleS` seconds; at night nobody is out, so
 * they wait for the morning. Plays until `until` holds or `maxTrees` trees were delivered; returns the trees
 * delivered.
 */
function playTrees(
  sim: VillageSim,
  o: { cycleS: number; maxTrees: number; until?: () => boolean },
): number {
  const events: VillageEvent[] = [];
  const ledger = createDeedLedger({
    villagers: sim.villagers,
    addBelief: (i, amount) => sim.addBelief(i, amount, events),
    notice: sim.notice,
    canBelieve: (i) => i !== sim.elder,
  });
  let t = 0;
  let trees = 0;
  while (trees < o.maxTrees && t < 4 * DAY_S) {
    stepSim(sim, { seconds: o.cycleS, from: t, onStep: () => ledger.update(DT) });
    t += o.cycleS;
    if (!isDaytime(dayPhaseAt(t))) continue;
    deliverTree(sim, ledger);
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
  'the whole conversion quest finishes on deeds alone: believers, the dusk fire, the offering, the elder',
  () => {
    const sim = makeSim(map, { mode: 'hamlet' });
    const events: VillageEvent[] = [];
    const v = sim.villagers;
    let state = newQuestState();
    const send = (event: QuestEvent) => {
      const ctx = questWorld({
        converts: sim.believers(),
        elderBelieves: sim.elder >= 0 && v.belief[sim.elder]! >= 1,
        population: v.count,
      });
      state = stepQuest(CONVERSION_QUEST, state, event, ctx).state;
    };
    const stepId = () => CONVERSION_QUEST.steps[state.step]?.id;
    const ledger = createDeedLedger({
      villagers: v,
      addBelief: (i, amount) => sim.addBelief(i, amount, events),
      notice: sim.notice,
      // The elder waits for his own step, as the game's quest runtime holds him.
      canBelieve: (i) => i !== sim.elder || elderOpenToBelief(CONVERSION_QUEST, state),
    });
    send({ type: 'elderMet' });
    const cycleS = 40;
    let t = 0;
    let trees = 0;
    const seen: string[] = [];
    while (!state.done && t < 8 * DAY_S) {
      stepSim(sim, { seconds: cycleS, from: t, onStep: () => ledger.update(DT) });
      t += cycleS;
      const phase = dayPhaseAt(t);
      const id = stepId();
      if (id && seen.at(-1) !== id) seen.push(id);
      if (id === 'offering') {
        send({ type: 'offered', amount: PHASE0.QUEST.OFFERING_GOAL });
      } else if (id === 'fire') {
        // Only wood brought to the temple at dusk lights it.
        if (!isDusk(phase)) continue;
        deliverTree(sim, ledger);
        trees++;
        send({ type: 'deed', what: 'tree', nearTemple: true, dusk: true });
      } else if (isDaytime(phase)) {
        deliverTree(sim, ledger);
        trees++;
        send({ type: 'tick' });
      }
    }
    assert.ok(state.done, `the quest is at ${stepId()} after ${trees} trees`);
    assert.deepEqual(seen, ['convert', 'fire', 'offering', 'believe']);
    assert.ok(trees <= 70, `${trees} trees is too many`);
    console.log(
      `     whole quest: ${trees} trees, ${(t / 60).toFixed(0)} min of play (${(t / DAY_S).toFixed(1)} days)`,
    );
  },
);

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

// --- the hand at work ---

/** A hamlet with a hand on it. Every call the hand makes to the view is written to `log`. */
function handOn(sim: VillageSim, over: Partial<HandPorts> = {}, energy = 100) {
  const events: VillageEvent[] = [];
  const log: string[] = [];
  const poses: CarriedPose[] = [];
  const m = meter(energy);
  let orb = { x: 0, z: 0 };
  const ports: HandPorts = {
    energy: m.energy,
    orb: () => orb,
    village: {
      sim,
      uprootTree: (id) => sim.uprootTree(id, events),
      takeHarvest: (id) => sim.takeHarvest(id),
      haul: (siteId, wood) => sim.haul(siteId, wood, events),
      haulRemote: (siteId, wood) => sim.haulRemote(siteId, wood, events),
      carry: {
        lift: (what, id) => {
          log.push(`lift:${what}:${id}`);
          return true;
        },
        pose: (what, id, pose) => {
          log.push(`pose:${what}:${id}`);
          poses.push(pose);
        },
        release: (what, id, putBack) => {
          log.push(`release:${what}:${id}:${putBack}`);
        },
      },
    },
    deeds: {
      villagers: sim.villagers,
      addBelief: (i, amount) => sim.addBelief(i, amount, events),
      notice: sim.notice,
    },
    ...over,
  };
  const hand = createHandRuntime(ports);
  const standing = (id: number) => sim.forest.isStanding(id);
  const treeAt = (id: number) => {
    const t = sim.forest.info(id);
    return { x: t.x, z: t.z };
  };
  return {
    sim,
    hand,
    log,
    poses,
    events,
    state: m.state,
    standing,
    treeAt,
    moveTo: (at: { x: number; z: number }) => {
      orb = at;
    },
  };
}

const templeOf = (sim: VillageSim) => sim.buildings.find((b) => b.type === 'temple')!;

await check(
  'lift: the tree is only held; the sim, the stores and the woodcutters see nothing',
  () => {
    const sim = makeSim(map, { mode: 'hamlet' });
    stepSim(sim, { seconds: 30, phase: () => 0.4 });
    const w = handOn(sim);
    const id = sim.forest.nearest(templeOf(sim).x, templeOf(sim).z, 1)[0]!;
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
  'cancel: the tree goes back, the energy comes back, and ending it twice does nothing',
  () => {
    const sim = makeSim(map, { mode: 'hamlet' });
    const w = handOn(sim);
    const id = sim.forest.nearest(templeOf(sim).x, templeOf(sim).z, 1)[0]!;
    w.moveTo(w.treeAt(id));
    assert.ok(w.hand.pick().ok);
    assert.equal(w.hand.cancel(), true);
    assert.equal(w.state.energy, 100, 'refunded');
    assert.equal(w.standing(id), true);
    assert.deepEqual(
      w.log,
      [`lift:tree:${id}`, `release:tree:${id}:true`],
      'the view put the tree back',
    );
    assert.equal(w.hand.cancel(), false);
    assert.equal(w.state.energy, 100, 'refunded once');
    assert.equal(w.hand.energyOnHold(), 0);
  },
);

await check(
  'lift refusals: out of reach, not enough energy, blocked, and a skill-tree reach',
  () => {
    const sim = makeSim(map, { mode: 'hamlet' });
    const id = sim.forest.nearest(templeOf(sim).x, templeOf(sim).z, 1)[0]!;
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
    const sim = makeSim(map, { mode: 'hamlet' });
    stepSim(sim, { seconds: 30, phase: () => 0.4 });
    const w = handOn(sim);
    const temple = templeOf(sim);
    const id = sim.forest.nearest(temple.x, temple.z, 1)[0]!;
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

await check('drop outside any zone: the tree goes back and the energy is lost', () => {
  const sim = makeSim(map, { mode: 'hamlet' });
  const w = handOn(sim);
  const id = sim.forest.nearest(templeOf(sim).x, templeOf(sim).z, 1)[0]!;
  w.moveTo(w.treeAt(id));
  assert.ok(w.hand.pick().ok);
  const stock = { ...sim.economy.stock };
  assert.deepEqual(w.hand.drop({ x: -9999, z: -9999 }), { kind: 'released' });
  assert.equal(w.standing(id), true);
  assert.equal(w.state.energy, 100 - costOf('tree'), 'forfeited');
  assert.deepEqual({ ...sim.economy.stock }, stock);
  assert.deepEqual(w.log, [`lift:tree:${id}`, `release:tree:${id}:true`]);
});

await check(
  'drop on a site: the wood is work for the builders and the stores are untouched',
  () => {
    const sim = convertVillage(makeSim(map, { mode: 'hamlet' }));
    const opened: Building[] = [];
    stepSim(sim, {
      seconds: 3600,
      onStep: () => {
        const b = sim.buildings.find((x) => x.stage < 2);
        if (b) opened.push(b);
        return opened.length === 0;
      },
    });
    const site = opened[0];
    assert.ok(site, 'a site opened');
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
    const sim = makeSim(map, { mode: 'hamlet' });
    stepSim(sim, { seconds: 30, phase: () => 0.4 });
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
    const [a, b] = sim.forest.nearest(temple.x, temple.z, 2) as [number, number];
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

await check('a full store still takes the tree and still counts as a deed', () => {
  const sim = makeSim(map, { mode: 'hamlet' });
  stepSim(sim, { seconds: 30, phase: () => 0.4 });
  sim.economy.addWood(Number.POSITIVE_INFINITY);
  const full = sim.economy.stock.wood;
  const w = handOn(sim);
  const temple = templeOf(sim);
  const id = sim.forest.nearest(temple.x, temple.z, 1)[0]!;
  w.moveTo(w.treeAt(id));
  assert.ok(w.hand.pick().ok);
  w.moveTo(temple);
  const r = w.hand.drop();
  assert.ok(r.kind === 'delivered', r.kind);
  assert.equal(r.delivery.kept, 0, 'no room');
  assert.equal(sim.economy.stock.wood, full);
  assert.equal(w.standing(id), false, 'the tree is still uprooted');
  assert.ok(r.delivery.impressed > 0, 'and the village is still impressed');
});

await check(
  'a woodcutter fells the held tree, or the hand is blocked: the hold ends and the energy returns',
  () => {
    const sim = makeSim(map, { mode: 'hamlet' });
    const temple = templeOf(sim);
    const id = sim.forest.nearest(temple.x, temple.z, 1)[0]!;
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
    const id2 = sim.forest.nearest(temple.x, temple.z, 1)[0]!;
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
    const sim = makeSim(map, { mode: 'hamlet' });
    const id = sim.forest.nearest(templeOf(sim).x, templeOf(sim).z, 1)[0]!;
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
    const sim = makeSim(map, { mode: 'hamlet' });
    const id = sim.forest.nearest(templeOf(sim).x, templeOf(sim).z, 1)[0]!;
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
      const sim = makeSim(map, { mode: 'hamlet' });
      stepSim(sim, { seconds: 30, phase: () => 0.4 });
      script(handOn(sim));
      return JSON.stringify({
        forest: sim.forest.serialize(),
        economy: sim.economy.stock,
      });
    };
    const idle = run(() => {});
    const lifted = run((w) => {
      const t = templeOf(w.sim);
      w.moveTo(w.treeAt(w.sim.forest.nearest(t.x, t.z, 1)[0]!));
      w.hand.pick();
      w.hand.cancel();
    });
    assert.equal(lifted, idle, 'a lift that was cancelled leaves trees and stores as they were');
    const delivered = run((w) => {
      const t = templeOf(w.sim);
      w.moveTo(w.treeAt(w.sim.forest.nearest(t.x, t.z, 1)[0]!));
      w.hand.pick();
      w.moveTo(t);
      w.hand.drop();
    });
    assert.notEqual(delivered, idle, 'a delivery does change them');
  },
);

// --- wheat ---

/** A ripe field of the hamlet (the farmers are not at work yet unless the sim has been stepped). */
function ripeField(sim: VillageSim, growth = 1) {
  const field = sim.fields[0]!;
  field.growth = growth;
  return field;
}

await check('aim: wheat is lifted only when ripe, and from its edge', () => {
  const sim = makeSim(map, { mode: 'hamlet' });
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
    const sim = makeSim(map, { mode: 'hamlet' });
    stepSim(sim, { seconds: 300, phase: () => 0.4 });
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
    const sim = makeSim(map, { mode: 'hamlet' });
    stepSim(sim, { seconds: 30, phase: () => 0.4 });
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

await check('deliver wheat to a full larder: nothing kept, the field still reaped, a deed', () => {
  const sim = makeSim(map, { mode: 'hamlet' });
  stepSim(sim, { seconds: 300, phase: () => 0.4 });
  const f = ripeField(sim);
  sim.economy.addFood(1000);
  const w = handOn(sim);
  w.moveTo(f);
  assert.ok(w.hand.pick().ok);
  w.moveTo(templeOf(sim));
  const r = w.hand.drop();
  assert.ok(r.kind === 'delivered', JSON.stringify(r));
  assert.equal(r.delivery.kept, 0);
  assert.equal(f.growth, 0);
});

await check('wheat let go outside a zone, or cancelled: the field keeps it', () => {
  const sim = makeSim(map, { mode: 'hamlet' });
  const f = ripeField(sim);
  const w = handOn(sim);
  w.moveTo(f);
  assert.ok(w.hand.pick().ok);
  assert.deepEqual(w.hand.drop({ x: -9999, z: -9999 }), { kind: 'released' });
  assert.equal(f.growth, 1);
  assert.equal(w.state.energy, 100 - costOf('wheat'), 'forfeited');
  assert.ok(w.hand.pick().ok);
  assert.equal(w.hand.cancel(), true);
  assert.equal(f.growth, 1);
  assert.equal(w.state.energy, 100 - costOf('wheat'), 'refunded: only the first lift was lost');
  assert.deepEqual(w.log.slice(-2), [`lift:wheat:${f.id}`, `release:wheat:${f.id}:true`]);
});

await check(
  'a farmer reaps the field while the hand holds its wheat: the hold ends and refunds',
  () => {
    const sim = makeSim(map, { mode: 'hamlet' });
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
  const sim = convertVillage(makeSim(map, { mode: 'hamlet' }));
  const opened: Building[] = [];
  stepSim(sim, {
    seconds: 3600,
    onStep: () => {
      const b = sim.buildings.find((x) => x.stage < 2);
      if (b) opened.push(b);
      return opened.length === 0;
    },
  });
  const site = opened[0];
  assert.ok(site, 'a site opened');
  const f = ripeField(sim);
  const w = handOn(sim);
  w.moveTo(f);
  assert.ok(w.hand.pick().ok);
  const progress = site.progress;
  assert.deepEqual(w.hand.drop(site), { kind: 'released' }, 'a site does not take food');
  assert.equal(site.progress, progress);
});

// --- sheep ---

/** Four grown sheep grazing round the temple, and the hand's view of them. */
function farmOf(sim: VillageSim) {
  const t = templeOf(sim);
  const env: AnimalEnv = { walkable: () => true, scare: null };
  const flock = createFlock('sheep', t.x + 12, t.z, 6, 'hand-check');
  for (let i = 0; i < 4; i++) addAnimal(flock, env);
  for (let k = 0; k < 200; k++) stepFlock(flock, 0.02, env);
  const log: string[] = [];
  const animals: HandAnimals = {
    sheepWithin: (x, z, r, out) => animalsWithin(flock, x, z, r, out),
    lift: (id) => liftAnimal(flock, id),
    pose: (p) => log.push(`pose:${p.scale}:${p.y}`),
    release: (how) => {
      log.push(`release:${how}`);
      releaseAnimal(flock, how);
    },
    holding: () => flock.held !== null,
  };
  return { flock, env, animals, log };
}

await check('sheep: the nearest in reach is lifted, held out of the flock and counted', () => {
  const sim = makeSim(map, { mode: 'hamlet' });
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
  const sim = makeSim(map, { mode: 'hamlet' });
  const farm = farmOf(sim);
  const w = handOn(sim);
  w.moveTo(farm.flock.animals[0]!);
  assert.deepEqual(w.hand.pick(), { ok: false, reason: 'none' });
});

await check('sheep: delivered, it is food for the larder and the flock owes a replacement', () => {
  const sim = makeSim(map, { mode: 'hamlet' });
  stepSim(sim, { seconds: 30, phase: () => 0.4 });
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
  assert.equal(farm.flock.owed.length, 1, 'a replacement is on its way');
  assert.equal(headcount(farm.flock), 4, 'so the village does not refill at once');
  assert.equal(stepOwed(farm.flock, 1000, farm.env), 1);
  assert.equal(farm.flock.animals.length, 4);
  assert.equal(w.state.energy, 100 - costOf('sheep'));
});

await check(
  'sheep: let go outside a zone it is back and the effort is lost; a full larder pays still',
  () => {
    const sim = makeSim(map, { mode: 'hamlet' });
    const farm = farmOf(sim);
    const w = handOn(sim, { animals: farm.animals });
    w.moveTo(farm.flock.animals[0]!);
    assert.ok(w.hand.pick().ok);
    assert.deepEqual(w.hand.drop({ x: -9999, z: -9999 }), { kind: 'released' });
    assert.equal(farm.flock.animals.length, 4);
    assert.equal(w.state.energy, 100 - costOf('sheep'), 'forfeited');
    sim.economy.addFood(1000);
    w.moveTo(farm.flock.animals[1]!);
    assert.ok(w.hand.pick().ok);
    w.moveTo(templeOf(sim));
    const r = w.hand.drop();
    assert.ok(r.kind === 'delivered' && r.delivery.kept === 0, JSON.stringify(r));
    assert.equal(farm.flock.owed.length, 1);
  },
);

// --- the overview's cursor ---

await check(
  'overview aim: a picked building is put down at its middle and a picked field lifted from its middle',
  () => {
    const world = {
      buildings: [
        { id: 4, x: 10, z: 20 },
        { id: 7, x: -30, z: 5 },
      ],
      fields: [
        { id: 2, x: 50, z: 60, growth: 1 },
        { id: 3, x: -50, z: 60, growth: H.WHEAT.MIN_RIPE - 0.01 },
      ],
    };
    const ground = { x: 100, z: 100 };
    assert.deepEqual(overviewPlace('drop', { kind: 'building', id: 7 }, ground, world), {
      x: -30,
      z: 5,
    });
    assert.deepEqual(overviewPlace('lift', { kind: 'field', id: 2 }, ground, world), {
      x: 50,
      z: 60,
    });
    // An unripe field has nothing to lift: a click on it is just the ground under the cursor.
    assert.deepEqual(overviewPlace('lift', { kind: 'field', id: 3 }, ground, world), ground);
    // A building is no place to lift from, a field no place to put down, and a villager or nothing is the ground.
    assert.deepEqual(overviewPlace('lift', { kind: 'building', id: 7 }, ground, world), ground);
    assert.deepEqual(overviewPlace('drop', { kind: 'field', id: 2 }, ground, world), ground);
    assert.deepEqual(overviewPlace('drop', { kind: 'villager', index: 0 }, ground, world), ground);
    assert.deepEqual(overviewPlace('lift', null, ground, world), ground);
    // A pick of something that is gone falls back to the ground, and no ground means nowhere to act.
    assert.deepEqual(overviewPlace('drop', { kind: 'building', id: 99 }, ground, world), ground);
    assert.equal(overviewPlace('lift', null, null, world), null);
    assert.equal(overviewPlace('drop', { kind: 'villager', index: 1 }, null, world), null);
  },
);

await check('overview powers: the hand takes every click while it holds something', () => {
  const hand = 'hand';
  assert.equal(clickOwner(null, hand, false), 'none', 'nothing armed: the panel selects');
  assert.equal(clickOwner('call_rain', hand, false), 'power');
  assert.equal(clickOwner(hand, hand, false), 'tool', 'the armed hand lifts');
  assert.equal(clickOwner(null, hand, true), 'tool', 'a full hand, nothing armed');
  assert.equal(clickOwner('call_rain', hand, true), 'tool', 'and a full hand beats an armed power');
  assert.equal(clickOwner('call_rain', undefined, false), 'power', 'without a hand on the bar');
  assert.equal(clickOwner(null, undefined, true), 'none');
  assert.equal(canArm('call_rain', hand, false), true);
  assert.equal(canArm('call_rain', hand, true), false, 'put it down first');
  assert.equal(canArm(hand, hand, true), true, 'the hand itself may be armed or put away');
  assert.equal(canArm('call_rain', undefined, true), false);
});

await check(
  'looking: a look at a point leaves the orb’s target alone, and an inactive hand does not look',
  () => {
    const sim = makeSim(map, { mode: 'hamlet' });
    const temple = templeOf(sim);
    const [a, b] = sim.forest.nearest(temple.x, temple.z, 2) as [number, number];
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
  const sim = makeSim(map, { mode: 'hamlet' });
  const w = handOn(sim);
  const id = sim.forest.nearest(templeOf(sim).x, templeOf(sim).z, 1)[0]!;
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
  const sim = makeSim(map, { mode: 'hamlet' });
  const w = handOn(sim);
  assert.equal(w.hand.putBack(), false, 'nothing held, nothing to put back');
  assert.equal(w.state.energy, 100);
  const id = sim.forest.nearest(templeOf(sim).x, templeOf(sim).z, 1)[0]!;
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
      const sim = makeSim(map, { mode: 'hamlet' });
      stepSim(sim, { seconds: 30, phase: () => 0.4 });
      return sim;
    };
    const flown = build();
    const clicked = build();
    const roam = handOn(flown);
    const overview = handOn(clicked);
    const id = flown.forest.nearest(templeOf(flown).x, templeOf(flown).z, 1)[0]!;
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

finish('all hand checks passed');
