// scripts/checks/abilities/abilities-check.ts — headless checks of the ability cast pipeline (granted, cooldown, energy, faith, target).
// Run: node --experimental-strip-types scripts/checks/abilities/abilities-check.ts
import assert from 'node:assert/strict';
import type { AbilityDef } from '../../../src/abilities/abilities.ts';
import { createAbilityCaster } from '../../../src/abilities/caster.ts';
import { check, finish } from '../lib/check.ts';

// --- the cast pipeline ---

const POWER: AbilityDef = {
  id: 'power',
  name: 'Power',
  arch: 'void',
  cost: { energy: 10 },
  cooldownSec: 5,
  targeting: 'cursor',
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

const cursor = { kind: 'cursor' as const, x: 3, z: 4 };

await check('casting pays, performs and starts the cooldown', () => {
  const { c, log, energy } = caster({});
  assert.deepEqual(c.cast('power', cursor), { ok: true });
  assert.equal(energy(), 40);
  assert.deepEqual(log, ['perform:power', 'energy-10']);
  assert.equal(c.status('power').cooldownLeft, 5);
});

await check('a power on cooldown is refused until the cooldown has run down', () => {
  const { c, energy } = caster({});
  c.cast('power', cursor);
  assert.deepEqual(c.cast('power', cursor), { ok: false, reason: 'cooldown' });
  c.update(2);
  assert.equal(c.status('power').cooldownLeft, 3);
  assert.deepEqual(c.cast('power', cursor), { ok: false, reason: 'cooldown' });
  c.update(3);
  assert.equal(c.status('power').ready, true);
  assert.deepEqual(c.cast('power', cursor), { ok: true });
  assert.equal(energy(), 30);
});

await check(
  'not granted, too little energy, unknown id and wrong target are refused without paying',
  () => {
    const locked = caster({ granted: false });
    assert.deepEqual(locked.c.cast('power', cursor), { ok: false, reason: 'locked' });
    const poor = caster({ energy: 9 });
    assert.deepEqual(poor.c.cast('power', cursor), { ok: false, reason: 'energy' });
    assert.deepEqual(poor.c.cast('missing', cursor), { ok: false, reason: 'unknown' });
    const wrong = caster({});
    assert.deepEqual(wrong.c.cast('power', { kind: 'sky' }), { ok: false, reason: 'target' });
    for (const t of [locked, poor, wrong]) assert.equal(t.log.includes('energy-10'), false);
  },
);

await check('an effect that rejects its target costs nothing and starts no cooldown', () => {
  const { c, log, energy } = caster({ accept: false });
  assert.deepEqual(c.cast('power', cursor), { ok: false, reason: 'target' });
  assert.equal(energy(), 50);
  assert.equal(c.status('power').cooldownLeft, 0);
  assert.deepEqual(log, ['perform:power']);
});

await check('a faith cost needs faith to exist, then is paid in faith', () => {
  const none = caster({});
  assert.deepEqual(none.c.cast('costly', cursor), { ok: false, reason: 'faith' });
  const poor = caster({ faith: 4 });
  assert.deepEqual(poor.c.cast('costly', cursor), { ok: false, reason: 'faith' });
  const rich = caster({ faith: 9 });
  assert.deepEqual(rich.c.cast('costly', cursor), { ok: true });
  assert.ok(rich.log.includes('faith-5'));
});

finish('all ability checks passed');
