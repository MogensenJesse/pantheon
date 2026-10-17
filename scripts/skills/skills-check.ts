// scripts/skills/skills-check.ts — headless checks of the skill tree rules, the modifier record, the cast
// pipeline and the save migration that added the skills slice. The wiring into the running game
// (events, energy cap, orb range) is checked in the browser.
//
//   node --experimental-strip-types scripts/skills/skills-check.ts
import assert from 'node:assert/strict';
import { ABILITIES, type AbilityDef } from '../../src/abilities/abilities.ts';
import { createAbilityCaster } from '../../src/abilities/caster.ts';
import { migrateSnapshot } from '../../src/save/migrate.ts';
import { parseProfile } from '../../src/save/profile.ts';
import { SAVE_VERSION } from '../../src/save/snapshot.ts';
import { foldEffects, neutralModifiers } from '../../src/skills/modifiers.ts';
import {
  canUnlock,
  FIRST_SPARKS,
  grantedAbilities,
  grantSparks,
  modifiersOf,
  newSkillsState,
  openTree,
  parseSkills,
  respec,
  SKILL_NODES,
  type SkillNode,
  type SkillsState,
  spentSparks,
  treeProblems,
  unlock,
} from '../../src/skills/skillTree.ts';

let failures = 0;
async function check(name: string, fn: () => void | Promise<void>): Promise<void> {
  try {
    await fn();
    console.log(`ok   ${name}`);
  } catch (err) {
    failures++;
    console.log(`FAIL ${name}\n     ${(err as Error).message}`);
  }
}

const opened = (sparks: number, ranks: Record<string, number> = {}): SkillsState => ({
  opened: true,
  sparks,
  ranks,
});

/** Applies unlocks in order and returns the state; throws when one is refused. */
function take(state: SkillsState, ...ids: string[]): SkillsState {
  let s = state;
  for (const id of ids) {
    const r = unlock(s, id);
    if (!r.ok) throw new Error(`${id} refused: ${r.reason}`);
    s = r.state;
  }
  return s;
}

// A small tree for rules that need ranks, an ability and a longer chain.
const TEST_TREE: readonly SkillNode[] = [
  {
    id: 'a',
    arch: 'void',
    branch: 't',
    name: 'A',
    text: '',
    x: 0,
    y: 0,
    cost: 1,
    ranks: 3,
    requires: [],
    effects: [{ key: 'absorbRadiusMul', mul: 2 }],
    ability: 'power',
  },
  {
    id: 'b',
    arch: 'void',
    branch: 't',
    name: 'B',
    text: '',
    x: 1,
    y: 0,
    cost: 2,
    ranks: 1,
    requires: ['a'],
    effects: [{ key: 'energyCapAdd', add: 10 }],
  },
];

await check('the shipped tree is sound and its arch I nodes are the four passives', () => {
  assert.deepEqual(treeProblems(), []);
  assert.deepEqual(
    SKILL_NODES.filter((n) => n.arch === 'void')
      .map((n) => n.id)
      .sort(),
    ['echo', 'presence', 'resonance', 'surge'],
  );
});

await check('treeProblems finds duplicates, unknown and circular requirements', () => {
  const node = (id: string, requires: string[]): SkillNode => ({ ...TEST_TREE[0]!, id, requires });
  assert.match(treeProblems([node('a', []), node('a', [])]).join(), /duplicate/);
  assert.match(treeProblems([node('a', ['zzz'])]).join(), /unknown/);
  assert.match(treeProblems([node('a', ['b']), node('b', ['a'])]).join(), /circular/);
  assert.match(treeProblems([node('a', ['a'])]).join(), /itself/);
});

await check('a closed tree refuses everything; opening grants the first sparks once', () => {
  const closed = newSkillsState();
  assert.deepEqual(canUnlock(closed, 'resonance'), { ok: false, reason: 'closed' });
  const first = openTree(closed);
  assert.equal(first.opened, true);
  assert.equal(first.sparks, FIRST_SPARKS);
  assert.equal(openTree(first), first, 'a second opening changes nothing');
});

