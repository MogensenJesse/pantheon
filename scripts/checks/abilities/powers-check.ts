// scripts/checks/abilities/powers-check.ts — headless checks of the three conversion powers on a real hamlet:
// who a power can reach, what Murmur, Dream and Sign do to belief, how villagers react (stand still and
// look at the orb), energy, the once-a-night rule, and the powers through the cast pipeline.
// Run: node --experimental-strip-types scripts/checks/abilities/powers-check.ts
import assert from 'node:assert/strict';
import { ABILITIES, abilityById } from '../../../src/abilities/abilities.ts';
import { createAbilityCaster } from '../../../src/abilities/caster.ts';
import {
  castSign,
  createNightClock,
  createPowers,
  nearestHouse,
  nearestVillager,
  type PowerWorld,
  sleepersOf,
  witnessesWithin,
} from '../../../src/abilities/powers.ts';
import { PHASE0 } from '../../../src/config/phase0.ts';
import { Mode, type VillageEvent } from '../../../src/world/village/model/types.ts';
import type { VillageSim } from '../../../src/world/village/sim/villageSim.ts';
import { check, finish } from '../lib/check.ts';
import { loadMap, makeSim, simulate } from '../lib/villageHeadless.ts';

const { MURMUR, DREAM, SIGN } = PHASE0.POWERS;
const map = loadMap('island-mountain');
const DT = 0.1;

/** A hamlet run to a time of day: 0.4 is mid-morning (people out), 0.95 deep night (people asleep). */
function hamletAt(phase: number, hours = 0.6): { sim: VillageSim; events: VillageEvent[] } {
  const sim = makeSim(map, { mode: 'hamlet' });
  simulate(sim, { hours, phase: () => phase, vigil: false, presence: false });
  return { sim, events: [] };
}

const worldOf = (sim: VillageSim, events: VillageEvent[]): PowerWorld => ({
  villagers: sim.villagers,
  buildings: sim.buildings,
  addBelief: (i, amount) => sim.addBelief(i, amount, events),
  notice: sim.notice,
});

/** Advances the sim a number of seconds at a fixed time of day, with a callback each step. */
function advance(
  sim: VillageSim,
  events: VillageEvent[],
  seconds: number,
  phase: number,
  each?: (t: number) => void,
) {
  for (let t = 0; t < seconds; t += DT) {
    sim.beginStep();
    sim.update(
      DT,
      { playerDistM: 10, presenceActive: true, dayPhase: phase, vigil: false, rain01: 0 },
      events,
    );
    each?.(t);
  }
}

const meter = (start: number) => {
  const state = { energy: start };
  return {
    state,
    amount: () => state.energy,
    spend: (n: number) => {
      state.energy -= n;
    },
  };
};

const outdoors = (sim: VillageSim): number[] => {
  const out: number[] = [];
  for (let i = 0; i < sim.villagers.count; i++) if (!sim.villagers.indoors[i]) out.push(i);
  return out;
};

// ---------- who a power can reach ----------

await check(
  'the night clock counts nights: one more at each sunset, none at a dusk that goes back',
  () => {
    const night = createNightClock();
    for (const p of [0.3, 0.5, 0.7]) night.update(p);
    assert.equal(night.id(), 0);
    assert.equal(night.isNight(), false);
    night.update(0.76);
    assert.equal(night.id(), 1);
    assert.equal(night.isNight(), true);
    for (const p of [0.9, 0.99, 0.05, 0.2]) night.update(p);
    assert.equal(night.id(), 1, 'the whole night is one night');
    for (const p of [0.3, 0.6, 0.8]) night.update(p);
    assert.equal(night.id(), 2);
    assert.equal(createNightClock().isNight(), false, 'unknown before the first update');
  },
);

