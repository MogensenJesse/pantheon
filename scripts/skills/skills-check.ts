// scripts/skills/skills-check.ts — headless checks of the skill tree rules, the modifier record, the
// skills slice of a save and the panel's view rules (status, tooltips, pan and zoom). The ability
// framework is in scripts/abilities/abilities-check.ts; the wiring into the running game (events,
// energy cap, orb range) is checked in the browser.
//
//   node --experimental-strip-types scripts/skills/skills-check.ts
import assert from 'node:assert/strict';
import { VILLAGE } from '../../src/config/village.ts';
import { parseProfile } from '../../src/save/profile.ts';
import { foldEffects, neutralModifiers } from '../../src/skills/modifiers.ts';
import {
  canUnlock,
  FIRST_SPARKS,
  grantedAbilities,
  grantSparks,
  modifiersOf,
  newSkillsState,
  nodesOfArch,
  openTree,
  parseSkills,
  respec,
  SKILL_NODES,
  type SkillNode,
  type SkillsState,
  spentSparks,
  syncVillageTree,
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
import { check, expectOk, expectRefuses, finish } from '../lib/check.ts';
import { rawProfile } from '../lib/saveFixtures.ts';

const opened = (sparks: number, ranks: Record<string, number> = {}): SkillsState => ({
  opened: true,
  sparks,
  ranks,
  villageOpened: false,
  faithSparks: 0,
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

const base = { villageOpened: false, faithSparks: 0 };

await check('parseSkills accepts a good slice and refuses damaged ones', () => {
  const good = { ...base, opened: true, sparks: 1, ranks: { resonance: 1 } };
  assert.deepEqual(expectOk(parseSkills(good)).skills, good);
  const bad: [string, unknown][] = [
    ['not a record', 5],
    ['opened missing', { ...base, sparks: 0, ranks: {} }],
    ['negative sparks', { ...base, opened: true, sparks: -1, ranks: {} }],
    ['fractional sparks', { ...base, opened: true, sparks: 0.5, ranks: {} }],
    ['unknown node', { ...base, opened: true, sparks: 0, ranks: { zzz: 1 } }],
    ['rank above cap', { ...base, opened: true, sparks: 0, ranks: { resonance: 2 } }],
    ['rank zero', { ...base, opened: true, sparks: 0, ranks: { resonance: 0 } }],
    ['sparks in a closed tree', { ...base, opened: false, sparks: 1, ranks: {} }],
    ['ranks in a closed tree', { ...base, opened: false, sparks: 0, ranks: { resonance: 1 } }],
    ['rank without its prerequisite', { ...base, opened: true, sparks: 0, ranks: { presence: 1 } }],
  ];
  expectRefuses(parseSkills, bad);
});

await check('parseProfile keeps the skills slice and refuses a profile without a good one', () => {
  const good = { ...base, opened: true, sparks: 0, ranks: { resonance: 1, surge: 1 } };
  assert.deepEqual(expectOk(parseProfile(rawProfile({ skills: good }))).profile.skills, good);
  assert.equal(parseProfile(rawProfile({ skills: undefined })).ok, false);
  assert.equal(
    parseProfile(rawProfile({ skills: { ...base, opened: true, sparks: -2, ranks: {} } })).ok,
    false,
  );
});

// --- arch II, The Village (M9) ---

const A2 = VILLAGE.ARCH_II;
const villageOpen = (sparks: number, ranks: Record<string, number> = {}): SkillsState => ({
  ...opened(sparks, ranks),
  villageOpened: true,
});
/** Takes nodes in order, each needing to be allowed. */
const takeAll = (state: SkillsState, ids: string[]): SkillsState => {
  let s = state;
  for (const id of ids) {
    const r = unlock(s, id);
    assert.ok(r.ok, `${id}: ${r.ok ? '' : r.reason}`);
    s = (r as { ok: true; state: SkillsState }).state;
  }
  return s;
};
const HEARTH = ['wider_beds', 'quick_hands', 'good_soil', 'sharp_axes', 'granary'];
const LAND = ['seedkeeper', 'tide_caller', 'rain_reader', 'gravekeeper'];

await check('arch II holds the Hearth and Land nodes, the two exclusive pairs and Devotion', () => {
  assert.deepEqual(treeProblems(), []);
  assert.deepEqual(
    nodesOfArch('village')
      .map((n) => n.id)
      .sort(),
    [...HEARTH, ...LAND, 'town', 'lean_winters', 'evergreen', 'downpour', 'devotion'].sort(),
  );
  for (const n of nodesOfArch('village')) {
    assert.ok(n.requires.every((r) => SKILL_NODES.find((o) => o.id === r)?.arch === 'village'));
  }
  const keystone = (id: string) => SKILL_NODES.find((n) => n.id === id)!;
  assert.deepEqual(keystone('town').excludes, ['lean_winters']);
  assert.deepEqual(keystone('lean_winters').excludes, ['town']);
  assert.deepEqual(keystone('evergreen').excludes, ['downpour']);
  assert.deepEqual(keystone('downpour').excludes, ['evergreen']);
  // everything except one keystone of each pair: the whole curve in sparks
  const all = nodesOfArch('village').reduce((n, o) => n + o.cost, 0);
  const oneOfEach = all - keystone('lean_winters').cost - keystone('downpour').cost;
  console.log(`      arch II costs ${oneOfEach} sparks with one keystone of each pair`);
});

await check('treeProblems finds a one-sided or unknown exclusion', () => {
  const node = (over: Partial<SkillNode>): SkillNode => ({
    id: 'a',
    arch: 'village',
    branch: 'b',
    name: 'A',
    text: '',
    x: 0,
    y: 0,
    cost: 1,
    ranks: 1,
    requires: [],
    effects: [],
    ...over,
  });
  assert.ok(treeProblems([node({ excludes: ['zzz'] })]).some((p) => /unknown/.test(p)));
  assert.ok(
    treeProblems([node({ excludes: ['b'] }), node({ id: 'b' })]).some((p) => /back/.test(p)),
  );
  assert.deepEqual(
    treeProblems([node({ excludes: ['b'] }), node({ id: 'b', excludes: ['a'] })]),
    [],
  );
});

await check(
  'arch II stays closed until it opens, and then needs its prerequisites and sparks',
  () => {
    assert.deepEqual(canUnlock(opened(9), 'wider_beds'), { ok: false, reason: 'closed' });
    assert.deepEqual(canUnlock(villageOpen(9), 'wider_beds'), { ok: true });
    assert.deepEqual(canUnlock(villageOpen(9), 'quick_hands'), { ok: false, reason: 'locked' });
    assert.deepEqual(canUnlock(villageOpen(1), 'wider_beds'), { ok: false, reason: 'sparks' });
    assert.deepEqual(canUnlock(villageOpen(9), 'devotion'), { ok: false, reason: 'locked' });
    const both = takeAll(villageOpen(20), ['wider_beds', 'seedkeeper']);
    assert.deepEqual(canUnlock(both, 'devotion'), { ok: true });
  },
);

await check(
  'arch II opens in a converted village at the faith threshold, with its sparks, once',
  () => {
    const closed = newSkillsState();
    const treeOpen = opened(0);
    const at = (state: SkillsState, converted: boolean, faithEarned: number) =>
      syncVillageTree(state, { converted, faithEarned });
    assert.equal(at(closed, true, 9999), closed, 'arch I closed: nothing');
    assert.equal(at(treeOpen, false, 9999), treeOpen, 'an unconverted village: nothing');
    assert.equal(at(treeOpen, true, A2.OPEN_FAITH_EARNED - 1), treeOpen, 'below the threshold');
    const first = at(treeOpen, true, A2.OPEN_FAITH_EARNED);
    assert.equal(first.villageOpened, true);
    assert.equal(first.sparks, A2.OPEN_SPARKS);
    assert.equal(
      at(first, true, A2.OPEN_FAITH_EARNED),
      first,
      'the same faith gives nothing twice',
    );
    const later = at(first, true, A2.OPEN_FAITH_EARNED + 3.5 * A2.MILESTONE_FAITH);
    assert.equal(later.sparks, A2.OPEN_SPARKS + 3, 'a spark per milestone');
    assert.equal(later.faithSparks, 3);
    assert.equal(at(later, true, A2.OPEN_FAITH_EARNED + 3.9 * A2.MILESTONE_FAITH), later);
    // one jump past several milestones at once, from nothing
    const jumped = at(treeOpen, true, A2.OPEN_FAITH_EARNED + 2 * A2.MILESTONE_FAITH);
    assert.equal(jumped.sparks, A2.OPEN_SPARKS + 2);
    // spent sparks are not given back when the faith is read again
    const spent = takeAll(first, ['wider_beds']);
    assert.equal(at(spent, true, A2.OPEN_FAITH_EARNED).sparks, spent.sparks);
  },
);

await check('a keystone shuts out its pair, a respec opens the choice again', () => {
  let s = takeAll(villageOpen(40), [...HEARTH, 'town']);
  assert.deepEqual(canUnlock(s, 'lean_winters'), { ok: false, reason: 'excluded' });
  assert.equal(unlockRefusalText('excluded'), 'You took the other path');
  const t = nodeTooltip(s, SKILL_NODES.find((n) => n.id === 'lean_winters')!);
  assert.match(t.inspect, /Closed: you took Town/);
  assert.equal(nodeStatus(s, SKILL_NODES.find((n) => n.id === 'lean_winters')!), 'locked');
  s = respec(s);
  assert.equal(s.villageOpened, true, 'respec keeps the arch open');
  assert.equal(spentSparks(s), 0);
  s = takeAll(s, [...HEARTH, 'lean_winters']);
  assert.deepEqual(canUnlock(s, 'town'), { ok: false, reason: 'excluded' });
});

await check('arch II nodes move their own modifiers, by the amounts the tree promises', () => {
  const m = (ids: string[]) => modifiersOf(takeAll(villageOpen(99), ids));
  const near = (a: number, b: number) => Math.abs(a - b) < 1e-9;
  assert.equal(m(['wider_beds']).bedsPerHouseAdd, 1);
  assert.equal(m(['wider_beds', 'quick_hands']).builderRateMul, 1.25);
  assert.equal(m(['wider_beds', 'good_soil']).fieldYieldAdd, 1);
  assert.equal(m(['wider_beds', 'quick_hands', 'sharp_axes']).woodPerTreeAdd, 1);
  assert.equal(m(HEARTH).storageCapAdd, 40);
  assert.equal(m([...HEARTH, 'town']).buildingCapMul, 1.4);
  assert.equal(m([...HEARTH, 'lean_winters']).hungerGraceMul, 3);
  assert.ok(near(m(['seedkeeper']).stumpWaitMul, 2 / 3));
  assert.equal(m(['seedkeeper', 'tide_caller']).fishMul, 1.5);
  assert.ok(near(m(['seedkeeper', 'rain_reader']).rainBoostAdd, 0.15));
  assert.equal(m(LAND).deathFaithMul, 0.5);
  assert.equal(m([...LAND, 'evergreen']).evergreen, 1);
  assert.equal(m([...LAND, 'downpour']).rainBoostMul, 2);
  const devotion = m(['wider_beds', 'seedkeeper', 'devotion']);
  assert.ok(devotion.energyPerBeliever > 0);
  assert.equal(devotion.templeRegen, 1);
  // untouched: everything else stays neutral
  const neutral = neutralModifiers();
  assert.equal(m(['wider_beds']).hungerGraceMul, neutral.hungerGraceMul);
  assert.equal(m(['wider_beds']).evergreen, 0);
});

await check('parseSkills holds arch II to its rules', () => {
  const good = { ...base, opened: true, villageOpened: true, sparks: 2, ranks: { wider_beds: 1 } };
  assert.equal(parseSkills(good).ok, true);
  const bad: [string, unknown][] = [
    ['an arch II rank in a closed arch', { ...good, villageOpened: false }],
    ['arch II open in a closed tree', { ...good, opened: false, ranks: {}, sparks: 0 }],
    [
      'both keystones',
      {
        ...good,
        ranks: Object.fromEntries([...HEARTH, 'town', 'lean_winters'].map((id) => [id, 1])),
      },
    ],
    [
      'faith sparks in a closed arch',
      { ...base, opened: true, faithSparks: 2, sparks: 0, ranks: {} },
    ],
    ['negative faith sparks', { ...good, faithSparks: -1 }],
    ['villageOpened missing', { opened: true, sparks: 0, ranks: {}, faithSparks: 0 }],
  ];
  for (const [what, value] of bad) assert.equal(parseSkills(value).ok, false, what);
});

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

finish('all skill checks passed');