await check('unlock needs the prerequisites, then the sparks, and spends them', () => {
  const s = opened(2);
  assert.deepEqual(canUnlock(s, 'presence'), { ok: false, reason: 'locked' });
  assert.deepEqual(canUnlock(s, 'nope'), { ok: false, reason: 'unknown' });
  const afterRoot = take(s, 'resonance');
  assert.equal(afterRoot.sparks, 1);
  assert.deepEqual(afterRoot.ranks, { resonance: 1 });
  assert.deepEqual(canUnlock(afterRoot, 'surge'), { ok: false, reason: 'sparks' });
  assert.deepEqual(canUnlock(afterRoot, 'resonance'), { ok: false, reason: 'maxed' });
  assert.equal(take(afterRoot, 'presence').sparks, 0);
});

await check('unlock does not change the state it was given', () => {
  const s = opened(2);
  const before = JSON.stringify(s);
  take(s, 'resonance');
  assert.equal(JSON.stringify(s), before);
});

await check('ranks stack up to the cap and each costs sparks', () => {
  let s = opened(10);
  const r1 = unlock(s, 'a', TEST_TREE);
  assert.ok(r1.ok);
  s = (r1 as { ok: true; state: SkillsState }).state;
  for (let i = 0; i < 2; i++) {
    const r = unlock(s, 'a', TEST_TREE);
    assert.ok(r.ok);
    s = (r as { ok: true; state: SkillsState }).state;
  }
  assert.equal(s.ranks.a, 3);
  assert.equal(s.sparks, 7);
  assert.deepEqual(canUnlock(s, 'a', TEST_TREE), { ok: false, reason: 'maxed' });
});

await check('respec returns every spark and clears the ranks', () => {
  const s = take(opened(10), 'resonance', 'surge', 'presence');
  assert.equal(spentSparks(s), 4);
  const back = respec(s);
  assert.equal(back.sparks, 10);
  assert.deepEqual(back.ranks, {});
  assert.equal(back.opened, true);
  assert.deepEqual(modifiersOf(back), neutralModifiers());
});

await check('grantSparks adds whole positive counts only', () => {
  const s = opened(1);
  assert.equal(grantSparks(s, 2).sparks, 3);
  assert.equal(grantSparks(s, 0), s);
  assert.equal(grantSparks(s, -1), s);
  assert.equal(grantSparks(s, 1.5), s);
});

await check('modifiers: neutral with nothing taken, and each passive moves its own number', () => {
  assert.deepEqual(modifiersOf(opened(5)), neutralModifiers());
  const m = modifiersOf(take(opened(10), 'resonance', 'presence', 'echo', 'surge'));
  assert.equal(m.absorbRadiusMul, 1.6);
  assert.equal(m.lightReachMul, 1.5);
  assert.equal(m.orbFaithTrail, 1);
  assert.equal(m.energyCapAdd, 60);
});

await check('modifier ranks compound (multiply) or accumulate (add)', () => {
  const m = foldEffects([
    { effect: { key: 'absorbRadiusMul', mul: 2 }, times: 3 },
    { effect: { key: 'energyCapAdd', add: 5 }, times: 3 },
  ]);
  assert.equal(m.absorbRadiusMul, 8);
  assert.equal(m.energyCapAdd, 15);
});

await check('a node grants its ability only once it has a rank', () => {
  assert.deepEqual(grantedAbilities(opened(3), TEST_TREE), []);
  const s = (unlock(opened(3), 'a', TEST_TREE) as { ok: true; state: SkillsState }).state;
  assert.deepEqual(grantedAbilities(s, TEST_TREE), ['power']);
});

