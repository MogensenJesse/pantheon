// src/abilities/abilities.ts — what an active ability is, and the list of them
// (pure data: no DOM, no game modules, node-runnable)
//
// Arch II powers are cast with the orb as the cursor in the village overview (what they do is in
// builderPowers.ts, the framework around them in caster.ts). They are the two weather powers; winning belief
// and helping the village (wood, food, builders) is the orb's hand (src/hand), not a power.

import { VILLAGE } from '../config/village.ts';
import type { Arch } from '../skills/skillTree.ts';

/** What the power aims at. */
export type Targeting = 'cursor' | 'sky';

export interface AbilityDef {
  id: string;
  name: string;
  arch: Arch;
  /** Paid when the power is cast. Faith costs are for arch II powers. */
  cost: { energy?: number; faith?: number };
  cooldownSec: number;
  targeting: Targeting;
  /** Available as soon as arch II, The Village, opens. */
  grantedWithVillage?: boolean;
  /** What to do once an overview power is armed (the overview shows it as a hint). */
  armHint?: string;
}

/** Where a power was aimed. A target carries the kind of thing hit and, where it has one, its place. */
export interface AbilityTarget {
  kind: Targeting;
  id?: number;
  x?: number;
  z?: number;
}

/** The ids of the shipped powers, so code that treats one specially does not spell them. */
export const ABILITY_IDS = {
  callRain: 'call_rain',
  clearSkies: 'clear_skies',
} as const;

const BP = VILLAGE.WEATHER_POWERS;

export const ABILITIES: readonly AbilityDef[] = [
  // --- Arch II, The Village: cast with the orb as the cursor in the overview, paid in faith ---
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
