// scripts/checks/abilities/builder-powers-check.ts — headless checks of the arch II powers (Call rain and Clear skies): aiming, effects, faith and cooldown rules, saved cooldowns and called storms.
// Run: node --experimental-strip-types scripts/checks/abilities/builder-powers-check.ts
import assert from 'node:assert/strict';
import {
  ABILITIES,
  ABILITY_IDS,
  type AbilityDef,
  abilityById,
} from '../../../src/abilities/abilities.ts';
import { type BuilderWorld, createBuilderPowers } from '../../../src/abilities/builderPowers.ts';
import { createAbilityCaster } from '../../../src/abilities/caster.ts';
import { VILLAGE } from '../../../src/config/village.ts';
import { WEATHER } from '../../../src/config/weather.ts';
import type { VillageEvent } from '../../../src/world/village/model/types.ts';
import type { VillageSim } from '../../../src/world/village/sim/villageSim.ts';
import { createWeather, forcedWeatherProblem } from '../../../src/world/weather/weather.ts';
import { check, finish } from '../lib/check.ts';
import { loadMap, makeSim } from '../lib/villageHeadless.ts';

const P = VILLAGE.BUILDER_POWERS;
const map = loadMap('island-mountain');
const def = (id: string) => abilityById(id) as AbilityDef;

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
  const world: BuilderWorld = {
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
  return { sim, world, powers, weather, caster, setClock: (t: number) => (clock = t) };
}

await check('the village powers are the two weather powers, granted with the village', () => {
  assert.deepEqual(
    ABILITIES.map((d) => d.id),
    [ABILITY_IDS.callRain, ABILITY_IDS.clearSkies],
  );
  for (const d of ABILITIES) {
    assert.equal(d.arch, 'village');
    assert.equal(d.targeting, 'sky');
    assert.equal(d.grantedWithVillage, true);
  }
});

await check('both powers need a place under the cursor, and a miss costs nothing', () => {
  const { sim, powers, caster } = setup();
  for (const id of [ABILITY_IDS.callRain, ABILITY_IDS.clearSkies]) {
    assert.equal(powers.resolveTarget(def(id), { ground: null }).id, -1, 'over the sky or a panel');
    assert.deepEqual(powers.resolveTarget(def(id), { ground: { x: 3, z: 4 } }), {
      kind: 'sky',
      id: 0,
      x: 3,
      z: 4,
    });
    const before = sim.faith.faith;
    assert.deepEqual(caster.cast(id, { kind: 'sky', id: -1 }), { ok: false, reason: 'target' });
    assert.equal(sim.faith.faith, before, 'a miss costs nothing');
    assert.equal(caster.status(id).ready, true, 'and starts no cooldown');
  }
});

await check(
  'Call rain gathers a storm where the cursor is, and Clear skies parts it, for a while',
  () => {
    const { sim, powers, weather, caster, setClock } = setup();
    const call = def(ABILITY_IDS.callRain);
    const clear = def(ABILITY_IDS.clearSkies);
    // a day with no front of its own at the village
    const x = sim.seed.x;
    const z = sim.seed.z;
    const calm = Array.from({ length: 60 }, (_, i) => i + 3).find(
      (d) => !weather.frontOfDay(d - 1) && !weather.frontOfDay(d) && !weather.frontOfDay(d + 1),
    )!;
    const now = (calm + 0.5) * WEATHER.DAY_S;
    setClock(now);
    assert.equal(weather.rainAt(x, z, now), 0);
    const aim = { ground: { x, z } };
    assert.equal(
      powers.resolveTarget(call, { ground: null }).id,
      -1,
      'needs a place under the cursor',
    );
    assert.deepEqual(caster.cast(call.id, powers.resolveTarget(call, aim)), { ok: true });
    const reach = P.CALL_RAIN.RADIUS_M + WEATHER.EDGE_M;
    assert.ok(weather.rainAt(x, z, now) > 0, 'raining where it was called');
    assert.equal(weather.rainAt(x + reach + 1, z, now), 0, 'and only there');
    assert.ok(weather.rainAt(x, z, now + 60) > 0, 'the storm lingers');
    const passes = (2 * reach) / (WEATHER.SPEED_MPS * P.CALL_RAIN.SPEED_MUL) + 1;
    assert.equal(weather.rainAt(x, z, now + passes), 0, 'and passes');
    caster.update(P.CLEAR_SKIES.COOLDOWN_S);
    assert.deepEqual(caster.cast(clear.id, powers.resolveTarget(clear, aim)), { ok: true });
    assert.equal(weather.rainAt(x, z, now), 0, 'a hole in the storm');
    assert.equal(weather.overcastAt(x, z, now), 0, 'and in the cloud');
    assert.ok(
      weather.rainAt(x, z, now + P.CLEAR_SKIES.SECONDS + 1) > 0,
      'the sky closes again when the time is up',
    );
  },
);

await check('faith is needed: with too little a power is refused and nothing changes', () => {
  const { sim, caster } = setup();
  sim.addFaith(-sim.faith.faith + 5);
  assert.equal(sim.faith.faith, 5);
  const r = caster.cast(ABILITY_IDS.callRain, { kind: 'sky', id: 0, x: 0, z: 0 });
  assert.deepEqual(r, { ok: false, reason: 'faith' });
  assert.equal(sim.faith.faith, 5);
  assert.equal(caster.status(ABILITY_IDS.callRain).reason, 'faith');
});

await check('cooldowns are saved and come back, dropping unknown powers and spent ones', () => {
  const { caster } = setup();
  assert.deepEqual(caster.cast(ABILITY_IDS.callRain, { kind: 'sky', id: 0, x: 0, z: 0 }), {
    ok: true,
  });
  caster.update(100);
  const saved = caster.cooldowns();
  assert.equal(saved.length, 1);
  assert.equal(saved[0]![0], 'call_rain');
  assert.ok(Math.abs(saved[0]![1] - (P.CALL_RAIN.COOLDOWN_S - 100)) < 1e-6);
  const other = setup().caster;
  other.restore([...saved, ['nonsense', 5], ['clear_skies', 0]]);
  assert.deepEqual(other.cooldowns(), saved);
  assert.equal(other.status(ABILITY_IDS.callRain).ready, false);
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

finish('all builder power checks passed');
