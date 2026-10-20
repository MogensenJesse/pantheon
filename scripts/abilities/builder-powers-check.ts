// scripts/abilities/builder-powers-check.ts — headless checks of the arch II powers (M9): what the cursor
// aims at, what each power does to the village and the weather, the faith and cooldown rules around them, and
// what a save keeps of them.
// Run: node --experimental-strip-types scripts/abilities/builder-powers-check.ts
import assert from 'node:assert/strict';
import { ABILITIES, ABILITY_IDS, type AbilityDef } from '../../src/abilities/abilities.ts';
import { type BuilderWorld, createBuilderPowers } from '../../src/abilities/builderPowers.ts';
import { createAbilityCaster } from '../../src/abilities/caster.ts';
import { VILLAGE } from '../../src/config/village.ts';
import { WEATHER } from '../../src/config/weather.ts';
import { parseProfile } from '../../src/save/profile.ts';
import type { VillageEvent } from '../../src/world/village/model/types.ts';
import { TreeState } from '../../src/world/village/sim/forest.ts';
import type { VillageSim } from '../../src/world/village/sim/villageSim.ts';
import { createWeather, forcedWeatherProblem } from '../../src/world/weather/weather.ts';
import { check, finish } from '../lib/check.ts';
import { rawProfile } from '../lib/saveFixtures.ts';
import { loadMap, makeSim } from '../lib/villageHeadless.ts';

const P = VILLAGE.BUILDER_POWERS;
const map = loadMap('island-mountain');
const def = (id: string) => ABILITIES.find((d) => d.id === id) as AbilityDef;

/** A converted village with the powers wired to it, as the game wires them. */
function setup() {
  const sim: VillageSim = makeSim(map, { mode: 'hamlet' });
  const events: VillageEvent[] = [];
  for (let i = 0; i < sim.villagers.count; i++) sim.addBelief(i, 1, events);
  sim.convertVillage(events);
  sim.economy.addWood(Number.POSITIVE_INFINITY);
  sim.addFaith(500);
  const weather = createWeather({
    anchorX: sim.seed.x,
    anchorZ: sim.seed.z,
    seed: 7,
    windDirectionDeg: 270,
  });
  let clock = 10_000;
  const sunk: VillageEvent[] = [];
  const world: BuilderWorld = {
    fields: sim.fields,
    buildings: sim.buildings,
    forest: sim.forest,
    bless: sim.bless,
    kindle: (id) => sim.kindle(id, sunk),
    provide: sim.provide,
    weather,
    clock: () => clock,
    windDirectionDeg: 270,
  };
  const powers = createBuilderPowers(world);
  const faith = { amount: () => sim.faith.faith, spend: (a: number) => sim.addFaith(-a) };
  const caster = createAbilityCaster({
    defs: ABILITIES,
    isGranted: (id) => def(id).grantedWithVillage === true,
    energy: () => 0,
    spendEnergy: () => {},
    faith,
    perform: (d, target) => powers.perform(d, target),
  });
  return { sim, world, powers, weather, caster, setClock: (t: number) => (clock = t), sunk };
}

const openSite = (sim: VillageSim) => {
  sim.startSiteNow([]);
  const site = sim.buildings.find((b) => b.stage < 2);
  assert.ok(site, 'a site was started');
  return site;
};

await check(
  'the five builder powers: shape (faith, cooldown, arch II, aimed at what they act on)',
  () => {
    const ids = ABILITIES.filter((d) => d.arch === 'village').map((d) => d.id);
    assert.deepEqual(ids, ['blessing', 'kindle', 'provide', 'call_rain', 'clear_skies']);
    assert.deepEqual(
      ids.map((id) => def(id).targeting),
      ['bless', 'site', 'cursor', 'sky', 'sky'],
    );
    assert.deepEqual(
      ids.map((id) => def(id).cost.faith),
      [P.BLESSING.FAITH, P.KINDLE.FAITH, P.PROVIDE.FAITH, P.CALL_RAIN.FAITH, P.CLEAR_SKIES.FAITH],
    );
    assert.ok(
      P.PROVIDE.COOLDOWN_S > P.BLESSING.COOLDOWN_S,
      'Provide is the long one among the small',
    );
  },
);

