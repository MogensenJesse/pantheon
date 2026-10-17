// src/skills/modifiers.ts — the numbers that skills change, in one shared record
// (pure: no DOM, node-runnable)
//
// Game code reads `modifiers` (the orb's pickup range, the player light, the energy cap) and never asks
// which node set a value. Every field is neutral (1 or 0) until a node changes it, so a game with no
// unlocked nodes plays as before. `Echo` and later nodes are recorded here before their readers exist.

export interface Modifiers {
  /** Multiplies the orb's pickup radius (Resonance). */
  absorbRadiusMul: number;
  /** Multiplies how far the orb's light reaches (Presence). */
  lightReachMul: number;
  /** Added to the base energy cap (Surge). */
  energyCapAdd: number;
  /** Faith left behind by each orb picked up (Echo); read once faith exists. */
  orbFaithTrail: number;
  /** 1 once energy returns inside a shrine's zone (Attunement), 0 before. */
  shrineAttuned: number;
  /** Energy per second regained anywhere (Renewal). */
  flatRegenPerSec: number;
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