await check('nearest villager and house: by distance, outdoors only, within range', () => {
  const { sim, events } = hamletAt(0.4);
  const world = worldOf(sim, events);
  const out = outdoors(sim);
  assert.ok(out.length >= 4, `${out.length} outdoors`);
  const v = sim.villagers;
  const me = out[0]!;
  const at = { x: v.x[me]! + 0.2, z: v.z[me]! };
  const found = nearestVillager(world, at, 6);
  assert.ok(found >= 0);
  const d = (i: number) => Math.hypot(v.x[i]! - at.x, v.z[i]! - at.z);
  for (const i of out) assert.ok(d(found) <= d(i) + 1e-9, 'nobody is nearer');
  assert.equal(nearestVillager(world, { x: v.x[me]! + 500, z: v.z[me]! }, 6), -1, 'out of range');
  const house = sim.buildings.find((b) => b.type.startsWith('house_'))!;
  assert.equal(nearestHouse(world, { x: house.x + 1, z: house.z }, 14)?.id, house.id);
  assert.equal(nearestHouse(world, { x: house.x + 500, z: house.z }, 14), null);
  const temple = sim.buildings.find((b) => b.type === 'temple')!;
  assert.notEqual(
    nearestHouse(world, { x: temple.x, z: temple.z }, 5)?.type,
    'temple',
    'only houses',
  );
});

await check(
  'at night the sleepers are indoors in their houses; by day the houses are empty of sleepers',
  () => {
    const night = hamletAt(0.95);
    const w = worldOf(night.sim, night.events);
    const houses = night.sim.buildings.filter((b) => b.type.startsWith('house_'));
    const sleeping = houses.map((h) => sleepersOf(w, h.id).length);
    assert.ok(sleeping.reduce((a, b) => a + b, 0) >= 4, `sleepers per house ${sleeping}`);
    const day = hamletAt(0.4);
    const wd = worldOf(day.sim, day.events);
    assert.equal(
      day.sim.buildings
        .filter((b) => b.type.startsWith('house_'))
        .reduce((n, h) => n + sleepersOf(wd, h.id).length, 0),
      0,
    );
  },
);

// ---------- Murmur ----------

await check(
  'Murmur: belief rises 1 in 20 s, energy drains a second at a time, the villager stands and faces the orb',
  () => {
    const { sim, events } = hamletAt(0.4);
    const world = worldOf(sim, events);
    const e = meter(100);
    const powers = createPowers(world, e);
    const v = sim.villagers;
    const target = outdoors(sim).find((i) => i !== sim.elder)!;
    const orb = { x: v.x[target]! + 2, z: v.z[target]! };
    assert.equal(powers.murmur.start(target, orb), true);
    assert.equal(powers.murmur.active(), true);
    const x0 = v.x[target]!;
    const z0 = v.z[target]!;
    const before = v.belief[target]!;
    advance(sim, events, 10, 0.4, () => powers.murmur.update(DT, orb));
    assert.ok(Math.abs(v.belief[target]! - before - 0.5) < 0.02, `belief ${v.belief[target]}`);
    assert.ok(Math.abs(100 - e.state.energy - 10) < 0.2, `energy used ${100 - e.state.energy}`);
    assert.ok(Math.hypot(v.x[target]! - x0, v.z[target]! - z0) < 1e-6, 'they did not walk away');
    const yaw = Math.atan2(orb.x - v.x[target]!, orb.z - v.z[target]!);
    assert.ok(
      Math.abs(Math.atan2(Math.sin(v.yaw[target]! - yaw), Math.cos(v.yaw[target]! - yaw))) < 1e-3,
      'facing the orb',
    );
    advance(sim, events, 11, 0.4, () => powers.murmur.update(DT, orb));
    assert.equal(v.belief[target], 1, 'a believer');
    assert.equal(powers.murmur.active(), false, 'the channel ended by itself');
    assert.ok(
      Math.abs(100 - e.state.energy - 20) < 0.5,
      `20 energy for a convert: ${100 - e.state.energy}`,
    );
    assert.equal(events.filter((x) => x.kind === 'villagerConverted').length, 1);
  },
);

