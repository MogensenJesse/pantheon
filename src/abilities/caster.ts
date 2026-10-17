// src/abilities/caster.ts — the cast pipeline: is the power granted, ready and affordable, then pay,
// perform and start the cooldown
// (pure: the game is reached only through `CasterDeps`, so it runs in node)

import type { AbilityDef, AbilityTarget } from './abilities.ts';

export type CastRefusal = 'unknown' | 'locked' | 'cooldown' | 'energy' | 'faith' | 'target';

export type CastResult = { ok: true } | { ok: false; reason: CastRefusal };

export interface AbilityStatus {
  id: string;
  /** Can be cast right now. */
  ready: boolean;
  /** Seconds until the cooldown ends (0 when there is none). */
  cooldownLeft: number;
  /** Why it cannot be cast, when it cannot. */
  reason?: CastRefusal;
}

export interface CasterDeps {
  defs: readonly AbilityDef[];
  /** The skill tree has granted this power. */
  isGranted: (id: string) => boolean;
  energy: () => number;
  spendEnergy: (amount: number) => void;
  /** Absent until faith exists; a power that costs faith then cannot be cast. */
  faith?: { amount: () => number; spend: (amount: number) => void };
  /** Does the effect. Returns false when the target does not fit; nothing is paid then. */
  perform: (def: AbilityDef, target: AbilityTarget) => boolean;
}

export interface AbilityCaster {
  status: (id: string) => AbilityStatus;
  cast: (id: string, target: AbilityTarget) => CastResult;
  /** Counts cooldowns down. Call from the game tick, so a paused world holds them. */
  update: (dt: number) => void;
}

export function createAbilityCaster(deps: CasterDeps): AbilityCaster {
  const left = new Map<string, number>();
  const find = (id: string) => deps.defs.find((d) => d.id === id);

  const refusal = (def: AbilityDef): CastRefusal | null => {
    if (!deps.isGranted(def.id)) return 'locked';
    if ((left.get(def.id) ?? 0) > 0) return 'cooldown';
    const { energy = 0, faith = 0 } = def.cost;
    if (energy > 0 && deps.energy() < energy) return 'energy';
    if (faith > 0 && (!deps.faith || deps.faith.amount() < faith)) return 'faith';
    return null;
  };

  return {
    status: (id) => {
      const def = find(id);
      if (!def) return { id, ready: false, cooldownLeft: 0, reason: 'unknown' };
      const reason = refusal(def);
      const cooldownLeft = left.get(id) ?? 0;
      return reason
        ? { id, ready: false, cooldownLeft, reason }
        : { id, ready: true, cooldownLeft: 0 };
    },
    cast: (id, target) => {
      const def = find(id);
      if (!def) return { ok: false, reason: 'unknown' };
      const reason = refusal(def);
      if (reason) return { ok: false, reason };
      if (target.kind !== def.targeting) return { ok: false, reason: 'target' };
      if (!deps.perform(def, target)) return { ok: false, reason: 'target' };
      const { energy = 0, faith = 0 } = def.cost;
      if (energy > 0) deps.spendEnergy(energy);
      if (faith > 0) deps.faith?.spend(faith);
      if (def.cooldownSec > 0) left.set(id, def.cooldownSec);
      return { ok: true };
    },
    update: (dt) => {
      if (dt <= 0) return;
      for (const [id, remaining] of left) {
        const next = remaining - dt;
        if (next > 0) left.set(id, next);
        else left.delete(id);
      }
    },
  };
}
