// src/skills/skillTree.ts — the skill tree: its nodes and the rules for opening, spending and respeccing
// (pure data and functions: no DOM, no game modules, node-runnable)
//
// The state is plain data (it is what a save keeps) and every rule returns a new state instead of
// changing the old one. What a node does goes through `modifiers.ts`; this file never knows the game.

import { foldEffects, type ModifierEffect, type Modifiers } from './modifiers.ts';

export type Arch = 'void' | 'village';

export interface SkillNode {
  id: string;
  arch: Arch;
  branch: string;
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
  /** Per rank. */
  effects: readonly ModifierEffect[];
  /** An active ability this node grants (see src/abilities). */
  ability?: string;
}

/** Sparks the player gets when the tree opens. */
export const FIRST_SPARKS = 2;

export const SKILL_NODES: readonly SkillNode[] = [
  {
    id: 'resonance',
    arch: 'void',
    branch: 'draw',
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
    branch: 'draw',
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
    branch: 'draw',
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
    branch: 'reserve',
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
    id: 'dream',
    arch: 'void',
    branch: 'voice',
    name: 'Dream',
    text: 'At night, the sleepers of a house dream of you and begin to believe.',
    x: -2,
    y: 0,
    cost: 1,
    ranks: 1,
    requires: [],
    effects: [],
    ability: 'dream',
  },
  {
    id: 'sign',
    arch: 'void',
    branch: 'voice',
    name: 'Sign',
    text: 'A small miracle that everyone nearby sees and takes to heart.',
    x: -3,
    y: -1,
    cost: 1,
    ranks: 1,
    requires: [],
    effects: [],
    ability: 'sign',
  },
  {
    id: 'attunement',
    arch: 'void',
    branch: 'wellspring',
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
    branch: 'wellspring',
    name: 'Renewal',
    text: 'A faint trickle of energy returns wherever you are.',
    x: 3,
    y: -1,
    cost: 1,
    ranks: 1,
    requires: ['attunement'],
    effects: [{ key: 'flatRegenPerSec', add: 0.05 }],
  },
];

export interface SkillsState {
  /** The tree has been opened (at the energy cap); latched, never goes back. */
  opened: boolean;
  /** Sparks not yet spent. */
  sparks: number;
  /** Ranks taken, by node id (only nodes with at least one rank appear). */
  ranks: Record<string, number>;
}

export function newSkillsState(): SkillsState {
  return { opened: false, sparks: 0, ranks: {} };
}

export type UnlockRefusal = 'unknown' | 'closed' | 'maxed' | 'locked' | 'sparks';

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
  if (!state.opened) return { ok: false, reason: 'closed' };
  if (rankOf(state, id) >= node.ranks) return { ok: false, reason: 'maxed' };
  if (!node.requires.every((r) => rankOf(state, r) > 0)) return { ok: false, reason: 'locked' };
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
      opened: true,
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

/**
 * Takes every rank back and returns its sparks. Free for now; once faith exists, a respec costs faith
 * and the caller checks that before calling this.
 */
export function respec(state: SkillsState, tree: readonly SkillNode[] = SKILL_NODES): SkillsState {
  return { opened: state.opened, sparks: state.sparks + spentSparks(state, tree), ranks: {} };
}

/** Opens the tree with its first sparks; a tree that is already open stays as it is. */
export function openTree(state: SkillsState, firstSparks: number = FIRST_SPARKS): SkillsState {
  if (state.opened) return state;
  return { ...state, opened: true, sparks: state.sparks + firstSparks };
}

export function grantSparks(state: SkillsState, count: number): SkillsState {
  // A closed tree holds no sparks: it opens with its first ones (and a save refuses sparks in a closed tree).
  if (!state.opened || !Number.isInteger(count) || count <= 0) return state;
  return { ...state, sparks: state.sparks + count };
}

/** The modifier record that the ranks taken add up to. */
export function modifiersOf(
  state: SkillsState,
  tree: readonly SkillNode[] = SKILL_NODES,
): Modifiers {
  const parts: { effect: ModifierEffect; times: number }[] = [];
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
    for (const r of node.requires) {
      if (!ids.has(r)) problems.push(`${node.id} requires unknown node "${r}"`);
      if (r === node.id) problems.push(`${node.id} requires itself`);
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

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** Accepts a stored skills slice or says it is damaged; ranks must name real nodes and fit their caps. */
export function parseSkills(raw: unknown, tree: readonly SkillNode[] = SKILL_NODES): ParsedSkills {
  const bad = (): ParsedSkills => ({ ok: false, message: "The save's skills are damaged." });
  if (!isRecord(raw)) return bad();
  const { opened, sparks, ranks } = raw;
  if (typeof opened !== 'boolean') return bad();
  if (typeof sparks !== 'number' || !Number.isInteger(sparks) || sparks < 0) return bad();
  if (!isRecord(ranks)) return bad();
  const out: Record<string, number> = {};
  for (const [id, rank] of Object.entries(ranks)) {
    const node = nodeById(tree, id);
    if (!node || typeof rank !== 'number' || !Number.isInteger(rank)) return bad();
    if (rank < 1 || rank > node.ranks) return bad();
    out[id] = rank;
  }
  if (!opened && (sparks > 0 || Object.keys(out).length > 0)) return bad();
  for (const id of Object.keys(out)) {
    const node = nodeById(tree, id) as SkillNode;
    if (!node.requires.every((r) => (out[r] ?? 0) > 0)) return bad();
  }
  return { ok: true, skills: { opened, sparks, ranks: out } };
}