await check(
  'Murmur ends when the orb walks away, when the energy runs out, or when it is cast again',
  () => {
    const a = hamletAt(0.4);
    const target = outdoors(a.sim).find((i) => i !== a.sim.elder)!;
    const v = a.sim.villagers;
    const p = createPowers(worldOf(a.sim, a.events), meter(100));
    assert.equal(p.murmur.start(target, { x: v.x[target]!, z: v.z[target]! }), true);
    p.murmur.update(DT, { x: v.x[target]! + MURMUR.RANGE_M + 1, z: v.z[target]! });
    assert.equal(p.murmur.active(), false, 'out of range');
    const low = meter(1.5);
    const p2 = createPowers(worldOf(a.sim, a.events), low);
    p2.murmur.start(target, { x: v.x[target]!, z: v.z[target]! });
    for (let t = 0; t < 4; t += DT) p2.murmur.update(DT, { x: v.x[target]!, z: v.z[target]! });
    assert.equal(p2.murmur.active(), false, 'no energy left');
    assert.ok(low.state.energy >= 0 && low.state.energy < 0.2, `energy ${low.state.energy}`);
    const p3 = createPowers(worldOf(a.sim, a.events), meter(100));
    const orb = { x: v.x[target]!, z: v.z[target]! };
    const murmur = abilityById('murmur')!;
    assert.equal(p3.perform(murmur, p3.resolveTarget(murmur, orb), orb), true);
    assert.equal(p3.murmur.active(), true);
    assert.equal(p3.perform(murmur, p3.resolveTarget(murmur, orb), orb), true);
    assert.equal(p3.murmur.active(), false, 'cast again: it ends');
  },
);

await check('Murmur will not start on someone indoors or out of reach', () => {
  const night = hamletAt(0.95);
  const v = night.sim.villagers;
  const p = createPowers(worldOf(night.sim, night.events), meter(100));
  const inside = [...Array(v.count).keys()].find((i) => v.indoors[i])!;
  assert.equal(p.murmur.start(inside, { x: v.x[inside]!, z: v.z[inside]! }), false);
  const day = hamletAt(0.4);
  const dv = day.sim.villagers;
  const q = createPowers(worldOf(day.sim, day.events), meter(100));
  const t = outdoors(day.sim)[0]!;
  assert.equal(q.murmur.start(t, { x: dv.x[t]! + 50, z: dv.z[t]! }), false);
  assert.equal(q.murmur.start(-1, { x: 0, z: 0 }), false);
});

await check('after the channel the villager goes about their day again', () => {
  const { sim, events } = hamletAt(0.4);
  const v = sim.villagers;
  const p = createPowers(worldOf(sim, events), meter(100));
  // Someone on the move (workers and the praying stand still anyway).
  let t = -1;
  for (let tries = 0; tries < 600 && t < 0; tries++) {
    advance(sim, events, 5, 0.4);
    t = [...Array(v.count).keys()].find((i) => !v.indoors[i] && v.mode[i] === Mode.Walking) ?? -1;
  }
  assert.ok(t >= 0, 'someone is walking');
  const orb = { x: v.x[t]! + 1, z: v.z[t]! };
  p.murmur.start(t, orb);
  const x0 = v.x[t]!;
  const z0 = v.z[t]!;
  advance(sim, events, 3, 0.4, () => p.murmur.update(DT, orb));
  assert.ok(Math.hypot(v.x[t]! - x0, v.z[t]! - z0) < 1e-6, 'held still while murmured to');
  p.murmur.stop();
  advance(sim, events, 5, 0.4);
  assert.ok(Math.hypot(v.x[t]! - x0, v.z[t]! - z0) > 0.5, 'then they walked on');
});

