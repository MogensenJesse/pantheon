// scripts/checks/hand/hand-quest-check.ts — headless checks of what the village makes of the hand's deeds: who
// witnesses, how belief is earned, the pacing of the conversion, on a real hamlet.
// Run: node --experimental-strip-types scripts/checks/hand/hand-quest-check.ts
import assert from 'node:assert/strict';
import { PHASE0 } from '../../../src/config/phase0.ts';
import { VILLAGE } from '../../../src/config/village.ts';
import {
  beliefOf,
  createDeedLedger,
  type DeedWorld,
  witnessesWithin,
} from '../../../src/hand/deeds.ts';
import { classifyDrop, createHand, meetsNeed } from '../../../src/hand/handRules.ts';
import {
  CONVERSION_QUEST,
  elderOpenToBelief,
  isDusk,
} from '../../../src/quests/content/conversion.ts';
import { newQuestState, type QuestEvent, stepQuest } from '../../../src/quests/quest.ts';
import { Activity, Role, type VillageEvent } from '../../../src/world/village/model/types.ts';
import { shortages } from '../../../src/world/village/sim/economy.ts';
import type { VillageSim } from '../../../src/world/village/sim/villageSim.ts';
import { check, finish } from '../lib/check.ts';
import { meter } from '../lib/handFixtures.ts';
import { world as questWorld } from '../lib/questFixtures.ts';
import {
  DAY_S,
  DT,
  dayPhaseAt,
  loadMap,
  makeSim,
  savedHash,
  stepSim,
} from '../lib/villageHeadless.ts';

const D = VILLAGE.HAND.DEED;
const map = loadMap('island-mountain');

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

finish('all hand quest checks passed');
