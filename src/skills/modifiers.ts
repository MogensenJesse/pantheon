// src/skills/modifiers.ts — the numbers that skills change, in one shared record
// (pure: no DOM, node-runnable)
//
// Game code reads `modifiers` (the orb's pickup range, the player light, the energy cap) and never asks
// which node or place of power set a value. Every field is neutral (1 or 0) until a node changes it, so a game with no
// unlocked nodes plays unmodified.

export interface Modifiers {
  /** Multiplies the orb's pickup radius (Resonance). */
  absorbRadiusMul: number;
  /** Multiplies how far the orb's light reaches (Presence). */
  lightReachMul: number;
  /** Added to the base energy cap (Surge). */
  energyCapAdd: number;
  /** Faith left behind by each orb picked up (Echo). */
  orbFaithTrail: number;
  /** 1 once energy returns inside a shrine's zone (Attunement), 0 before. */
  shrineAttuned: number;
  /** Energy per second regained anywhere (Renewal). */
  flatRegenPerSec: number;

  // --- arch II, the village. Read by the village sim and the energy regeneration. ---
  /** Beds added to every house (Wider beds). */
  bedsPerHouseAdd: number;
  /** Wood added to what a felled tree gives (Sharp axes). */
  woodPerTreeAdd: number;
  /** Food added to every field harvest (Good soil). */
  fieldYieldAdd: number;
  /** Added to the wood and food stores' capacity (Granary). */
  storageCapAdd: number;
  /** Multiplies how fast builders build (Quick hands). */
  builderRateMul: number;
  /** Multiplies the most buildings the village may have (Town). */
  buildingCapMul: number;
  /** Multiplies the days of an empty larder before people weaken and die (Lean winters). */
  hungerGraceMul: number;
  /** Multiplies how long a stump waits before it grows a sapling (Seedkeeper). */
  stumpWaitMul: number;
  /** Multiplies the fish caught (Tide-caller). */
  fishMul: number;
  /** Multiplies the faith a death costs (Gravekeeper). */
  deathFaithMul: number;
  /** 1 once stumps grow saplings at once while it rains (Evergreen), 0 before. */
  evergreen: number;
  /** Added to, then multiplied (Rain-reader, Downpour), what rain adds to the growth of fields and trees. */
  rainBoostAdd: number;
  rainBoostMul: number;
  /** Multiplies how often a storm front crosses the map (the places of power: drought and storms). */
  weatherChanceMul: number;
  /** Energy per second per believer (Devotion). */
  energyPerBeliever: number;
  /** 1 once the temple restores energy around it (Devotion), 0 before. */
  templeRegen: number;
}

export type ModifierKey = keyof Modifiers;

/** What a node does per rank: multiply or add to one modifier. */
export type ModifierEffect = { key: ModifierKey; mul: number } | { key: ModifierKey; add: number };

export function neutralModifiers(): Modifiers {
  return {
    absorbRadiusMul: 1,
    lightReachMul: 1,
    energyCapAdd: 0,
    orbFaithTrail: 0,
    shrineAttuned: 0,
    flatRegenPerSec: 0,
    bedsPerHouseAdd: 0,
    woodPerTreeAdd: 0,
    fieldYieldAdd: 0,
    storageCapAdd: 0,
    builderRateMul: 1,
    buildingCapMul: 1,
    hungerGraceMul: 1,
    stumpWaitMul: 1,
    fishMul: 1,
    deathFaithMul: 1,
    evergreen: 0,
    rainBoostAdd: 0,
    rainBoostMul: 1,
    weatherChanceMul: 1,
    energyPerBeliever: 0,
    templeRegen: 0,
  };
}

/** Applies each effect `times` times to a neutral record (ranks compound). */
export function foldEffects(
  effects: readonly { effect: ModifierEffect; times: number }[],
): Modifiers {
  const out = neutralModifiers();
  for (const { effect, times } of effects) {
    for (let i = 0; i < times; i++) {
      if ('mul' in effect) out[effect.key] *= effect.mul;
      else out[effect.key] += effect.add;
    }
  }
  return out;
}

/** The live record the game reads. Replaced in place, so modules can hold the object. */
export const modifiers: Modifiers = neutralModifiers();

export function setModifiers(next: Modifiers): void {
  Object.assign(modifiers, next);
}