await check(
  'a dying villager cannot be reached, and a channel follows the villager who moves into a freed slot',
  () => {
    const { sim, events } = hamletAt(0.4);
    const v = sim.villagers;
    const outs = outdoors(sim);
    const [a, b] = [outs[0]!, outs[1]!];
    const p = createPowers(worldOf(sim, events), meter(100));
    // Murmur on b; a dies and the last villager (or b itself) moves: the channel must stay on the same person.
    const orb = { x: v.x[b]! + 1, z: v.z[b]! };
    assert.equal(p.murmur.start(b, orb), true);
    p.murmur.villagerRemoved(a, b); // b moved into a's slot
    assert.equal(p.murmur.target(), a, 'the channel followed b into the new slot');
    p.murmur.villagerRemoved(a, -1); // that villager is removed
    assert.equal(p.murmur.active(), false, 'the channel ends when its villager is gone');
    assert.equal(p.murmur.start(b, orb), true);
    p.murmur.villagerRemoved(99, 98); // someone else
    assert.equal(p.murmur.target(), b, 'unrelated removals leave the channel alone');
    p.murmur.stop();
    // a villager who is dying is not a target, does not see a Sign and is not asleep for a Dream
    v.dying[b] = 1;
    assert.equal(p.murmur.start(b, orb), false);
    assert.notEqual(nearestVillager(worldOf(sim, events), orb, 3), b);
    assert.ok(!witnessesWithin(worldOf(sim, events), orb, 50).includes(b));
  },
);

// ---------- Dream ----------

await check(
  'Dream: every sleeper in the nearest house gains belief, once per house per night',
  () => {
    const { sim, events } = hamletAt(0.95);
    const world = worldOf(sim, events);
    const powers = createPowers(world, meter(100));
    powers.night.update(0.9);
    const house = sim.buildings
      .filter((b) => b.type.startsWith('house_'))
      .find((h) => sleepersOf(world, h.id).length > 0)!;
    const sleepers = sleepersOf(world, house.id);
    const before = sleepers.map((i) => sim.villagers.belief[i]!);
    assert.equal(powers.dream.canDream(house.id), true);
    assert.equal(powers.dream.cast(house.id), true);
    for (const [k, i] of sleepers.entries()) {
      assert.ok(Math.abs(sim.villagers.belief[i]! - before[k]! - DREAM.BELIEF) < 1e-6);
    }
    assert.equal(powers.dream.cast(house.id), false, 'not twice in one night');
    assert.equal(powers.dream.canDream(house.id), false);
    // Next night: day, then dusk again.
    for (const p of [0.3, 0.5, 0.7, 0.8, 0.9]) powers.night.update(p);
    assert.equal(powers.dream.canDream(house.id), true, 'a new night');
    assert.equal(powers.dream.cast(house.id), true);
    assert.equal(powers.dream.cast(-1), false, 'no such house');
  },
);

await check(
  'Dream finds nothing by day (nobody asleep) and the target is the nearest house in range',
  () => {
    const { sim, events } = hamletAt(0.4);
    const powers = createPowers(worldOf(sim, events), meter(100));
    const dream = abilityById('dream')!;
    const house = sim.buildings.find((b) => b.type.startsWith('house_'))!;
    const orb = { x: house.x + 2, z: house.z };
    assert.deepEqual(powers.resolveTarget(dream, orb), { kind: 'house', id: house.id });
    assert.equal(
      powers.perform(dream, { kind: 'house', id: house.id }, orb),
      false,
      'nobody asleep by day',
    );
    assert.deepEqual(powers.resolveTarget(dream, { x: house.x + 900, z: house.z }), {
      kind: 'house',
      id: -1,
    });
  },
);

// ---------- Sign ----------