await check('Blessing aims at a field, a finished house or a tree, and at nothing else', () => {
  const { sim, powers } = setup();
  const bless = def(ABILITY_IDS.blessing);
  const field = sim.fields[0]!;
  const house = sim.buildings.find((b) => b.type.startsWith('house_') && b.stage >= 2)!;
  const temple = sim.buildings.find((b) => b.type === 'temple')!;
  assert.deepEqual(
    powers.resolveTarget(bless, { pick: { kind: 'field', id: field.id }, ground: null }),
    {
      kind: 'bless',
      of: 'field',
      id: field.id,
    },
  );
  assert.deepEqual(
    powers.resolveTarget(bless, { pick: { kind: 'building', id: house.id }, ground: null }),
    {
      kind: 'bless',
      of: 'house',
      id: house.id,
    },
  );
  assert.equal(
    powers.resolveTarget(bless, { pick: { kind: 'building', id: temple.id }, ground: null }).id,
    -1,
  );
  assert.equal(powers.resolveTarget(bless, { pick: null, ground: null }).id, -1);
  assert.equal(
    powers.resolveTarget(bless, { pick: { kind: 'villager', index: 0 }, ground: null }).id,
    -1,
  );
  // a tree: the ground beside it, a few metres off is still it; far from any is nothing
  const treeId = 100;
  const t = sim.forest.info(treeId);
  const near = powers.resolveTarget(bless, { pick: null, ground: { x: t.x + 2, z: t.z } });
  assert.equal(near.of, 'tree');
  assert.ok(near.id! >= 0);
  assert.equal(powers.resolveTarget(bless, { pick: null, ground: { x: -9000, z: -9000 } }).id, -1);
  // a felled tree is not aimed at; a stump neither
  const only = sim.forest.nearest(t.x, t.z, 1)[0]!;
  sim.forest.fell(only, 1, 0, []);
  const felled = sim.forest.info(only);
  assert.notEqual(
    powers.resolveTarget(bless, { pick: null, ground: { x: felled.x, z: felled.z } }).id,
    only,
    'the felled tree is no target',
  );
  assert.equal(sim.forest.state(only), TreeState.Falling);
});

await check('Blessing does what it says to the village, and costs faith only when it takes', () => {
  const { sim, caster } = setup();
  const field = sim.fields[0]!;
  const before = sim.faith.faith;
  const bad = caster.cast(ABILITY_IDS.blessing, { kind: 'bless', of: 'field', id: 99999 });
  assert.deepEqual(bad, { ok: false, reason: 'target' });
  assert.equal(sim.faith.faith, before, 'a miss costs nothing');
  assert.deepEqual(caster.status(ABILITY_IDS.blessing).ready, true, 'and starts no cooldown');
  const ok = caster.cast(ABILITY_IDS.blessing, { kind: 'bless', of: 'field', id: field.id });
  assert.deepEqual(ok, { ok: true });
  assert.equal(sim.faith.faith, before - P.BLESSING.FAITH);
  assert.equal(sim.isBlessed('field', field.id), true);
  assert.deepEqual(
    caster.cast(ABILITY_IDS.blessing, { kind: 'bless', of: 'field', id: field.id }),
    {
      ok: false,
      reason: 'cooldown',
    },
  );
});

