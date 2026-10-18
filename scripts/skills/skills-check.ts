// scripts/skills/skills-check.ts — headless checks of the skill tree rules, the modifier record, the cast
// pipeline. The wiring into the running game
// (events, energy cap, orb range) is checked in the browser.
//
//   node --experimental-strip-types scripts/skills/skills-check.ts
import assert from 'node:assert/strict';
import { ABILITIES, type AbilityDef } from '../../src/abilities/abilities.ts';
import { abilityView, describeCost, refusalText } from '../../src/abilities/abilityView.ts';
import { createAbilityCaster } from '../../src/abilities/caster.ts';
import { sectorAt, sectorDirection, stepPointer } from '../../src/abilities/radial.ts';
import { parseProfile } from '../../src/save/profile.ts';
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
import {
  clampPan,
  clampScale,
  describeEffect,
  fitView,
  MAX_SCALE,
  MIN_SCALE,
  NODE_SPACING_PX,
  nodeStatus,
  nodeTooltip,
  sparksLabel,
  treeBounds,
  treeEdges,
  unlockRefusalText,
  zoomAt,
} from '../../src/skills/skillView.ts';

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

await check('the shipped tree is sound and holds the eight arch I nodes', () => {
  assert.deepEqual(treeProblems(), []);
  assert.deepEqual(
    SKILL_NODES.filter((n) => n.arch === 'void')
      .map((n) => n.id)
      .sort(),
    ['attunement', 'dream', 'echo', 'presence', 'renewal', 'resonance', 'sign', 'surge'],
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

await check('a closed tree takes no sparks (a save would refuse them)', () => {
  const closed = newSkillsState();
  assert.equal(grantSparks(closed, 3), closed);
  assert.equal(grantSparks(openTree(closed), 3).sparks, 2 + 3);
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

const fullProfile = (skills: unknown) => ({
  game: { energy: 50, energyCap: 160, orbsAbsorbed: 10, phase: 1, memoryFragments: [1, 3] },
  dayCycle: { reveal: 'looping', introElapsed: 5, elapsed: 100 },
  player: { x: 1, z: 2 },
  camera: { yaw: 0, pitch: 0.4 },
  orbs: { absorbed: [{ x: 1, z: 2 }], relocated: [], respawn: { remainingSec: 100, rng: null } },
  clocks: { elapsed: 100, windClock: 100 },
  skills,
  quest: { step: 0, progress: 0, done: false, beats: [] },
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

await check(
  'the shipped abilities are the three conversion powers, and only Murmur needs no node',
  () => {
    assert.deepEqual(
      ABILITIES.map((a) => a.id),
      ['murmur', 'dream', 'sign'],
    );
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

// --- the panel's view rules ---

await check('node status: locked, short of sparks, available, taken', () => {
  const byId = (id: string) => SKILL_NODES.find((n) => n.id === id) as SkillNode;
  assert.equal(nodeStatus(opened(2), byId('presence')), 'locked');
  assert.equal(nodeStatus(opened(2), byId('resonance')), 'available');
  const afterRoot = take(opened(1), 'resonance');
  assert.equal(nodeStatus(afterRoot, byId('resonance')), 'taken');
  assert.equal(nodeStatus(afterRoot, byId('surge')), 'short');
  assert.equal(nodeStatus(afterRoot, byId('presence')), 'short', 'met requirement, no sparks');
  assert.equal(nodeStatus(afterRoot, byId('echo')), 'locked', 'presence not taken yet');
  assert.equal(
    nodeStatus(newSkillsState(), byId('resonance')),
    'locked',
    'a closed tree is all locked',
  );
});

await check('node status: a node with ranks left is "progress" once started', () => {
  const a = TEST_TREE[0] as SkillNode;
  const started = (unlock(opened(5), 'a', TEST_TREE) as { ok: true; state: SkillsState }).state;
  assert.equal(nodeStatus(started, a, TEST_TREE), 'progress');
  assert.equal(nodeStatus(opened(5), a, TEST_TREE), 'available');
});

await check('tooltips say what a node does, what it costs and what it needs', () => {
  const byId = (id: string) => SKILL_NODES.find((n) => n.id === id) as SkillNode;
  const surge = nodeTooltip(opened(1, { resonance: 1 }), byId('surge'));
  assert.equal(surge.title, 'Surge');
  assert.match(surge.body, /Cost: 2 sparks/);
  assert.match(surge.inspect, /Energy cap \+60/);
  assert.match(surge.inspect, /You have 1 spark\b/);
  const presence = nodeTooltip(opened(2), byId('presence'));
  assert.match(presence.inspect, /Needs Resonance/);
  assert.match(nodeTooltip(take(opened(2), 'resonance'), byId('resonance')).body, /Taken/);
  const ranked = nodeTooltip(opened(5), TEST_TREE[0] as SkillNode, TEST_TREE);
  assert.equal(ranked.title, 'A (0/3)');
});

await check('a node that grants a power says so in its details', () => {
  const dream = SKILL_NODES.find((n) => n.id === 'dream') as SkillNode;
  const tip = nodeTooltip(opened(2), dream);
  assert.equal(tip.title, 'Dream');
  assert.match(tip.inspect, /A power: cast it from the radial menu/);
  assert.match(tip.body, /Cost: 1 spark/);
  const resonance = nodeTooltip(
    opened(2),
    SKILL_NODES.find((n) => n.id === 'resonance') as SkillNode,
  );
  assert.doesNotMatch(resonance.inspect, /A power/);
});

await check('effects and counts read as words', () => {
  assert.equal(describeEffect({ key: 'absorbRadiusMul', mul: 1.6 }), 'Pickup range ×1.6');
  assert.equal(describeEffect({ key: 'energyCapAdd', add: 60 }), 'Energy cap +60');
  assert.equal(describeEffect({ key: 'energyCapAdd', add: -5 }), 'Energy cap −5');
  assert.equal(sparksLabel(1), '1 spark');
  assert.equal(sparksLabel(0), '0 sparks');
  assert.equal(unlockRefusalText('sparks'), 'Not enough sparks');
});

await check('edges join each node to what it requires; bounds cover every node', () => {
  const edges = treeEdges();
  assert.ok(edges.some((e) => e.from === 'resonance' && e.to === 'presence'));
  assert.equal(
    edges.length,
    SKILL_NODES.reduce((n, node) => n + node.requires.length, 0),
  );
  const b = treeBounds();
  for (const n of SKILL_NODES) {
    assert.ok(n.x >= b.minX && n.x <= b.maxX && n.y >= b.minY && n.y <= b.maxY);
  }
});

await check(
  'zooming keeps the point under the pointer where it is, within the scale limits',
  () => {
    const view = { x: 40, y: 30, scale: 1 };
    const anchor = { x: 200, y: 100 };
    const z = zoomAt(view, 1.5, anchor);
    const before = { x: (anchor.x - view.x) / view.scale, y: (anchor.y - view.y) / view.scale };
    const after = { x: (anchor.x - z.x) / z.scale, y: (anchor.y - z.y) / z.scale };
    assert.ok(Math.abs(before.x - after.x) < 1e-9 && Math.abs(before.y - after.y) < 1e-9);
    assert.equal(zoomAt(view, 100, anchor).scale, MAX_SCALE);
    assert.equal(zoomAt(view, 0.001, anchor).scale, MIN_SCALE);
    assert.equal(clampScale(1), 1);
  },
);

await check('fit centres the tree and shrinks it only when it does not fit', () => {
  const b = treeBounds();
  const roomy = fitView(b, { width: 1200, height: 800 });
  assert.equal(roomy.scale, 1);
  const midX = ((b.minX + b.maxX) / 2) * NODE_SPACING_PX * roomy.scale + roomy.x;
  assert.ok(Math.abs(midX - 600) < 1e-9);
  const tight = fitView(b, { width: 200, height: 200 });
  assert.ok(tight.scale < 1 && tight.scale >= MIN_SCALE);
});

await check('panning cannot drag the whole tree off the screen', () => {
  const b = treeBounds();
  const vp = { width: 600, height: 400 };
  const gone = clampPan({ x: 5000, y: -5000, scale: 1 }, b, vp);
  assert.ok(gone.x < 5000 && gone.y > -5000);
  const left = b.minX * NODE_SPACING_PX + gone.x;
  assert.ok(left <= vp.width, 'part of the tree is still on screen');
  const fine = { x: 300, y: 200, scale: 1 };
  assert.deepEqual(clampPan(fine, b, vp), fine);
});

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

if (failures > 0) {
  console.log(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log('\nall skill checks passed');
