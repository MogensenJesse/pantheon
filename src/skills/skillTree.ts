// src/skills/skillTree.ts — the skill tree: its nodes and the rules for opening, spending and respeccing
// (pure data and functions: no DOM, no game modules, node-runnable)
//
// The state is plain data (it is what a save keeps) and every rule returns a new state instead of
// changing the old one. What a node does goes through `modifiers.ts`; this file never knows the game.

import { VILLAGE } from '../config/village.ts';
import { isCountInt, isInt, isRecord } from '../core/guards.ts';
import {
  isMilestoneId,
  type MilestoneId,
  type MilestoneSnapshot,
  newlyReached,
} from './milestones.ts';
import { foldEffects, type ModifierEffect, type Modifiers } from './modifiers.ts';

export type Arch = 'void' | 'village';

export interface SkillNode {
  id: string;
  arch: Arch;
  name: string;
  /** One line for the tooltip. */
  text: string;
  /** Where the node sits in the constellation (arbitrary units, y grows downwards). */
  x: number;
  y: number;
  /** Sparks per rank. */
  cost: number;
  ranks: number;
  /** Every one of these needs at least one rank first. */
  requires: readonly string[];
  /** The other half of a choice: with a rank here, none of these can be taken (and the other way round). */
  excludes?: readonly string[];
  /** Per rank. */
  effects: readonly ModifierEffect[];
  /** An active ability this node grants (see src/abilities). */
  ability?: string;
  /** The node stays closed until the village has reached this milestone (`milestones.ts`). */
  gate?: MilestoneId;
}

/** Sparks the player gets when the tree opens. */
export const FIRST_SPARKS = 2;

