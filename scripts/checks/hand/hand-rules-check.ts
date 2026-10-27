// scripts/checks/hand/hand-rules-check.ts — headless checks of the hand's rules: what it may take, where it may be put
// down, what a hold costs and gives back, and who owns a click in the overview. Pure: no village.
// Run: node --experimental-strip-types scripts/checks/hand/hand-rules-check.ts
import assert from 'node:assert/strict';
import { VILLAGE } from '../../../src/config/village.ts';
import { insideFootprint } from '../../../src/core/math/geom.ts';
import type { Delivery } from '../../../src/hand/handPorts.ts';
import {
  classifyDrop,
  costOf,
  createHand,
  distanceTo,
  meetsNeed,
  pickTarget,
  reachOf,
  withHeldEnergy,
} from '../../../src/hand/handRules.ts';
import { deliveryText, hintText, lostText, refusalText } from '../../../src/hand/handText.ts';
import type { HandCandidate } from '../../../src/hand/handTypes.ts';
import { canArm, clickOwner, overviewPlace } from '../../../src/hand/overviewAim.ts';
import { shortages } from '../../../src/world/village/sim/economy.ts';
import { isRipe } from '../../../src/world/village/sim/fieldsDesk.ts';
import { check, finish } from '../lib/check.ts';
import { meter, remoteSite, tree } from '../lib/handFixtures.ts';
import { buildingOf } from '../lib/villageHeadless.ts';

const H = VILLAGE.HAND;

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
  assert.equal(pickTarget([tree(2, 3)], at, 1)?.id, 2);
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

const temple = buildingOf('temple', { id: 1, halfW: 5, halfD: 5 });
const site = buildingOf('house_b', { id: 2, x: 20, stage: 0 });
const granary = buildingOf('granary', { id: 3, x: -20 });
const upgrading = buildingOf('workshop', { id: 4, z: 20, upgrade: 100 });
const house = buildingOf('house_a', { id: 5, x: 40 });
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
  const unbuilt = buildingOf('granary', { id: 6, x: 60, stage: 1 });
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
  const near = buildingOf('house_c', { id: 7, x: 6, stage: 0 });
  const far = buildingOf('house_c', { id: 8, x: 9, stage: 0 });
  const d = classifyDrop('wood', { x: 7, z: 0 }, [far, temple, near]);
  assert.ok(
    d.zone === 'site' && d.building.id === 7,
    'a site wins over the temple, the nearest site wins',
  );
  // turned buildings: a long side along z
  const turned = buildingOf('granary', {
    id: 9,
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

// --- what a save counts, and the words ---

await check(
  'a save counts the energy of a hold as unspent, up to the cap, and changes nothing else',
  () => {
    const state = { energy: 40, energyCap: 100, other: 'kept' };
    assert.equal(withHeldEnergy(state, 0), state, 'nothing held: the very same state');
    assert.deepEqual(withHeldEnergy(state, 15), { energy: 55, energyCap: 100, other: 'kept' });
    assert.equal(withHeldEnergy(state, 80).energy, 100, 'never above the cap');
    assert.equal(state.energy, 40, 'the live state is not touched');
  },
);

await check(
  'the words: a delivery, a hint, a refusal and a lost hold each say what happened',
  () => {
    const delivery = (over: Partial<Delivery>): Delivery => ({
      what: 'tree',
      amount: 10,
      kept: 10,
      zone: 'store',
      x: 0,
      z: 0,
      impressed: 0,
      converted: 0,
      ...over,
    });
    assert.equal(deliveryText(delivery({})), 'Wood for the stores: +10.');
    assert.match(
      deliveryText(delivery({ what: 'wheat', kept: 4, amount: 6 })),
      /^Food .*\+4 \(the store is full: 4 of 6\)/,
    );
    assert.match(deliveryText(delivery({ kept: 0 })), /store is full, but the village saw it/);
    assert.match(deliveryText(delivery({ zone: 'site' })), /builders/);
    assert.match(deliveryText(delivery({ zone: 'remote' })), /crew at the camp/);
    assert.match(deliveryText(delivery({ impressed: 2 })), /impressed/);
    assert.doesNotMatch(deliveryText(delivery({ impressed: 0 })), /impressed/);

    const held = { kind: 'tree' as const, id: 1, x: 0, z: 0, cost: 5 };
    const site = buildingOf('house_a', { stage: 1 });
    assert.equal(hintText(null, null, null), '', 'nothing near: no hint');
    assert.equal(hintText(tree(1, 2), null, null), 'pull up the tree');
    assert.match(hintText(null, held, { zone: 'none' }), /let go/);
    assert.match(hintText(null, held, { zone: 'site', building: site }), /builders/);
    assert.match(
      hintText(null, held, { zone: 'remote', site: remoteSite({}), x: 0, z: 0 }),
      /camp/,
    );
    assert.equal(
      hintText(null, held, { zone: 'store', building: buildingOf('granary') }),
      'put it down',
    );

    assert.equal(refusalText('busy'), '', 'a busy hand needs no word');
    assert.match(refusalText('energy'), /energy/);
    assert.equal(lostText('blocked', 'tree'), '');
    for (const what of ['tree', 'wheat', 'sheep'] as const) {
      assert.match(lostText('gone', what), /energy returns/i, what);
    }
  },
);

finish('all hand rules checks passed');
