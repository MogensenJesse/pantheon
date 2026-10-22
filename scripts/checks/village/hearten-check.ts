// scripts/checks/village/hearten-check.ts — Hearten: the touch on one villager (cost, lift, belief, prayer, cooldown, save)
// Run: node --experimental-strip-types --no-warnings scripts/checks/village/hearten-check.ts
import assert from 'node:assert/strict';
import { VILLAGE } from '../../../src/config/village.ts';
import { describe, describeWorldOf } from '../../../src/overview/overviewDescribe.ts';
import type { VillageEvent } from '../../../src/world/village/model/types.ts';
import { createHearten, heartenProblem } from '../../../src/world/village/sim/hearten.ts';
import { check, finish } from '../lib/check.ts';
import {
  convertVillage,
  DAY_S,
  loadMap,
  makeSim,
  savedHash,
  stepSim,
  withNoFood,
} from '../lib/villageHeadless.ts';

const H = VILLAGE.HEARTEN;
const map = loadMap('island-mountain');
const grown = () => {
  const sim = convertVillage(makeSim(map, { mode: 'hamlet' }));
  stepSim(sim, { seconds: DAY_S, fed: true });
  return sim;
};

await check('the lift lasts, then a cooldown, then the villager is free again', () => {
  const h = createHearten();
  assert.equal(h.boost(3), 1);
  assert.equal(h.touch(3), true);
  assert.equal(h.boost(3), H.BOOST);
  assert.equal(h.touch(3), false, 'cooling down');
  h.update(H.DURATION_DAYS * DAY_S + 1);
  assert.equal(h.boost(3), 1, 'the lift is over');
  assert.equal(h.touch(3), false, 'but not free yet');
  h.update(H.COOLDOWN_DAYS * DAY_S);
  assert.equal(h.list.length, 0);
  assert.equal(h.touch(3), true);
});

await check(
  'the heartened follow a villager who is moved or removed, and the saved list is checked',
  () => {
    const h = createHearten();
    h.touch(1);
    h.touch(4);
    h.remove(1, 4);
    assert.deepEqual(
      h.list.map((x) => x.villager),
      [1],
    );
    assert.equal(heartenProblem(h.serialize(), 5), null);
    assert.ok(heartenProblem([{ villager: 9, left: 1, cool: 1 }], 5));
    assert.ok(heartenProblem([{ villager: 1, left: -1, cool: 1 }], 5));
    assert.ok(heartenProblem(null, 5));
  },
);

await check('touching a villager costs faith, lifts them and says so', () => {
  const sim = grown();
  const faith = sim.faith.faith;
  const events: VillageEvent[] = [];
  assert.equal(sim.heartenVillager(0, events), 'ok');
  assert.ok(events.some((e) => e.kind === 'villagerHeartened'));
  assert.equal(sim.faith.faith, faith - H.FAITH);
  assert.equal(sim.heartenLeft(0).left > 0, true);
  assert.equal(sim.heartenVillager(0, []), 'cooldown');
  assert.equal(sim.heartenVillager(999, []), 'unknown');
  sim.faith.faith = 0;
  assert.equal(sim.heartenVillager(1, []), 'faith');
});

await check('it restores a lapsed villager and answers their prayer, and converts nobody', () => {
  const sim = grown();
  withNoFood(() => {
    sim.starve([]);
    stepSim(sim, { seconds: 0.4 * DAY_S, from: DAY_S });
  });
  const prayer = sim.prayers.open[0];
  assert.ok(prayer, 'someone prays');
  const answered = sim.prayers.answered;
  sim.faith.faith = 50;
  const faith = sim.faith.faith;
  assert.equal(sim.heartenVillager(prayer.villager, []), 'ok');
  assert.equal(sim.prayers.answered, answered + 1);
  assert.equal(
    sim.prayers.open.some((p) => p.villager === prayer.villager),
    false,
  );
  assert.equal(sim.faith.faith, faith - H.FAITH + VILLAGE.PRAYERS.ANSWER_FAITH);

  // someone who never believed is lifted but not converted
  const fresh = makeSim(map, { mode: 'hamlet' });
  fresh.faith.faith = 50;
  const before = fresh.villagers.belief[0]!;
  fresh.heartenVillager(0, []);
  assert.equal(fresh.villagers.belief[0], before);
  assert.ok(before < 1);
});

await check('a lapsed villager is restored by a touch', () => {
  const sim = grown();
  withNoFood(() => {
    sim.starve([]);
    stepSim(sim, { seconds: 2.4 * DAY_S, from: DAY_S });
  });
  const lapsed = sim.prayers.lapsed[0];
  assert.ok(lapsed !== undefined, 'a prayer lapsed');
  assert.ok(sim.villagers.belief[lapsed]! < 1);
  sim.faith.faith = 50;
  assert.equal(sim.heartenVillager(lapsed, []), 'ok');
  assert.equal(sim.villagers.belief[lapsed], 1);
  assert.equal(sim.prayers.lapsed.includes(lapsed), false);
});

await check('a lifted village builds faster', () => {
  const built = (touch: boolean) => {
    const sim = grown();
    sim.faith.faith = 500;
    if (touch) for (let i = 0; i < sim.villagers.count; i++) sim.heartenVillager(i, [], true);
    stepSim(sim, { seconds: 0.4 * DAY_S, from: DAY_S, fed: true });
    // Work done: stages and the progress inside a stage.
    return sim.buildings.reduce((sum, b) => sum + b.stage * 1e4 + b.progress, 0);
  };
  assert.ok(built(true) > built(false));
});

await check('the panel offers it only when it is unlocked, and says why not', () => {
  const sim = grown();
  const sel = { kind: 'villager', index: 0 } as const;
  assert.equal(describe(sel, describeWorldOf(sim))!.hearten, undefined);
  const open = describeWorldOf(sim, { heartenUnlocked: () => true });
  sim.faith.faith = 50;
  const ready = describe(sel, open)!.hearten!;
  assert.equal(ready.enabled, true);
  sim.heartenVillager(0, []);
  const after = describe(sel, open)!;
  assert.equal(after.hearten!.enabled, false);
  assert.match(after.hearten!.note, /again in/);
  assert.ok(after.rows.some((r) => r.label === 'Heartened'));
});

await check('a village with a heartened villager saves and goes on the same', () => {
  const sim = grown();
  sim.heartenVillager(2, [], true);
  const copy = makeSim(map, { mode: 'hamlet', restore: structuredClone(sim.serialize()) });
  assert.equal(savedHash(copy), savedHash(sim));
  const rest = { seconds: 0.3 * DAY_S, from: DAY_S, fed: true } as const;
  stepSim(sim, rest);
  stepSim(copy, rest);
  assert.equal(savedHash(copy), savedHash(sim));
});

finish('all hearten checks passed');