export const SKILL_NODES: readonly SkillNode[] = [
  {
    id: 'resonance',
    arch: 'void',
    name: 'Resonance',
    text: 'Residue drifts to you from further away.',
    x: 0,
    y: 0,
    cost: 1,
    ranks: 1,
    requires: [],
    effects: [{ key: 'absorbRadiusMul', mul: 1.6 }],
  },
  {
    id: 'presence',
    arch: 'void',
    name: 'Presence',
    text: 'Your light reaches further into the dark.',
    x: -1,
    y: -1,
    cost: 1,
    ranks: 1,
    requires: ['resonance'],
    effects: [{ key: 'lightReachMul', mul: 1.5 }],
  },
  {
    id: 'echo',
    arch: 'void',
    name: 'Echo',
    text: 'Each memory you gather leaves a trace of faith behind.',
    x: -2,
    y: -2,
    cost: 1,
    ranks: 1,
    requires: ['presence'],
    effects: [{ key: 'orbFaithTrail', add: 1 }],
  },
  {
    id: 'surge',
    arch: 'void',
    name: 'Surge',
    text: 'You can hold more energy.',
    x: 1,
    y: -1,
    cost: 2,
    ranks: 1,
    requires: ['resonance'],
    effects: [{ key: 'energyCapAdd', add: 60 }],
  },
  {
    id: 'long_reach',
    arch: 'void',
    name: 'Long reach',
    text: 'Your hand reaches further to lift trees, wheat and sheep.',
    x: -2,
    y: 0,
    cost: 1,
    ranks: 1,
    requires: [],
    effects: [{ key: 'handReachMul', mul: 1.6 }],
  },
  {
    id: 'deep_grip',
    arch: 'void',
    name: 'Deep grip',
    text: 'Lifting costs less energy.',
    x: -3,
    y: -1,
    cost: 1,
    ranks: 1,
    requires: [],
    effects: [{ key: 'handCostMul', mul: 0.6 }],
  },
  {
    id: 'attunement',
    arch: 'void',
    name: 'Attunement',
    text: "Energy slowly returns inside a shrine's circle.",
    x: 2,
    y: 0,
    cost: 1,
    ranks: 1,
    requires: [],
    effects: [{ key: 'shrineAttuned', add: 1 }],
  },
  {
    id: 'renewal',
    arch: 'void',
    name: 'Renewal',
    text: 'A faint trickle of energy returns wherever you are.',
    x: 3,
    y: -1,
    cost: 1,
    ranks: 1,
    requires: ['attunement'],
    effects: [{ key: 'flatRegenPerSec', add: 0.05 }],
  },

  // --- Arch II, The Village: Hearth (the left), Land (the right), Devotion between them ---
  {
    id: 'wider_beds',
    arch: 'village',
    name: 'Wider beds',
    text: 'Every house has room for one more.',
    x: -1,
    y: 0,
    cost: 2,
    ranks: 1,
    requires: [],
    effects: [{ key: 'bedsPerHouseAdd', add: 1 }],
  },
  {
    id: 'quick_hands',
    arch: 'village',
    name: 'Quick hands',
    text: 'Builders work a quarter faster.',
    x: -2,
    y: -1,
    cost: 2,
    ranks: 1,
    requires: ['wider_beds'],
    effects: [{ key: 'builderRateMul', mul: 1.25 }],
  },
  {
    id: 'good_soil',
    arch: 'village',
    name: 'Good soil',
    text: 'Every harvest brings in a little more.',
    x: -2,
    y: 1,
    cost: 2,
    ranks: 1,
    requires: ['wider_beds'],
    effects: [{ key: 'fieldYieldAdd', add: 1 }],
  },
  {
    id: 'sharp_axes',
    arch: 'village',
    name: 'Sharp axes',
    text: 'Every felled tree gives a log more.',
    x: -3,
    y: -2,
    cost: 2,
    ranks: 1,
    requires: ['quick_hands'],
    effects: [{ key: 'woodPerTreeAdd', add: 1 }],
  },
  {
    id: 'granary',
    arch: 'village',
    name: 'Granary',
    text: 'The stores hold forty more, of wood and of food.',
    x: -3,
    y: 0,
    cost: 3,
    ranks: 1,
    requires: ['quick_hands', 'good_soil'],
    effects: [{ key: 'storageCapAdd', add: 40 }],
  },
  {
    id: 'town',
    arch: 'village',
    name: 'Town',
    text: 'The village may grow far larger. The other path is Lean winters.',
    x: -4,
    y: -1,
    cost: 4,
    ranks: 1,
    requires: ['granary'],
    excludes: ['lean_winters'],
    effects: [{ key: 'buildingCapMul', mul: 1.4 }],
  },
  {
    id: 'lean_winters',
    arch: 'village',
    name: 'Lean winters',
    text: 'The village goes three times as long hungry before it weakens. The other path is Town.',
    x: -4,
    y: 1,
    cost: 4,
    ranks: 1,
    requires: ['granary'],
    excludes: ['town'],
    effects: [{ key: 'hungerGraceMul', mul: 3 }],
  },
  {
    id: 'seedkeeper',
    arch: 'village',
    name: 'Seedkeeper',
    text: 'Stumps wait a third less before they grow back.',
    x: 1,
    y: 0,
    cost: 2,
    ranks: 1,
    requires: [],
    effects: [{ key: 'stumpWaitMul', mul: 2 / 3 }],
  },
  {
    id: 'tide_caller',
    arch: 'village',
    name: 'Tide-caller',
    text: 'The fishermen bring in half as much again.',
    x: 2,
    y: -1,
    cost: 2,
    ranks: 1,
    requires: ['seedkeeper'],
    effects: [{ key: 'fishMul', mul: 1.5 }],
  },
  {
    id: 'rain_reader',
    arch: 'village',
    name: 'Rain-reader',
    text: 'Rain does the fields and the saplings a little more good.',
    x: 2,
    y: 1,
    cost: 3,
    ranks: 1,
    requires: ['seedkeeper'],
    effects: [{ key: 'rainBoostAdd', add: 0.15 }],
  },
  {
    id: 'gravekeeper',
    arch: 'village',
    name: 'Gravekeeper',
    text: 'A death costs half the faith.',
    x: 3,
    y: 0,
    cost: 3,
    ranks: 1,
    requires: ['tide_caller', 'rain_reader'],
    effects: [{ key: 'deathFaithMul', mul: 0.5 }],
  },
  {
    id: 'evergreen',
    arch: 'village',
    name: 'Evergreen',
    text: 'While it rains, stumps grow back at once. The other path is Downpour.',
    x: 4,
    y: -1,
    cost: 4,
    ranks: 1,
    requires: ['gravekeeper'],
    excludes: ['downpour'],
    effects: [{ key: 'evergreen', add: 1 }],
  },
  {
    id: 'downpour',
    arch: 'village',
    name: 'Downpour',
    text: 'Rain does twice the good to fields and saplings. The other path is Evergreen.',
    x: 4,
    y: 1,
    cost: 4,
    ranks: 1,
    requires: ['gravekeeper'],
    excludes: ['evergreen'],
    effects: [{ key: 'rainBoostMul', mul: 2 }],
  },
  {
    id: 'stone_hearths',
    arch: 'village',
    name: 'Stone hearths',
    text: 'Builders can raise a house to a second level: another bed under the same roof.',
    x: -1,
    y: -1,
    cost: 2,
    ranks: 1,
    requires: ['wider_beds'],
    effects: [{ key: 'houseTier', add: 1 }],
  },
  {
    id: 'great_halls',
    arch: 'village',
    name: 'Great halls',
    text: 'Houses may rise to a third level. The village must be a village first.',
    x: -1,
    y: -2,
    cost: 3,
    ranks: 1,
    requires: ['stone_hearths'],
    gate: 'folk_20',
    effects: [{ key: 'houseTier', add: 1 }],
  },
  {
    id: 'deep_stores',
    arch: 'village',
    name: 'Deep stores',
    text: 'Granaries and workshops can be raised to a second level and hold half as much again.',
    x: -3,
    y: 2,
    cost: 2,
    ranks: 1,
    requires: ['granary'],
    effects: [{ key: 'storeTier', add: 1 }],
  },
  {
    id: 'vaults',
    arch: 'village',
    name: 'Vaults',
    text: 'Stores may rise to a third level. Needs a restored place of power.',
    x: -2,
    y: 2,
    cost: 3,
    ranks: 1,
    requires: ['deep_stores'],
    gate: 'first_place',
    effects: [{ key: 'storeTier', add: 1 }],
  },
  {
    id: 'farmsteads',
    arch: 'village',
    name: 'Farmsteads',
    text: 'Builders can raise a farmstead wherever you mark one: the fields around it grow faster and give more.',
    x: -1,
    y: 1,
    cost: 2,
    ranks: 1,
    requires: ['good_soil'],
    effects: [{ key: 'plotFarmstead', add: 1 }],
  },
  {
    id: 'shrines',
    arch: 'village',
    name: 'Shrines',
    text: 'Builders can raise a shrine wherever you mark one: it gathers faith by itself. Needs five prayers answered.',
    x: 1,
    y: 1,
    cost: 3,
    ranks: 1,
    requires: ['seedkeeper'],
    gate: 'prayers_5',
    effects: [{ key: 'plotShrine', add: 1 }],
  },
  {
    id: 'fine_works',
    arch: 'village',
    name: 'Fine works',
    text: 'Farmsteads and shrines can be raised to a second level, then a third: the fields around a farmstead grow faster and give more, a shrine gathers more faith. Needs a building raised to level 2.',
    x: 0,
    y: 1,
    cost: 2,
    ranks: 2,
    requires: ['farmsteads'],
    gate: 'level_2',
    effects: [{ key: 'workTier', add: 1 }],
  },
  {
    id: 'devotion',
    arch: 'village',
    name: 'Devotion',
    text: 'Every believer sends a little energy your way, and the temple restores it.',
    x: 0,
    y: 2,
    cost: 3,
    ranks: 1,
    requires: ['wider_beds', 'seedkeeper'],
    effects: [
      { key: 'energyPerBeliever', add: 0.005 },
      { key: 'templeRegen', add: 1 },
    ],
  },
  {
    id: 'fervour',
    arch: 'village',
    name: 'Fervour',
    text: 'All the faith the village gathers comes a quarter faster.',
    x: 1,
    y: 2,
    cost: 3,
    ranks: 1,
    requires: ['devotion'],
    effects: [{ key: 'faithMul', mul: 1.25 }],
  },
];