await check(
  'Sign: everyone outdoors within 25 m gains belief and stops to look; others do not',
  () => {
    const { sim, events } = hamletAt(0.4);
    const world = worldOf(sim, events);
    const v = sim.villagers;
    const t = sim.buildings.find((b) => b.type === 'temple')!;
    const at = { x: t.x, z: t.z };
    const seen = witnessesWithin(world, at, SIGN.RANGE_M);
    const unseen = [...Array(v.count).keys()].filter((i) => !seen.includes(i));
    assert.ok(seen.length >= 1, `${seen.length} can see it`);
    const x0 = seen.map((i) => v.x[i]!);
    assert.equal(castSign(world, at), true);
    for (const i of seen) assert.ok(Math.abs(v.belief[i]! - SIGN.BELIEF) < 1e-6, `witness ${i}`);
    for (const i of unseen) assert.equal(v.belief[i], 0, `${i} did not see it`);
    advance(sim, events, 2, 0.4);
    for (const [k, i] of seen.entries()) {
      assert.ok(Math.abs(v.x[i]! - x0[k]!) < 1e-6, 'they stand and look');
    }
    advance(sim, events, SIGN.NOTICE_S + 60, 0.4);
    assert.equal(castSign(world, { x: t.x + 5000, z: t.z }), false, 'a sign that nobody sees');
  },
);

await check(
  'signs spread belief through the village: five converts come from signs alone, and belief never converts the village by itself',
  () => {
    const { sim, events } = hamletAt(0.4, 0.1);
    const world = worldOf(sim, events);
    let casts = 0;
    for (; casts < 80 && sim.believers() < 5; casts++) {
      // Walk the orb to someone who is out and about, and let a sign shine there.
      const out = outdoors(sim);
      const who = out.length > 0 ? out[casts % out.length]! : -1;
      if (who >= 0) castSign(world, { x: sim.villagers.x[who]!, z: sim.villagers.z[who]! });
      advance(sim, events, 6, 0.35 + (casts % 5) * 0.05);
    }
    assert.ok(sim.believers() >= 5, `${casts} signs, ${sim.believers()} believers`);
    assert.equal(sim.converted, false, "converting the village is the quest's last step");
    assert.equal(
      events.some((x) => x.kind === 'villageConverted'),
      false,
    );
    console.log(`     (${casts} signs)`);
  },
);

// ---------- through the cast pipeline ----------

await check(
  'through the caster: Sign pays 12 and waits 30 s; Dream with no target pays nothing; Murmur toggles for free',
  () => {
    const { sim, events } = hamletAt(0.4);
    const e = meter(100);
    const powers = createPowers(worldOf(sim, events), e);
    const t = sim.buildings.find((b) => b.type === 'temple')!;
    const orb = { x: t.x, z: t.z };
    const caster = createAbilityCaster({
      defs: ABILITIES,
      isGranted: () => true,
      energy: e.amount,
      spendEnergy: e.spend,
      perform: (def, target) => powers.perform(def, target, orb),
    });
    const cast = (id: string) => caster.cast(id, powers.resolveTarget(abilityById(id)!, orb));
    assert.deepEqual(cast('sign'), { ok: true });
    assert.equal(e.state.energy, 100 - SIGN.COST);
    assert.deepEqual(cast('sign'), { ok: false, reason: 'cooldown' });
    caster.update(SIGN.COOLDOWN_SEC);
    assert.equal(caster.status('sign').ready, true);
    const before = e.state.energy;
    assert.deepEqual(cast('dream'), { ok: false, reason: 'target' }, 'nobody asleep by day');
    assert.equal(e.state.energy, before, 'nothing was paid');
    const near = nearestVillager(worldOf(sim, events), orb, MURMUR.RANGE_M);
    if (near >= 0) {
      assert.deepEqual(cast('murmur'), { ok: true });
      assert.equal(e.state.energy, before, 'the channel costs nothing to start');
      assert.equal(powers.murmur.active(), true);
      assert.deepEqual(cast('murmur'), { ok: true });
      assert.equal(powers.murmur.active(), false);
    }
    const poor = meter(0.5);
    const q = createAbilityCaster({
      defs: ABILITIES,
      isGranted: () => true,
      energy: poor.amount,
      spendEnergy: poor.spend,
      perform: () => true,
    });
    assert.deepEqual(
      q.cast('murmur', { kind: 'villager', id: 0 }),
      { ok: false, reason: 'energy' },
      'a channel needs a second of energy',
    );
    assert.deepEqual(q.cast('sign', { kind: 'cursor', x: 0, z: 0 }), {
      ok: false,
      reason: 'energy',
    });
  },
);

