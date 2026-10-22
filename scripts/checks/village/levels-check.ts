// scripts/checks/village/levels-check.ts — upgrade levels of finished buildings: rules, cost, work, effects, the planner and the save
// Run: node --experimental-strip-types scripts/checks/village/levels-check.ts
import assert from 'node:assert/strict';
import { VILLAGE } from '../../../src/config/village.ts';
import { describe, describeWorldOf } from '../../../src/overview/overviewDescribe.ts';
import { neutralModifiers, setModifiers } from '../../../src/skills/modifiers.ts';
import { bedsOf, isHouse } from '../../../src/world/village/model/buildings.ts';
import type { Building, VillageEvent } from '../../../src/world/village/model/types.ts';
import { capsOf } from '../../../src/world/village/sim/economy.ts';
import {
  checkUpgrade,
  tierCeiling,
  upgradeCost,
  upgradeGroup,
} from '../../../src/world/village/sim/upgrades.ts';
import type { VillageSim } from '../../../src/world/village/sim/villageSim.ts';
import { check, finish } from '../lib/check.ts';
import {
  convertVillage,
  DAY_S,
  loadMap,
  makeSim,
  savedHash,
  stepSim,
} from '../lib/villageHeadless.ts';

const U = VILLAGE.UPGRADES;
const map = loadMap('island-mountain');
const tiers = (houseTier: number, storeTier = 1) => ({
  ...neutralModifiers(),
  houseTier,
  storeTier,
});
const building = (type: string, over: Partial<Building> = {}): Building =>
  ({ id: 1, type, stage: 2, progress: 0, level: 1, upgrade: 0, ...over }) as Building;

await check('which buildings can be upgraded, how high the tree lets them, and why not', () => {
  assert.equal(upgradeGroup(building('house_a')), 'house');
  assert.equal(upgradeGroup(building('granary')), 'store');
  assert.equal(upgradeGroup(building('workshop')), 'store');
  assert.equal(upgradeGroup(building('temple')), null);
  assert.equal(tierCeiling(building('house_b'), tiers(2)), 2);
  assert.equal(tierCeiling(building('house_b'), tiers(9)), U.MAX_LEVEL, 'never above the top');
  assert.equal(tierCeiling(building('granary'), tiers(3, 1)), 1);
  const t2 = tiers(2, 2);
  assert.deepEqual(checkUpgrade(building('house_a'), t2), { ok: true });
  const refused = (b: Building, want: string, t = t2) =>
    assert.deepEqual(checkUpgrade(b, t), { ok: false, reason: want });
  refused(building('temple'), 'unsupported');
  refused(building('house_a', { stage: 1 }), 'unfinished');
  refused(building('house_a', { upgrade: 50 }), 'busy');
  refused(building('house_a', { level: 2 }), 'tier');
  refused(building('house_a', { level: U.MAX_LEVEL }), 'maxed');
  refused(building('house_a'), 'tier', tiers(1));
});

await check('each step costs more, and the level gives beds to houses and room to stores', () => {
  const a = upgradeCost(building('house_b'));
  const b = upgradeCost(building('house_b', { level: 2 }));
  assert.ok(b.wood > a.wood && b.faith > a.faith && b.workS > a.workS);
  const house = building('house_a');
  const raised = building('house_a', { level: 3 });
  assert.equal(
    bedsOf(raised) - bedsOf(house),
    2 * U.BEDS_PER_LEVEL,
    'two levels, two steps of beds',
  );
  assert.equal(
    bedsOf(building('house_a', { stage: 1, level: 3 })),
    0,
    'an unfinished house has none',
  );
  const stores = (level: number) =>
    capsOf([building('granary', { level }), building('workshop', { level })]);
  assert.ok(stores(2).food > stores(1).food && stores(2).wood > stores(1).wood);
  assert.equal(
    stores(2).food - stores(1).food,
    VILLAGE.ECONOMY.GRANARY_FOOD_CAP * U.STORE_CAP_SHARE,
  );
});

/** A grown, converted village with room in its pockets, made once and restored from for each check. */
const grown = (() => {
  const sim = convertVillage(makeSim(map, { mode: 'hamlet' }));
  stepSim(sim, { seconds: 2 * DAY_S, fed: true });
  return sim.serialize();
})();
const rich = (modifiers = tiers(1)): VillageSim => {
  const sim = makeSim(map, { mode: 'hamlet', restore: structuredClone(grown), modifiers });
  sim.faith.faith = 500;
  sim.economy.addWood(500);
  return sim;
};
const finishedHouse = (sim: VillageSim): Building =>
  sim.buildings.find((b) => isHouse(b) && b.stage === 2)!;

await check('the village can only start an upgrade the tree allows, and pays for it', () => {
  const none = rich(tiers(1));
  const target = finishedHouse(none);
  assert.equal(none.upgrade(target.id, []), 'tier');
  const sim = rich(tiers(2));
  const house = finishedHouse(sim);
  const cost = upgradeCost(house);
  const wood = sim.economy.stock.wood;
  const faith = sim.faith.faith;
  const events: VillageEvent[] = [];
  assert.equal(sim.upgrade(house.id, events), 'ok');
  assert.ok(events.some((e) => e.kind === 'upgradeStarted'));
  assert.equal(sim.economy.stock.wood, wood - cost.wood);
  assert.equal(sim.faith.faith, faith - cost.faith);
  assert.equal(house.upgrade, cost.workS);
  assert.equal(house.stage, 2, 'the house stays finished while it is raised');
  assert.equal(sim.upgrade(house.id, []), 'busy');
  const poor = rich(tiers(2));
  poor.faith.faith = 0;
  assert.equal(poor.upgrade(finishedHouse(poor).id, []), 'faith');
  const bare = rich(tiers(2));
  bare.economy.spendWood(bare.economy.stock.wood);
  assert.equal(bare.upgrade(finishedHouse(bare).id, []), 'wood');
  assert.equal(sim.upgrade(9999, []), 'unsupported');
});