/** The nodes of one arch. */
export const nodesOfArch = (arch: Arch, tree: readonly SkillNode[] = SKILL_NODES): SkillNode[] =>
  tree.filter((n) => n.arch === arch);

export interface SkillsState {
  /** The tree has been opened (at the energy cap); latched, never goes back. */
  opened: boolean;
  /** Sparks not yet spent. */
  sparks: number;
  /** Ranks taken, by node id (only nodes with at least one rank appear). */
  ranks: Record<string, number>;
  /** Arch II, The Village, has been opened (latched). */
  villageOpened: boolean;
  /** Sparks given so far for faith earned past the opening, so none is given twice. */
  faithSparks: number;
  /** Milestones the village has reached (latched, in the order reached). */
  milestones: MilestoneId[];
}

export function newSkillsState(): SkillsState {
  return {
    opened: false,
    sparks: 0,
    ranks: {},
    villageOpened: false,
    faithSparks: 0,
    milestones: [],
  };
}

export type UnlockRefusal =
  | 'unknown'
  | 'closed'
  | 'maxed'
  | 'locked'
  | 'excluded'
  | 'gated'
  | 'sparks';

export type UnlockCheck = { ok: true } | { ok: false; reason: UnlockRefusal };

const nodeById = (tree: readonly SkillNode[], id: string) => tree.find((n) => n.id === id);