// ---------- the gate (the elder waits for his quest step) ----------

await check(
  'a villager who cannot believe yet is not targeted by Murmur and gains nothing from Sign or Dream',
  () => {
    const { sim, events } = hamletAt(0.4);
    const v = sim.villagers;
    const out = outdoors(sim);
    const gated = out[0]!;
    let open = false;
    const world: PowerWorld = {
      ...worldOf(sim, events),
      canBelieve: (i) => i !== gated || open,
    };
    const powers = createPowers(world, meter(100));
    const orb = { x: v.x[gated]!, z: v.z[gated]! };
    assert.notEqual(powers.murmurTarget(orb), gated, 'the ring never sits on the gated villager');
    const murmur = abilityById('murmur')!;
    assert.equal(powers.perform(murmur, { kind: 'villager', id: gated }, orb), false);
    const sign = abilityById('sign')!;
    assert.equal(powers.perform(sign, { kind: 'cursor', x: orb.x, z: orb.z }, orb), true);
    assert.equal(v.belief[gated], 0, 'a sign does not move their belief');
    const others = out.filter(
      (i) => i !== gated && Math.hypot(v.x[i]! - orb.x, v.z[i]! - orb.z) <= SIGN.RANGE_M,
    );
    assert.ok(others.length >= 1, 'someone else is in earshot');
    for (const i of others) assert.ok(v.belief[i]! > 0, `${i} took it to heart`);
    // Dream: the gated sleeper is skipped, the rest of the house is not.
    const night = hamletAt(0.95);
    const nv = night.sim.villagers;
    const house = night.sim.buildings.find(
      (b) =>
        b.type.startsWith('house_') &&
        sleepersOf(worldOf(night.sim, night.events), b.id).length >= 2,
    );
    assert.ok(house, 'a house with two sleepers at night');
    {
      const sleepers = sleepersOf(worldOf(night.sim, night.events), house.id);
      const blocked = sleepers[0]!;
      const nightWorld: PowerWorld = {
        ...worldOf(night.sim, night.events),
        canBelieve: (i) => i !== blocked,
      };
      const np = createPowers(nightWorld, meter(100));
      np.night.update(0.9);
      assert.equal(np.dream.cast(house.id), true);
      assert.equal(nv.belief[blocked], 0);
      for (const i of sleepers.slice(1)) assert.ok(nv.belief[i]! > 0, `sleeper ${i}`);
    }
    // Once the gate opens they can be reached like anyone.
    open = true;
    assert.equal(powers.perform(murmur, { kind: 'villager', id: gated }, orb), true);
  },
);

await check('the three powers are set up as the game expects (shape, not tuning)', () => {
  assert.deepEqual(
    ABILITIES.filter((d) => d.arch === 'void').map((d) => d.id),
    ['murmur', 'dream', 'sign'],
  );
  const [murmur, dream, sign] = ABILITIES;
  assert.equal(murmur!.grantedAtOpen, true, 'Murmur comes with the tree');
  assert.equal(dream!.grantedAtOpen, undefined, 'Dream and Sign need a node');
  assert.equal(sign!.grantedAtOpen, undefined);
  assert.ok(murmur!.drainPerSec! > 0, 'Murmur is a channel');
  assert.ok(dream!.cost.energy! > 0 && sign!.cost.energy! > 0);
  assert.ok(sign!.cooldownSec > 0);
  assert.ok(MURMUR.RANGE_M < SIGN.RANGE_M, 'a sign reaches further than a murmur');
  assert.ok(MURMUR.SECONDS > 0 && DREAM.BELIEF > 0 && SIGN.BELIEF > 0);
});

finish('all power checks passed');