await check(
  'Kindle aims at an open site and finishes its stage; a finished building is no target',
  () => {
    const { sim, powers, caster, sunk } = setup();
    const site = openSite(sim);
    const kindle = def(ABILITY_IDS.kindle);
    const temple = sim.buildings.find((b) => b.type === 'temple')!;
    assert.equal(
      powers.resolveTarget(kindle, { pick: { kind: 'building', id: temple.id }, ground: null }).id,
      -1,
    );
    assert.deepEqual(
      powers.resolveTarget(kindle, { pick: { kind: 'building', id: site.id }, ground: null }),
      {
        kind: 'site',
        id: site.id,
      },
    );
    // beside the site on the ground works too; far away does not
    assert.equal(
      powers.resolveTarget(kindle, { pick: null, ground: { x: site.x + 3, z: site.z } }).id,
      site.id,
    );
    assert.equal(
      powers.resolveTarget(kindle, { pick: null, ground: { x: site.x + 500, z: site.z } }).id,
      -1,
    );
    const stage = site.stage;
    const before = sim.faith.faith;
    assert.deepEqual(caster.cast(ABILITY_IDS.kindle, { kind: 'site', id: site.id }), { ok: true });
    assert.equal(site.stage, stage + 1);
    assert.equal(sim.faith.faith, before - P.KINDLE.FAITH);
    assert.ok(
      sunk.some((e) => e.kind === 'stageCompleted'),
      'the view hears of it',
    );
  },
);

await check(
  'Provide fills the larder by its amount, costs faith, and says no when the larder is full',
  () => {
    const { sim, caster } = setup();
    sim.economy.update(0, sim.buildings);
    sim.economy.drainFood();
    const before = sim.faith.faith;
    const target = { kind: 'cursor' as const, id: 0, x: 0, z: 0 };
    assert.deepEqual(caster.cast(ABILITY_IDS.provide, target), { ok: true });
    assert.equal(sim.economy.stock.food, P.PROVIDE.FOOD);
    assert.equal(sim.faith.faith, before - P.PROVIDE.FAITH);
    caster.update(P.PROVIDE.COOLDOWN_S + 1);
    sim.economy.addFood(Number.POSITIVE_INFINITY);
    const f = sim.faith.faith;
    assert.deepEqual(caster.cast(ABILITY_IDS.provide, target), { ok: false, reason: 'target' });
    assert.equal(sim.faith.faith, f, 'nothing is paid for food that has no room');
  },
);

await check(
  'Call rain gathers a storm where the cursor is, and Clear skies parts it, for a while',
  () => {
    const { sim, powers, weather, caster, setClock } = setup();
    const call = def(ABILITY_IDS.callRain);
    const clear = def(ABILITY_IDS.clearSkies);
    const t0 = 10_000;
    // a day with no front of its own at the village
    const x = sim.seed.x;
    const z = sim.seed.z;
    const calm = Array.from({ length: 60 }, (_, i) => i + 3).find(
      (d) => !weather.frontOfDay(d - 1) && !weather.frontOfDay(d) && !weather.frontOfDay(d + 1),
    )!;
    const now = (calm + 0.5) * WEATHER.DAY_S;
    setClock(now);
    assert.equal(weather.rainAt(x, z, now), 0);
    const aim = { pick: null, ground: { x, z } };
    assert.equal(
      powers.resolveTarget(call, { pick: null, ground: null }).id,
      -1,
      'needs a place under the cursor',
    );
    assert.deepEqual(caster.cast(call.id, powers.resolveTarget(call, aim)), { ok: true });
    assert.ok(weather.rainAt(x, z, now) > 0.99, 'raining where it was called');
    assert.equal(weather.rainAt(x + 3000, z, now), 0, 'and only there');
    assert.ok(weather.rainAt(x, z, now + 120) > 0.5, 'the storm lingers');
    assert.equal(weather.rainAt(x, z, now + 2400), 0, 'and passes');
    caster.update(P.CLEAR_SKIES.COOLDOWN_S);
    assert.deepEqual(caster.cast(clear.id, powers.resolveTarget(clear, aim)), { ok: true });
    assert.equal(weather.rainAt(x, z, now), 0, 'a hole in the storm');
    assert.equal(weather.overcastAt(x, z, now), 0, 'and in the cloud');
    assert.ok(weather.rainAt(x, z, now + P.CLEAR_SKIES.SECONDS + 5) >= 0);
    void t0;
  },
);