export function rankOf(state: SkillsState, id: string): number {
  return state.ranks[id] ?? 0;
}

export function canUnlock(
  state: SkillsState,
  id: string,
  tree: readonly SkillNode[] = SKILL_NODES,
): UnlockCheck {
  const node = nodeById(tree, id);
  if (!node) return { ok: false, reason: 'unknown' };
  if (!state.opened || (node.arch === 'village' && !state.villageOpened)) {
    return { ok: false, reason: 'closed' };
  }
  if (rankOf(state, id) >= node.ranks) return { ok: false, reason: 'maxed' };
  if (!node.requires.every((r) => rankOf(state, r) > 0)) return { ok: false, reason: 'locked' };
  if ((node.excludes ?? []).some((x) => rankOf(state, x) > 0)) {
    return { ok: false, reason: 'excluded' };
  }
  if (node.gate && !state.milestones.includes(node.gate)) return { ok: false, reason: 'gated' };
  if (state.sparks < node.cost) return { ok: false, reason: 'sparks' };
  return { ok: true };
}

export type UnlockResult = { ok: true; state: SkillsState } | { ok: false; reason: UnlockRefusal };

/** Takes one rank of a node, spending its sparks. */
export function unlock(
  state: SkillsState,
  id: string,
  tree: readonly SkillNode[] = SKILL_NODES,
): UnlockResult {
  const check = canUnlock(state, id, tree);
  if (!check.ok) return check;
  const node = nodeById(tree, id) as SkillNode;
  return {
    ok: true,
    state: {
      ...state,
      sparks: state.sparks - node.cost,
      ranks: { ...state.ranks, [id]: rankOf(state, id) + 1 },
    },
  };
}

/** Sparks locked up in the ranks taken. */
export function spentSparks(state: SkillsState, tree: readonly SkillNode[] = SKILL_NODES): number {
  let total = 0;
  for (const node of tree) total += node.cost * rankOf(state, node.id);
  return total;
}

/** Takes every rank back and returns its sparks. A respec is free. */
export function respec(state: SkillsState, tree: readonly SkillNode[] = SKILL_NODES): SkillsState {
  return { ...state, sparks: state.sparks + spentSparks(state, tree), ranks: {} };
}

/** Opens the tree with its first sparks; a tree that is already open stays as it is. */
export function openTree(state: SkillsState, firstSparks: number = FIRST_SPARKS): SkillsState {
  if (state.opened) return state;
  return { ...state, opened: true, sparks: state.sparks + firstSparks };
}

/**
 * Arch II opens in a converted village once enough faith has been earned, with its first sparks; each
 * further milestone of faith earned gives one more. Returns the same state when nothing changes. A closed
 * arch I tree holds no sparks, so nothing happens before it opens.
 */
export function syncVillageTree(
  state: SkillsState,
  village: { converted: boolean; faithEarned: number },
): SkillsState {
  const A = VILLAGE.ARCH_II;
  if (!state.opened || !village.converted || village.faithEarned < A.OPEN_FAITH_EARNED)
    return state;
  let next = state;
  if (!next.villageOpened) {
    next = { ...next, villageOpened: true, sparks: next.sparks + A.OPEN_SPARKS };
  }
  const due = Math.floor((village.faithEarned - A.OPEN_FAITH_EARNED) / A.MILESTONE_FAITH);
  if (due > next.faithSparks) {
    next = { ...next, sparks: next.sparks + (due - next.faithSparks), faithSparks: due };
  }
  return next;
}

/** Records the milestones the village has reached; the same state when there is nothing new. */
export function syncMilestones(state: SkillsState, snapshot: MilestoneSnapshot): SkillsState {
  const fresh = newlyReached(snapshot, state.milestones);
  return fresh.length === 0 ? state : { ...state, milestones: [...state.milestones, ...fresh] };
}

export function grantSparks(state: SkillsState, count: number): SkillsState {
  // A closed tree holds no sparks: it opens with its first ones (and a save refuses sparks in a closed tree).
  if (!state.opened || !Number.isInteger(count) || count <= 0) return state;
  return { ...state, sparks: state.sparks + count };
}

