// src/skills/skillView.ts — what the skill tree panel shows, as pure rules
// (no DOM, node-runnable): the look of each node, tooltip text, edges, and pan and zoom
//
// The panel only draws what these return, so the wording and the geometry are checked in node.

import { milestoneLabel } from './milestones.ts';
import type { ModifierEffect, ModifierKey } from './modifiers.ts';
import {
  canUnlock,
  rankOf,
  SKILL_NODES,
  type SkillNode,
  type SkillsState,
  type UnlockRefusal,
} from './skillTree.ts';

/**
 * taken: every rank. progress: some ranks, more to take. available: can be taken now.
 * short: its requirements are met but there are not enough sparks. locked: a requirement is missing.
 */
export type NodeStatus = 'taken' | 'progress' | 'available' | 'short' | 'locked';

export function nodeStatus(
  state: SkillsState,
  node: SkillNode,
  tree: readonly SkillNode[] = SKILL_NODES,
): NodeStatus {
  const rank = rankOf(state, node.id);
  if (rank >= node.ranks) return 'taken';
  const check = canUnlock(state, node.id, tree);
  if (check.ok) return rank > 0 ? 'progress' : 'available';
  if (check.reason === 'sparks') return rank > 0 ? 'progress' : 'short';
  return 'locked';
}

const REFUSAL: Record<UnlockRefusal, string> = {
  unknown: 'Unknown skill',
  closed: 'The tree is not open yet',
  maxed: 'Already taken',
  locked: 'Needs an earlier skill first',
  excluded: 'You took the other path',
  gated: 'The village has not reached the milestone yet',
  sparks: 'Not enough sparks',
};

export const unlockRefusalText = (reason: UnlockRefusal): string => REFUSAL[reason];

export const sparksLabel = (count: number): string =>
  `${count} ${count === 1 ? 'spark' : 'sparks'}`;

const MODIFIER_LABEL: Record<ModifierKey, string> = {
  absorbRadiusMul: 'Pickup range',
  lightReachMul: 'Light reach',
  energyCapAdd: 'Energy cap',
  orbFaithTrail: 'Faith per memory gathered',
  shrineAttuned: 'Energy returns inside a shrine',
  flatRegenPerSec: 'Energy regained anywhere',
  bedsPerHouseAdd: 'Beds in every house',
  woodPerTreeAdd: 'Wood from a felled tree',
  fieldYieldAdd: 'Food from a harvest',
  storageCapAdd: 'What the stores hold',
  builderRateMul: 'Building speed',
  buildingCapMul: 'Most buildings the village may have',
  hungerGraceMul: 'Time hungry before people weaken',
  stumpWaitMul: 'Wait before a stump regrows',
  fishMul: 'Fish caught',
  deathFaithMul: 'Faith a death costs',
  evergreen: 'Stumps regrow at once while it rains',
  rainBoostAdd: 'What rain adds to growth',
  rainBoostMul: 'What rain adds to growth',
  weatherChanceMul: 'How often storms come',
  stormStrengthMul: 'How strong storms are',
  energyPerBeliever: 'Energy per believer',
  templeRegen: 'The temple restores energy around it',
};

/** Modifiers that are a switch, not a number: the label says it all when they go on. */
const SWITCHES: readonly ModifierKey[] = ['shrineAttuned', 'evergreen', 'templeRegen'];

/** Unit written after a number. */
const UNIT: Partial<Record<ModifierKey, string>> = {
  flatRegenPerSec: ' per second',
  energyPerBeliever: ' per second',
};

const trim = (n: number) => String(Number(n.toFixed(2)));

/** "Pickup range ×1.6", "Energy cap +60". */
export function describeEffect(effect: ModifierEffect): string {
  const label = MODIFIER_LABEL[effect.key];
  if ('mul' in effect) return `${label} ×${trim(effect.mul)}`;
  if (SWITCHES.includes(effect.key)) return label;
  return `${label} ${effect.add >= 0 ? '+' : '−'}${trim(Math.abs(effect.add))}${UNIT[effect.key] ?? ''}`;
}

export interface NodeTooltip {
  title: string;
  /** The glance and hover text. */
  body: string;
  /** Shown while Shift is held: effect, requirements, status. */
  inspect: string;
}