await check('faith is needed: with too little a power is refused and nothing changes', () => {
  const { sim, caster } = setup();
  sim.addFaith(-sim.faith.faith + 5);
  assert.equal(sim.faith.faith, 5);
  const r = caster.cast(ABILITY_IDS.kindle, { kind: 'site', id: 1 });
  assert.deepEqual(r, { ok: false, reason: 'faith' });
  assert.equal(sim.faith.faith, 5);
  assert.equal(caster.status(ABILITY_IDS.kindle).reason, 'faith');
});

await check('cooldowns are saved and come back, dropping unknown powers and spent ones', () => {
  const { sim, caster } = setup();
  caster.cast(ABILITY_IDS.provide, { kind: 'cursor', id: 0, x: 0, z: 0 });
  sim.economy.drainFood();
  caster.update(100);
  const saved = caster.cooldowns();
  assert.equal(saved.length, 1);
  assert.equal(saved[0]![0], 'provide');
  assert.ok(Math.abs(saved[0]![1] - (P.PROVIDE.COOLDOWN_S - 100)) < 1e-6);
  const other = setup().caster;
  other.restore([...saved, ['nonsense', 5], ['kindle', 0]]);
  assert.deepEqual(other.cooldowns(), saved);
  assert.equal(other.status(ABILITY_IDS.provide).ready, false);
});

await check(
  'called storms and cleared skies are saved, pruned when over, and refused when damaged',
  () => {
    const { weather } = setup();
    const front = { x: 5, z: 6, dirX: -1, dirZ: 0, speed: 1, radius: 700, peak: 1, crossS: 20_000 };
    weather.addFront(front);
    weather.clearSkies({ x: 1, z: 2, radius: 1200, edgeM: 225, fromS: 20_000, untilS: 20_600 });
    const state = structuredClone(weather.serialize(20_100));
    assert.equal(state.fronts.length, 1);
    assert.equal(state.zones.length, 1);
    assert.equal(forcedWeatherProblem(state), null);
    // later: the hole is over, the front long gone
    assert.equal(weather.serialize(20_700).zones.length, 0);
    assert.equal(weather.serialize(20_000 + 200_000).fronts.length, 0);
    // restoring gives the same sky
    const twin = createWeather({ anchorX: 0, anchorZ: 0, seed: 7, windDirectionDeg: 270 });
    twin.restore(state);
    for (const t of [20_000, 20_100, 20_500]) {
      assert.equal(twin.rainAt(5, 6, t), weather.rainAt(5, 6, t));
      assert.equal(twin.rainAt(1, 2, t), weather.rainAt(1, 2, t));
    }
    for (const bad of [
      null,
      {},
      { fronts: [{}], zones: [] },
      { fronts: [], zones: [{ x: 1 }] },
      { fronts: 3, zones: [] },
    ]) {
      assert.ok(forcedWeatherProblem(bad), JSON.stringify(bad));
    }
  },
);

await check('the profile keeps the powers slice and refuses a damaged one', () => {
  const good = {
    cooldowns: [['kindle', 12.5]],
    weather: {
      fronts: [{ x: 1, z: 2, dirX: -1, dirZ: 0, speed: 1, radius: 700, peak: 1, crossS: 4000 }],
      zones: [{ x: 3, z: 4, radius: 1200, edgeM: 225, fromS: 4000, untilS: 4600 }],
    },
  };
  const r = parseProfile(rawProfile({ powers: good }));
  assert.ok(r.ok);
  assert.deepEqual((r as { ok: true; profile: { powers: unknown } }).profile.powers, good);
  for (const bad of [
    undefined,
    { ...good, cooldowns: 'x' },
    { ...good, cooldowns: [['kindle', -1]] },
    { ...good, cooldowns: [[5, 1]] },
    { ...good, weather: undefined },
    { ...good, weather: { fronts: [{ x: 1 }], zones: [] } },
  ]) {
    assert.equal(parseProfile(rawProfile({ powers: bad })).ok, false, JSON.stringify(bad));
  }
});

finish('all builder power checks passed');
