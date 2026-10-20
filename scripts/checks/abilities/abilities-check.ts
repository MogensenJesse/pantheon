// scripts/checks/abilities/abilities-check.ts — headless checks of the ability framework: the cast pipeline
// (granted, cooldown, energy, faith, target), the radial menu's geometry and the ability bar's rows.
// The powers themselves are in powers-check.ts.
// Run: node --experimental-strip-types scripts/checks/abilities/abilities-check.ts
import assert from 'node:assert/strict';
import { ABILITIES, type AbilityDef } from '../../../src/abilities/abilities.ts';
import { abilityView, describeCost, refusalText } from '../../../src/abilities/abilityView.ts';
import { createAbilityCaster } from '../../../src/abilities/caster.ts';
import { sectorAt, sectorDirection, stepPointer } from '../../../src/abilities/radial.ts';
import { SKILL_NODES } from '../../../src/skills/skillTree.ts';
import { check, finish } from '../lib/check.ts';

// --- the cast pipeline ---

const POWER: AbilityDef = {
  id: 'power',
  name: 'Power',
  arch: 'void',
  cost: { energy: 10 },
  cooldownSec: 5,
  targeting: 'villager',
};

function caster(over: { granted?: boolean; energy?: number; faith?: number; accept?: boolean }) {
  const log: string[] = [];
  let energy = over.energy ?? 50;
  let faith = over.faith;
  const c = createAbilityCaster({
    defs: [POWER, { ...POWER, id: 'costly', cost: { faith: 5 }, cooldownSec: 0 }],
    isGranted: () => over.granted ?? true,
    energy: () => energy,
    spendEnergy: (n) => {
      energy -= n;
      log.push(`energy-${n}`);
    },
    faith:
      faith === undefined
        ? undefined
        : {
            amount: () => faith as number,
            spend: (n) => {
              (faith as number) -= n;
              log.push(`faith-${n}`);
            },
          },
    perform: (def) => {
      log.push(`perform:${def.id}`);
      return over.accept ?? true;
    },
  });
  return { c, log, energy: () => energy };
}

const villager = { kind: 'villager' as const, id: 3 };

await check('casting pays, performs and starts the cooldown', () => {
  const { c, log, energy } = caster({});
  assert.deepEqual(c.cast('power', villager), { ok: true });
  assert.equal(energy(), 40);
  assert.deepEqual(log, ['perform:power', 'energy-10']);
  assert.equal(c.status('power').cooldownLeft, 5);
});

await check('a power on cooldown is refused until the cooldown has run down', () => {
  const { c, energy } = caster({});
  c.cast('power', villager);
  assert.deepEqual(c.cast('power', villager), { ok: false, reason: 'cooldown' });
  c.update(2);
  assert.equal(c.status('power').cooldownLeft, 3);
  assert.deepEqual(c.cast('power', villager), { ok: false, reason: 'cooldown' });
  c.update(3);
  assert.equal(c.status('power').ready, true);
  assert.deepEqual(c.cast('power', villager), { ok: true });
  assert.equal(energy(), 30);
});

await check('a paused world (no updates) holds the cooldown', () => {
  const { c } = caster({});
  c.cast('power', villager);
  c.update(0);
  assert.equal(c.status('power').cooldownLeft, 5);
});

await check(
  'not granted, too little energy, unknown id and wrong target are refused without paying',
  () => {
    const locked = caster({ granted: false });
    assert.deepEqual(locked.c.cast('power', villager), { ok: false, reason: 'locked' });
    const poor = caster({ energy: 9 });
    assert.deepEqual(poor.c.cast('power', villager), { ok: false, reason: 'energy' });
    assert.deepEqual(poor.c.cast('missing', villager), { ok: false, reason: 'unknown' });
    const wrong = caster({});
    assert.deepEqual(wrong.c.cast('power', { kind: 'sky' }), { ok: false, reason: 'target' });
    for (const t of [locked, poor, wrong]) assert.equal(t.log.includes('energy-10'), false);
  },
);

await check('an effect that rejects its target costs nothing and starts no cooldown', () => {
  const { c, log, energy } = caster({ accept: false });
  assert.deepEqual(c.cast('power', villager), { ok: false, reason: 'target' });
  assert.equal(energy(), 50);
  assert.equal(c.status('power').cooldownLeft, 0);
  assert.deepEqual(log, ['perform:power']);
});