await check('parseSkills accepts a good slice and refuses damaged ones', () => {
  const good = { opened: true, sparks: 1, ranks: { resonance: 1 } };
  const r = parseSkills(good);
  assert.ok(r.ok);
  assert.deepEqual((r as { ok: true; skills: SkillsState }).skills, good);
  const bad: [string, unknown][] = [
    ['not a record', 5],
    ['opened missing', { sparks: 0, ranks: {} }],
    ['negative sparks', { opened: true, sparks: -1, ranks: {} }],
    ['fractional sparks', { opened: true, sparks: 0.5, ranks: {} }],
    ['unknown node', { opened: true, sparks: 0, ranks: { zzz: 1 } }],
    ['rank above cap', { opened: true, sparks: 0, ranks: { resonance: 2 } }],
    ['rank zero', { opened: true, sparks: 0, ranks: { resonance: 0 } }],
    ['sparks in a closed tree', { opened: false, sparks: 1, ranks: {} }],
    ['ranks in a closed tree', { opened: false, sparks: 0, ranks: { resonance: 1 } }],
    ['rank without its prerequisite', { opened: true, sparks: 0, ranks: { presence: 1 } }],
  ];
  for (const [what, value] of bad) assert.equal(parseSkills(value).ok, false, what);
});

// --- the save migration (version 1 had no skills slice) ---

const v1Profile = (phase: number) => ({
  game: { energy: 100, energyCap: 100, orbsAbsorbed: 20, phase, memoryFragments: [] },
});

await check('the save version moved up for the skills slice', () => {
  assert.equal(SAVE_VERSION >= 2, true);
});

await check('migrating 1 to 2 opens the tree (first sparks) for a game past the cap', () => {
  const out = migrateSnapshot({ version: 1, profile: v1Profile(1) }, 1, 2);
  assert.deepEqual((out.profile as { skills: unknown }).skills, {
    opened: true,
    sparks: FIRST_SPARKS,
    ranks: {},
  });
  assert.equal(out.version, 2);
});

await check('migrating 1 to 2 leaves the tree closed for a game before the cap', () => {
  const out = migrateSnapshot({ version: 1, profile: v1Profile(0) }, 1, 2);
  assert.deepEqual((out.profile as { skills: unknown }).skills, {
    opened: false,
    sparks: 0,
    ranks: {},
  });
});

await check(
  'migrating 1 to 2 keeps a slice that is already there and tolerates a missing profile',
  () => {
    const keep = { opened: true, sparks: 9, ranks: {} };
    const out = migrateSnapshot({ version: 1, profile: { ...v1Profile(1), skills: keep } }, 1, 2);
    assert.deepEqual((out.profile as { skills: unknown }).skills, keep);
    assert.doesNotThrow(() => migrateSnapshot({ version: 1 }, 1, 2));
  },
);

const fullProfile = (skills: unknown) => ({
  game: { energy: 50, energyCap: 160, orbsAbsorbed: 10, phase: 1, memoryFragments: [1, 3] },
  dayCycle: { reveal: 'looping', introElapsed: 5, elapsed: 100 },
  player: { x: 1, z: 2 },
  camera: { yaw: 0, pitch: 0.4 },
  orbs: { absorbed: [{ x: 1, z: 2 }] },
  clocks: { elapsed: 100, windClock: 100 },
  skills,
});

await check('parseProfile keeps the skills slice and refuses a profile without a good one', () => {
  const good = { opened: true, sparks: 0, ranks: { resonance: 1, surge: 1 } };
  const r = parseProfile(fullProfile(good));
  assert.ok(r.ok);
  assert.deepEqual((r as { ok: true; profile: { skills: unknown } }).profile.skills, good);
  assert.equal(parseProfile(fullProfile(undefined)).ok, false);
  assert.equal(parseProfile(fullProfile({ opened: true, sparks: -2, ranks: {} })).ok, false);
});

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

await check('the shipped ability list is empty until the first power arrives', () => {
  assert.equal(ABILITIES.length, 0);
});

if (failures > 0) {
  console.log(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log('\nall skill checks passed');
