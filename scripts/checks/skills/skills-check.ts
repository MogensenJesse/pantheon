// scripts/checks/skills/skills-check.ts — headless checks of the skill tree rules: unlock, respec, exclusive keystones, arch II opening and the save parser.
//
//   node --experimental-strip-types scripts/checks/skills/skills-check.ts
import assert from 'node:assert/strict';
import { VILLAGE } from '../../../src/config/village.ts';
import {
  isMilestoneId,
  MILESTONES,
  type MilestoneSnapshot,
  milestoneLabel,
} from '../../../src/skills/milestones.ts';
import { foldEffects, neutralModifiers } from '../../../src/skills/modifiers.ts';
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
  syncMilestones,
  syncVillageTree,
  treeProblems,
  unlock,
} from '../../../src/skills/skillTree.ts';
import { check, expectOk, expectRefuses, finish } from '../lib/check.ts';

const opened = (sparks: number, ranks: Record<string, number> = {}): SkillsState => ({
  opened: true,
  sparks,
  ranks,
  villageOpened: false,
  faithSparks: 0,
  milestones: [],
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

await check('the shipped tree is sound', () => assert.deepEqual(treeProblems(), []));

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

await check('sparks are granted as whole positive counts, and a closed tree takes none', () => {
  const closed = newSkillsState();
  assert.equal(grantSparks(closed, 3), closed);
  const s = opened(1);
  assert.equal(grantSparks(s, 2).sparks, 3);
  for (const bad of [0, -1, 1.5]) assert.equal(grantSparks(s, bad), s);
});

await check('modifiers are neutral with nothing taken', () => {
  assert.deepEqual(modifiersOf(opened(5)), neutralModifiers());
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

const base = { villageOpened: false, faithSparks: 0, milestones: [] };

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

await check(
  'the hand nodes change the reach and the cost, and the old Dream and Sign are gone',
  () => {
    const s = take(opened(2), 'long_reach', 'deep_grip');
    const m = modifiersOf(s);
    assert.equal(m.handReachMul, 1.6);
    assert.equal(m.handCostMul, 0.6);
    assert.deepEqual(modifiersOf(opened(2)).handReachMul, 1, 'neutral until taken');
    assert.deepEqual(grantedAbilities(s), [], 'they are a change to the hand, not a power');
    for (const id of ['dream', 'sign']) {
      assert.equal(unlock(opened(2), id).ok, false, `${id} is no longer in the tree`);
      const old = { ...base, opened: true, sparks: 0, ranks: { [id]: 1 } };
      assert.equal(parseSkills(old).ok, false, `a save with ${id} taken is refused`);
    }
  },
);

// --- arch II, The Village ---

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

await check('treeProblems finds a one-sided or unknown exclusion', () => {
  const node = (over: Partial<SkillNode>): SkillNode => ({
    id: 'a',
    arch: 'village',
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
  s = respec(s);
  assert.equal(s.villageOpened, true, 'respec keeps the arch open');
  assert.equal(spentSparks(s), 0);
  s = takeAll(s, [...HEARTH, 'lean_winters']);
  assert.deepEqual(canUnlock(s, 'town'), { ok: false, reason: 'excluded' });
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
    [
      'villageOpened missing',
      { opened: true, sparks: 0, ranks: {}, faithSparks: 0, milestones: [] },
    ],
    [
      'milestones missing',
      { opened: true, sparks: 0, ranks: {}, villageOpened: false, faithSparks: 0 },
    ],
    ['an unknown milestone', { ...good, milestones: ['zzz'] }],
    ['a milestone twice', { ...good, milestones: ['first_place', 'first_place'] }],
  ];
  for (const [what, value] of bad) assert.equal(parseSkills(value).ok, false, what);
});

await check(
  'Fine works opens the farmstead levels, rank by rank, once a building has been raised',
  () => {
    const ready = takeAll(villageOpen(20), ['wider_beds', 'good_soil', 'farmsteads']);
    assert.deepEqual(canUnlock(villageOpen(20), 'fine_works'), { ok: false, reason: 'locked' });
    assert.deepEqual(canUnlock(ready, 'fine_works'), { ok: false, reason: 'gated' });
    const raised: SkillsState = { ...ready, milestones: ['level_2'] };
    assert.deepEqual(canUnlock(raised, 'fine_works'), { ok: true });
    assert.equal(modifiersOf(raised).workTier, 1, 'neutral until taken');
    const one = takeAll(raised, ['fine_works']);
    assert.equal(modifiersOf(one).workTier, 2);
    const two = takeAll(one, ['fine_works']);
    assert.equal(modifiersOf(two).workTier, 3);
    assert.deepEqual(canUnlock(two, 'fine_works'), { ok: false, reason: 'maxed' });
  },
);

await check(
  'Farmsteads and Shrines open their plots, and Shrines wait for five answered prayers',
  () => {
    const soil = takeAll(villageOpen(20), ['wider_beds', 'good_soil']);
    assert.equal(modifiersOf(soil).plotFarmstead, 0, 'closed until taken');
    assert.equal(modifiersOf(takeAll(soil, ['farmsteads'])).plotFarmstead, 1);
    assert.equal(modifiersOf(takeAll(soil, ['farmsteads'])).plotShrine, 0, 'each its own');
    const seed = takeAll(villageOpen(20), ['wider_beds', 'seedkeeper']);
    assert.deepEqual(canUnlock(seed, 'shrines'), { ok: false, reason: 'gated' });
    const answered: SkillsState = { ...seed, milestones: ['prayers_5'] };
    assert.deepEqual(canUnlock(answered, 'shrines'), { ok: true });
    assert.equal(modifiersOf(takeAll(answered, ['shrines'])).plotShrine, 1);
    assert.deepEqual(canUnlock(villageOpen(20), 'shrines'), { ok: false, reason: 'locked' });
  },
);

await check('Fervour needs Devotion and makes all faith come a quarter faster', () => {
  const ready = takeAll(villageOpen(20), ['wider_beds', 'seedkeeper', 'devotion']);
  assert.deepEqual(canUnlock(villageOpen(20), 'fervour'), { ok: false, reason: 'locked' });
  assert.deepEqual(canUnlock(ready, 'fervour'), { ok: true });
  assert.equal(modifiersOf(ready).faithMul, 1, 'neutral until taken');
  assert.equal(modifiersOf(takeAll(ready, ['fervour'])).faithMul, 1.25);
});

// --- milestones and gates ---

const GATED_TREE: SkillNode[] = [
  { ...TEST_TREE[0]!, id: 'plain', requires: [] },
  { ...TEST_TREE[0]!, id: 'late', requires: [], gate: 'first_place' },
];
const snapshot = (over: Partial<MilestoneSnapshot> = {}): MilestoneSnapshot => ({
  restoredPlaces: 0,
  population: 0,
  finishedBuildings: 0,
  maxBuildingLevel: 1,
  prayersAnswered: 0,
  nameReturned: 0,
  ...over,
});

await check('a gated node stays closed until its milestone is reached, and stays open', () => {
  const s = opened(5);
  assert.deepEqual(canUnlock(s, 'plain', GATED_TREE), { ok: true });
  assert.deepEqual(canUnlock(s, 'late', GATED_TREE), { ok: false, reason: 'gated' });
  const reached = syncMilestones(s, snapshot({ restoredPlaces: 1 }));
  assert.deepEqual(reached.milestones, ['first_place']);
  assert.deepEqual(canUnlock(reached, 'late', GATED_TREE), { ok: true });
  // The village shrinking back loses nothing.
  assert.equal(syncMilestones(reached, snapshot()), reached);
});

await check('milestones are recorded once each, in table order, from one snapshot', () => {
  const s = syncMilestones(
    opened(0),
    snapshot({ restoredPlaces: 3, population: 25, finishedBuildings: 4 }),
  );
  assert.deepEqual(s.milestones, ['first_place', 'three_places', 'folk_20']);
  assert.equal(syncMilestones(s, snapshot({ restoredPlaces: 3, population: 25 })), s);
  const more = syncMilestones(s, snapshot({ restoredPlaces: 5, population: 45 }));
  assert.deepEqual(more.milestones.slice(3), ['all_places', 'folk_40']);
});

await check('upgrade levels are milestones, and the shipped gates name real ones', () => {
  const s = syncMilestones(opened(0), snapshot({ maxBuildingLevel: 2 }));
  assert.deepEqual(s.milestones, ['level_2']);
  for (const node of SKILL_NODES) {
    if (node.gate) assert.ok(isMilestoneId(node.gate), `${node.id} gate`);
  }
  assert.ok(
    SKILL_NODES.some((n) => n.gate),
    'some shipped node is gated',
  );
});

await check('the milestone table and the gates in a tree are sound', () => {
  const ids = MILESTONES.map((m) => m.id);
  assert.equal(new Set(ids).size, ids.length, 'ids are unique');
  for (const m of MILESTONES) {
    assert.ok(m.label.length > 0 && m.atLeast > 0, m.id);
    assert.ok(isMilestoneId(m.id) && milestoneLabel(m.id) === m.label);
  }
  assert.deepEqual(treeProblems(), []);
  const broken = [{ ...GATED_TREE[0]!, gate: 'zzz' as never }];
  assert.ok(treeProblems(broken).some((p) => p.includes('unknown milestone')));
});

await check('a rank on a gated node needs its milestone in a saved slice', () => {
  const tree = GATED_TREE;
  const good = {
    ...base,
    opened: true,
    sparks: 0,
    ranks: { late: 1 },
    milestones: ['first_place'],
  };
  assert.equal(parseSkills(good, tree).ok, true);
  assert.equal(parseSkills({ ...good, milestones: [] }, tree).ok, false);
});

finish('all skill checks passed');