export function nodeTooltip(
  state: SkillsState,
  node: SkillNode,
  tree: readonly SkillNode[] = SKILL_NODES,
): NodeTooltip {
  const status = nodeStatus(state, node, tree);
  const rank = rankOf(state, node.id);
  const ranks = node.ranks > 1 ? ` (${rank}/${node.ranks})` : '';
  const cost = status === 'taken' ? 'Taken' : `Cost: ${sparksLabel(node.cost)}`;
  const needs = node.requires
    .filter((r) => rankOf(state, r) === 0)
    .map((r) => tree.find((n) => n.id === r)?.name ?? r);
  const gate = node.gate && !state.milestones.includes(node.gate) ? milestoneLabel(node.gate) : '';
  const excludedBy = (node.excludes ?? [])
    .filter((x) => rankOf(state, x) > 0)
    .map((x) => tree.find((n) => n.id === x)?.name ?? x);
  const lines = [
    ...node.effects.map(describeEffect),
    node.ability ? 'A power: cast it from the radial menu (hold Q)' : '',
    needs.length > 0 ? `Needs ${needs.join(' and ')}` : '',
    gate ? `Needs the milestone: ${gate}` : '',
    excludedBy.length > 0 ? `Closed: you took ${excludedBy.join(' and ')}` : '',
    status === 'short' ? `You have ${sparksLabel(state.sparks)}` : '',
  ].filter(Boolean);
  return {
    title: `${node.name}${ranks}`,
    body: `${node.text}\n${cost}`,
    inspect: lines.join('\n'),
  };
}

/** One line between a node and each node it requires. */
export function treeEdges(
  tree: readonly SkillNode[] = SKILL_NODES,
): { from: string; to: string }[] {
  const out: { from: string; to: string }[] = [];
  for (const node of tree) for (const r of node.requires) out.push({ from: r, to: node.id });
  return out;
}

export interface Bounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export function treeBounds(tree: readonly SkillNode[] = SKILL_NODES): Bounds {
  if (tree.length === 0) return { minX: 0, maxX: 0, minY: 0, maxY: 0 };
  return {
    minX: Math.min(...tree.map((n) => n.x)),
    maxX: Math.max(...tree.map((n) => n.x)),
    minY: Math.min(...tree.map((n) => n.y)),
    maxY: Math.max(...tree.map((n) => n.y)),
  };
}

/** Pan and zoom of the constellation: world point (x, y) times `scale`, plus the offset, is the screen. */
export interface View {
  x: number;
  y: number;
  scale: number;
}

export const MIN_SCALE = 0.4;
export const MAX_SCALE = 2.5;
/** Pixels between neighbouring node positions at scale 1. */
export const NODE_SPACING_PX = 120;

export const clampScale = (scale: number): number =>
  Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));

/** Zooms by `factor` keeping the screen point `anchor` (relative to the viewport) where it is. */
export function zoomAt(view: View, factor: number, anchor: { x: number; y: number }): View {
  const scale = clampScale(view.scale * factor);
  const k = scale / view.scale;
  return { scale, x: anchor.x - (anchor.x - view.x) * k, y: anchor.y - (anchor.y - view.y) * k };
}

/** Centres the tree in a viewport at scale 1 (smaller when it would not fit with `padding` px around). */
export function fitView(
  bounds: Bounds,
  viewport: { width: number; height: number },
  padding = 64,
): View {
  const w = (bounds.maxX - bounds.minX) * NODE_SPACING_PX;
  const h = (bounds.maxY - bounds.minY) * NODE_SPACING_PX;
  const fit = Math.min(
    (viewport.width - padding * 2) / Math.max(w, 1),
    (viewport.height - padding * 2) / Math.max(h, 1),
  );
  const scale = clampScale(Math.min(1, fit));
  const cx = ((bounds.minX + bounds.maxX) / 2) * NODE_SPACING_PX * scale;
  const cy = ((bounds.minY + bounds.maxY) / 2) * NODE_SPACING_PX * scale;
  return { scale, x: viewport.width / 2 - cx, y: viewport.height / 2 - cy };
}

/** A pan keeps at least part of the tree on screen: the view cannot be dragged away for good. */
export function clampPan(
  view: View,
  bounds: Bounds,
  viewport: { width: number; height: number },
  margin = 48,
): View {
  const left = bounds.minX * NODE_SPACING_PX * view.scale + view.x;
  const right = bounds.maxX * NODE_SPACING_PX * view.scale + view.x;
  const top = bounds.minY * NODE_SPACING_PX * view.scale + view.y;
  const bottom = bounds.maxY * NODE_SPACING_PX * view.scale + view.y;
  let { x, y } = view;
  if (right < margin) x += margin - right;
  if (left > viewport.width - margin) x -= left - (viewport.width - margin);
  if (bottom < margin) y += margin - bottom;
  if (top > viewport.height - margin) y -= top - (viewport.height - margin);
  return { ...view, x, y };
}
