// src/abilities/abilities.ts — what an active ability is, and the list of them
// (pure data: no DOM, no game modules, node-runnable)
//
// Arch I powers are cast in the roam view with the orb in the world, arch II powers with the orb as
// the cursor (overview). The three conversion powers (Murmur, Dream, Sign) are here; what they do is in
// powers.ts and the framework around them in caster.ts.

import { PHASE0 } from '../config/phase0.ts';
import type { Arch } from '../skills/skillTree.ts';

/** What the power aims at. */
export type Targeting = 'self' | 'villager' | 'house' | 'cursor' | 'sky';

export interface AbilityDef {
  id: string;
  name: string;
  arch: Arch;
  /** Paid when the power is cast. Faith costs are for arch II powers. */
  cost: { energy?: number; faith?: number };
  cooldownSec: number;
  targeting: Targeting;
  /** Energy per second while the power runs (a channel): it can start only with that much energy. */
  drainPerSec?: number;
  /** Available as soon as the skill tree opens, with no node to take. */
  grantedAtOpen?: boolean;
}

/** Where a power was aimed. A target carries the kind of thing hit and, where it has one, its place. */
export interface AbilityTarget {
  kind: Targeting;
  id?: number;
  x?: number;
  z?: number;
}

/** The ids of the shipped powers, so code that treats one specially does not spell them. */
export const ABILITY_IDS = { murmur: 'murmur', dream: 'dream', sign: 'sign' } as const;

export const ABILITIES: readonly AbilityDef[] = [
  {
    id: ABILITY_IDS.murmur,
    name: 'Murmur',
    arch: 'void',
    cost: {},
    drainPerSec: PHASE0.POWERS.MURMUR.DRAIN_PER_SEC,
    cooldownSec: 0,
    targeting: 'villager',
    grantedAtOpen: true,
  },
  {
    id: ABILITY_IDS.dream,
    name: 'Dream',
    arch: 'void',
    cost: { energy: PHASE0.POWERS.DREAM.COST },
    cooldownSec: 0,
    targeting: 'house',
  },
  {
    id: ABILITY_IDS.sign,
    name: 'Sign',
    arch: 'void',
    cost: { energy: PHASE0.POWERS.SIGN.COST },
    cooldownSec: PHASE0.POWERS.SIGN.COOLDOWN_SEC,
    targeting: 'cursor',
  },
];