/** The modifier record that the ranks taken add up to, with `extra` effects from other sources folded in. */
export function modifiersOf(
  state: SkillsState,
  tree: readonly SkillNode[] = SKILL_NODES,
  extra: readonly { effect: ModifierEffect; times: number }[] = [],
): Modifiers {
  const parts: { effect: ModifierEffect; times: number }[] = [...extra];
  for (const node of tree) {
    const times = rankOf(state, node.id);
    if (times <= 0) continue;
    for (const effect of node.effects) parts.push({ effect, times });
  }
  return foldEffects(parts);
}

/** Ids of the active abilities the ranks taken grant. */
export function grantedAbilities(
  state: SkillsState,
  tree: readonly SkillNode[] = SKILL_NODES,
): string[] {
  const out: string[] = [];
  for (const node of tree) {
    if (node.ability && rankOf(state, node.id) > 0) out.push(node.ability);
  }
  return out;
}

/** Problems with a tree's data (empty when it is sound): duplicate ids, unknown or circular requires. */
export function treeProblems(tree: readonly SkillNode[] = SKILL_NODES): string[] {
  const problems: string[] = [];
  const ids = new Set<string>();
  for (const node of tree) {
    if (ids.has(node.id)) problems.push(`duplicate node id "${node.id}"`);
    ids.add(node.id);
    if (!Number.isInteger(node.cost) || node.cost < 1) problems.push(`${node.id}: cost`);
    if (!Number.isInteger(node.ranks) || node.ranks < 1) problems.push(`${node.id}: ranks`);
  }
  for (const node of tree) {
    if (node.gate !== undefined && !isMilestoneId(node.gate)) {
      problems.push(`${node.id} is gated on unknown milestone "${node.gate}"`);
    }
    for (const r of node.requires) {
      if (!ids.has(r)) problems.push(`${node.id} requires unknown node "${r}"`);
      if (r === node.id) problems.push(`${node.id} requires itself`);
    }
    for (const x of node.excludes ?? []) {
      const other = nodeById(tree, x);
      if (!other) problems.push(`${node.id} excludes unknown node "${x}"`);
      else if (!(other.excludes ?? []).includes(node.id)) {
        problems.push(`${node.id} excludes ${x}, which does not exclude it back`);
      }
      if (other && other.arch !== node.arch)
        problems.push(`${node.id} excludes a node of another arch`);
    }
  }
  // A node is reachable when its requirements can be met from the roots.
  const reached = new Set<string>();
  let grew = true;
  while (grew) {
    grew = false;
    for (const node of tree) {
      if (!reached.has(node.id) && node.requires.every((r) => reached.has(r))) {
        reached.add(node.id);
        grew = true;
      }
    }
  }
  for (const node of tree) {
    if (!reached.has(node.id))
      problems.push(`${node.id} can never be unlocked (circular requires)`);
  }
  return problems;
}

export type ParsedSkills = { ok: true; skills: SkillsState } | { ok: false; message: string };

/** Accepts a stored skills slice or says it is damaged; ranks must name real nodes and fit their caps. */
export function parseSkills(raw: unknown, tree: readonly SkillNode[] = SKILL_NODES): ParsedSkills {
  const bad = (): ParsedSkills => ({ ok: false, message: "The save's skills are damaged." });
  if (!isRecord(raw)) return bad();
  const { opened, sparks, ranks, villageOpened, faithSparks, milestones } = raw;
  if (typeof opened !== 'boolean' || typeof villageOpened !== 'boolean') return bad();
  if (!isCountInt(faithSparks) || !isCountInt(sparks)) return bad();
  if (!isRecord(ranks)) return bad();
  if (!Array.isArray(milestones) || !milestones.every(isMilestoneId)) return bad();
  if (new Set(milestones).size !== milestones.length) return bad();
  const out: Record<string, number> = {};
  for (const [id, rank] of Object.entries(ranks)) {
    const node = nodeById(tree, id);
    if (!node || !isInt(rank)) return bad();
    if (rank < 1 || rank > node.ranks) return bad();
    out[id] = rank;
  }
  if (!opened && (sparks > 0 || Object.keys(out).length > 0 || villageOpened)) return bad();
  if (!villageOpened && faithSparks > 0) return bad();
  for (const id of Object.keys(out)) {
    const node = nodeById(tree, id) as SkillNode;
    if (!node.requires.every((r) => (out[r] ?? 0) > 0)) return bad();
    if (node.arch === 'village' && !villageOpened) return bad();
    if ((node.excludes ?? []).some((x) => (out[x] ?? 0) > 0)) return bad();
    if (node.gate && !milestones.includes(node.gate)) return bad();
  }
  return {
    ok: true,
    skills: { opened, sparks, ranks: out, villageOpened, faithSparks, milestones: [...milestones] },
  };
}