await check('a faith cost needs faith to exist, then is paid in faith', () => {
  const none = caster({});
  assert.deepEqual(none.c.cast('costly', villager), { ok: false, reason: 'faith' });
  const poor = caster({ faith: 4 });
  assert.deepEqual(poor.c.cast('costly', villager), { ok: false, reason: 'faith' });
  const rich = caster({ faith: 9 });
  assert.deepEqual(rich.c.cast('costly', villager), { ok: true });
  assert.ok(rich.log.includes('faith-5'));
});

await check(
  'the shipped abilities are the three conversion powers and the five builder powers; only Murmur and the builder powers need no node',
  () => {
    assert.deepEqual(
      ABILITIES.filter((a) => a.arch === 'void').map((a) => a.id),
      ['murmur', 'dream', 'sign'],
    );
    assert.deepEqual(
      ABILITIES.filter((a) => a.arch === 'village').map((a) => a.id),
      ['blessing', 'kindle', 'provide', 'call_rain', 'clear_skies'],
    );
    for (const a of ABILITIES.filter((o) => o.arch === 'village')) {
      assert.equal(a.grantedWithVillage, true, `${a.id} comes with arch II`);
      assert.ok((a.cost.faith ?? 0) > 0 && !a.cost.energy, `${a.id} is paid in faith`);
      assert.ok(a.cooldownSec > 0);
    }
    assert.deepEqual(
      ABILITIES.filter((a) => a.grantedAtOpen).map((a) => a.id),
      ['murmur'],
    );
    for (const id of ['dream', 'sign']) {
      const node = SKILL_NODES.find((n) => n.ability === id);
      assert.ok(node, `a node grants ${id}`);
      assert.equal(node.cost, 1);
      assert.deepEqual(node.requires, []);
    }
  },
);

// --- the radial menu ---

await check('radial: four sectors point up, right, down and left, clockwise from the top', () => {
  const R = 100;
  assert.equal(sectorAt({ x: 0, y: -80 }, 4, R), 0);
  assert.equal(sectorAt({ x: 80, y: 0 }, 4, R), 1);
  assert.equal(sectorAt({ x: 0, y: 80 }, 4, R), 2);
  assert.equal(sectorAt({ x: -80, y: 0 }, 4, R), 3);
  assert.equal(sectorAt({ x: -5, y: -80 }, 4, R), 0, 'a little left of up is still up');
});

await check(
  'radial: nothing is chosen in the middle or with no sectors; one sector is anywhere',
  () => {
    assert.equal(sectorAt({ x: 5, y: 5 }, 4, 100), null);
    assert.equal(sectorAt({ x: 0, y: -80 }, 0, 100), null);
    assert.equal(sectorAt({ x: 60, y: 60 }, 1, 100), 0);
    assert.equal(sectorAt({ x: 0, y: -80 }, 3, 100), 0);
    assert.equal(sectorAt({ x: 70, y: 40 }, 3, 100), 1);
    assert.equal(sectorAt({ x: -70, y: 40 }, 3, 100), 2);
  },
);

await check('radial: the pointer follows the mouse and stays inside the ring', () => {
  assert.deepEqual(stepPointer({ x: 0, y: 0 }, 30, 40, 100), { x: 30, y: 40 });
  const far = stepPointer({ x: 90, y: 0 }, 500, 0, 100);
  assert.ok(Math.abs(Math.hypot(far.x, far.y) - 100) < 1e-9);
  assert.ok(Math.abs(sectorDirection(1, 4).x - 1) < 1e-9);
  assert.ok(Math.abs(sectorDirection(0, 4).y + 1) < 1e-9);
});

// --- the ability bar's rows ---

await check(
  'ability view: cost words, cooldown fraction and the reason a power is not ready',
  () => {
    assert.equal(describeCost(POWER), '10 energy');
    assert.equal(describeCost({ ...POWER, cost: { energy: 10, faith: 5 } }), '10 energy, 5 faith');
    assert.equal(describeCost({ ...POWER, cost: {} }), '');
    const cooling = abilityView(POWER, {
      id: 'power',
      ready: false,
      cooldownLeft: 2.5,
      reason: 'cooldown',
    });
    assert.equal(cooling.cooldownFraction, 0.5);
    assert.equal(cooling.note, 'Not ready yet');
    const ready = abilityView(POWER, { id: 'power', ready: true, cooldownLeft: 0 });
    assert.equal(ready.cooldownFraction, 0);
    assert.equal(ready.note, '');
    assert.equal(refusalText('energy'), 'Not enough energy');
  },
);

finish('all ability checks passed');
