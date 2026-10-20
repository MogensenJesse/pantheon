// src/abilities/abilities.ts — what an active ability is, and the list of them
// (pure data: no DOM, no game modules, node-runnable)
//
// Arch I powers are cast in the roam view with the orb in the world, arch II powers with the orb as
// the cursor (overview). The three conversion powers (Murmur, Dream, Sign) are here; what they do is in
// powers.ts and the framework around them in caster.ts.

import { PHASE0 } from '../config/phase0.ts';
import { VILLAGE } from '../config/village.ts';
import type { Arch } from '../skills/skillTree.ts';

/** What the power aims at. */
export type Targeting =
  | 'villager'
  | 'house'
  | 'cursor'
  | 'sky'
  /** A field, a finished house or a tree (Blessing). */
  | 'bless'
  /** A construction site (Kindle). */
  | 'site';

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
  /** Available as soon as arch II, The Village, opens. */
  grantedWithVillage?: boolean;
  /** What to do once an overview power is armed (the overview shows it as a hint). */
  armHint?: string;
}

/** Where a power was aimed. A target carries the kind of thing hit and, where it has one, its place. */
export interface AbilityTarget {
  kind: Targeting;
  /** What a Blessing was aimed at: `'field' | 'house' | 'tree'`. */
  of?: string;
  id?: number;
  x?: number;
  z?: number;
}

/** The ids of the shipped powers, so code that treats one specially does not spell them. */
export const ABILITY_IDS = {
  murmur: 'murmur',
  dream: 'dream',
  sign: 'sign',
  blessing: 'blessing',
  kindle: 'kindle',
  provide: 'provide',
  callRain: 'call_rain',
  clearSkies: 'clear_skies',
} as const;

const BP = VILLAGE.BUILDER_POWERS;

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
  // --- Arch II, The Village: cast with the orb as the cursor in the overview, paid in faith ---
  {
    id: ABILITY_IDS.blessing,
    name: 'Blessing',
    arch: 'village',
    cost: { faith: BP.BLESSING.FAITH },
    cooldownSec: BP.BLESSING.COOLDOWN_S,
    targeting: 'bless',
    grantedWithVillage: true,
    armHint: 'Click a field, a house or a tree to bless it',
  },
  {
    id: ABILITY_IDS.kindle,
    name: 'Kindle',
    arch: 'village',
    cost: { faith: BP.KINDLE.FAITH },
    cooldownSec: BP.KINDLE.COOLDOWN_S,
    targeting: 'site',
    grantedWithVillage: true,
    armHint: 'Click a construction site to finish its stage',
  },
  {
    id: ABILITY_IDS.provide,
    name: 'Provide',
    arch: 'village',
    cost: { faith: BP.PROVIDE.FAITH },
    cooldownSec: BP.PROVIDE.COOLDOWN_S,
    targeting: 'cursor',
    grantedWithVillage: true,
    armHint: 'Click anywhere to conjure food',
  },
  {
    id: ABILITY_IDS.callRain,
    name: 'Call rain',
    arch: 'village',
    cost: { faith: BP.CALL_RAIN.FAITH },
    cooldownSec: BP.CALL_RAIN.COOLDOWN_S,
    targeting: 'sky',
    grantedWithVillage: true,
    armHint: 'Click where the storm should gather',
  },
  {
    id: ABILITY_IDS.clearSkies,
    name: 'Clear skies',
    arch: 'village',
    cost: { faith: BP.CLEAR_SKIES.FAITH },
    cooldownSec: BP.CLEAR_SKIES.COOLDOWN_S,
    targeting: 'sky',
    grantedWithVillage: true,
    armHint: 'Click where the sky should part',
  },
];

/** The shipped power with this id. */
export const abilityById = (id: string): AbilityDef | undefined =>
  ABILITIES.find((d) => d.id === id);
