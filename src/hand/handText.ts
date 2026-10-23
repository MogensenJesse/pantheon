// src/hand/handText.ts — the words the hand uses (pure: no DOM, node-runnable; placeholder text)

import type { Drop } from './handRules.ts';
import type { Delivery, Lost, PickOutcome } from './handRuntime.ts';
import type { HandCandidate, HandKind, Held } from './handTypes.ts';

const THING: Record<HandCandidate['kind'], string> = {
  tree: 'tree',
  wheat: 'wheat',
  sheep: 'sheep',
};

/** Why a lift did not happen; empty when the player needs no word about it. */
export function refusalText(reason: Extract<PickOutcome, { ok: false }>['reason']): string {
  if (reason === 'none') return 'There is nothing here to lift.';
  if (reason === 'energy') return 'Not enough energy to lift that.';
  return '';
}

/** What a delivery came to, for a toast. */
export function deliveryText(d: Delivery): string {
  const watched = d.impressed > 0 ? ' The villagers are impressed.' : '';
  if (d.zone === 'site') return `Wood hauled to the builders.${watched}`;
  if (d.kept <= 0) return `The store is full, but the village saw it.${watched}`;
  const full =
    d.kept < d.amount ? ` (the store is full: ${Math.floor(d.kept)} of ${d.amount})` : '';
  return `${d.what === 'tree' ? 'Wood' : 'Food'} for the stores: +${Math.floor(d.kept)}${full}.${watched}`;
}

export const releasedText = 'You let it go. The effort is lost.';
export const goneText = 'Someone else took it first.';

/** A hold that ended by itself; `what` is what was held. */
export function lostText(lost: Lost, what: HandKind | undefined): string {
  if (lost !== 'gone') return '';
  if (what === 'wheat') return 'The wheat you held was reaped. Your energy returns.';
  return 'The tree you held was felled. Your energy returns.';
}

/** The hint line: what the key does now (empty when it does nothing). */
export function hintText(
  target: HandCandidate | null,
  held: Held | null,
  zone: Drop | null,
): string {
  if (held) {
    if (!zone || zone.zone === 'none') return 'let go (the effort is lost)';
    return zone.zone === 'site' ? 'haul the wood to the builders' : 'put it down';
  }
  return target ? `pull up the ${THING[target.kind]}` : '';
}