await check('only a few upgrades run at once', () => {
  const sim = rich(tiers(2));
  const houses = sim.buildings.filter((b) => isHouse(b) && b.stage === 2);
  assert.ok(houses.length > U.MAX_ACTIVE, 'houses to try');
  let started = 0;
  let capped = false;
  for (const h of houses) {
    const r = sim.upgrade(h.id, []);
    if (r === 'ok') started++;
    if (r === 'cap') capped = true;
  }
  assert.equal(started, U.MAX_ACTIVE);
  assert.ok(capped);
});

await check(
  'builders raise the building, its beds grow, and the stockpile event pair is sent',
  () => {
    const sim = rich(tiers(2));
    const house = finishedHouse(sim);
    const before = bedsOf(house);
    sim.upgrade(house.id, []);
    let done: VillageEvent | undefined;
    let usedByBuilder = false;
    stepSim(sim, {
      seconds: 3 * DAY_S,
      from: 2 * DAY_S,
      fed: true,
      onStep: (_t, events) => {
        done ??= events.find((e) => e.kind === 'upgradeCompleted');
        if (house.upgrade > 0 && house.upgrade < upgradeCost(house).workS) usedByBuilder = true;
        return !done;
      },
    });
    assert.ok(usedByBuilder, 'builders worked on it');
    assert.ok(done && done.kind === 'upgradeCompleted' && done.level === 2);
    assert.equal(house.level, 2);
    assert.equal(house.upgrade, 0);
    assert.equal(bedsOf(house) - before, U.BEDS_PER_LEVEL);
    assert.equal(sim.upgrade(house.id, []), 'tier', 'level 3 needs the next tier');
  },
);

await check('Kindle finishes an upgrade at once', () => {
  const sim = rich(tiers(2));
  const house = finishedHouse(sim);
  sim.upgrade(house.id, []);
  const events: VillageEvent[] = [];
  assert.equal(sim.kindle(house.id, events), true);
  assert.equal(house.level, 2);
  assert.ok(events.some((e) => e.kind === 'upgradeCompleted'));
  assert.equal(sim.kindle(house.id, []), false, 'nothing left to finish');
});

await check(
  'the planner starts upgrades by itself when the tree allows them, and not otherwise',
  () => {
    const quiet = rich(tiers(1));
    const loud = rich(tiers(2, 2));
    const count = (sim: VillageSim) =>
      stepSim(sim, { seconds: 2 * DAY_S, from: 2 * DAY_S, fed: true }).filter(
        (e) => e.kind === 'upgradeStarted',
      ).length;
    assert.equal(count(quiet), 0);
    assert.ok(count(loud) > 0, 'an upgrade was started');
    assert.ok(loud.buildings.some((b) => b.level > 1 || b.upgrade > 0));
    for (const b of loud.buildings) assert.ok(b.level <= 2, 'never above the tier');
  },
);

await check('an upgrade under way survives a save and carries on the same', () => {
  const sim = rich(tiers(2));
  const house = finishedHouse(sim);
  sim.upgrade(house.id, []);
  stepSim(sim, { seconds: 15, from: 2 * DAY_S, fed: true });
  assert.ok(house.upgrade > 0, 'still under way');
  const copy = makeSim(map, {
    mode: 'hamlet',
    restore: structuredClone(sim.serialize()),
    modifiers: tiers(2),
  });
  assert.equal(savedHash(copy), savedHash(sim), 'the load is the save');
  const rest = { seconds: DAY_S, from: 2 * DAY_S + 15, fed: true } as const;
  stepSim(sim, rest);
  stepSim(copy, rest);
  assert.equal(savedHash(copy), savedHash(sim), 'both carry on the same');
  assert.equal(copy.buildings.find((b) => b.id === house.id)!.level, 2);
});

await check(
  'the overview panel offers the upgrade, shows it under way and says what is missing',
  () => {
    try {
      setModifiers(tiers(2));
      const sim = rich(tiers(2));
      const house = finishedHouse(sim);
      const sel = { kind: 'building', id: house.id } as const;
      const open = describe(sel, describeWorldOf(sim))!;
      assert.ok(open.upgrade?.enabled, 'a button when it can be afforded');
      assert.equal(open.upgrade?.id, house.id);
      assert.match(open.upgrade?.label ?? '', /level 2/);
      assert.ok(open.rows.some((r) => r.label === 'Level' && r.value.startsWith('1 of')));
      sim.faith.faith = 0;
      assert.equal(describe(sel, describeWorldOf(sim))!.upgrade?.enabled, false, 'too poor');
      sim.faith.faith = 500;
      sim.upgrade(house.id, []);
      const under = describe(sel, describeWorldOf(sim))!;
      assert.equal(under.upgrade, undefined, 'no button while it is under way');
      assert.ok(under.bar && under.bar.value >= 0 && under.bar.value < 1);
      assert.match(under.subtitle ?? '', /level 2/);
      setModifiers(tiers(1));
      const tierShut = describe(sel, describeWorldOf(rich(tiers(1))))!;
      assert.equal(tierShut.upgrade, undefined);
      assert.ok(tierShut.rows.some((r) => r.label === 'Next level' && r.value === 'needs a skill'));
    } finally {
      setModifiers(neutralModifiers());
    }
  },
);

finish('all upgrade level checks passed');
