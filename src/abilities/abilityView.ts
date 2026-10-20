// src/abilities/abilityView.ts — what the ability bar and the radial menu show for a power
// (pure: no DOM, node-runnable)

import type { AbilityDef } from './abilities.ts';
import type { AbilityStatus, CastRefusal } from './caster.ts';

export interface AbilityView {
  id: string;
  name: string;
  /** "10 energy", "5 faith", "10 energy, 5 faith", or "" when free. */
  cost: string;
  /** The icon next to the cost: faith for the village powers, energy otherwise. */
  costIcon: 'energy' | 'faith';
  ready: boolean;
  /** 0 when ready or not on cooldown, 1 right after a cast, down to 0. */
  cooldownFraction: number;
  cooldownLeft: number;
  /** A word for why it cannot be cast now ("Not enough energy"), or "". */
  note: string;
  /** The power is running right now (a channel), so casting it again ends it. */
  active: boolean;
}

export function describeCost(def: AbilityDef): string {
  const parts: string[] = [];
  if (def.cost.energy) parts.push(`${def.cost.energy} energy`);
  if (def.cost.faith) parts.push(`${def.cost.faith} faith`);
  if (def.drainPerSec) parts.push(`${def.drainPerSec} energy/s`);
  return parts.join(', ');
}

const REFUSAL: Record<CastRefusal, string> = {
  unknown: 'Unknown power',
  locked: 'Not unlocked yet',
  cooldown: 'Not ready yet',
  energy: 'Not enough energy',
  faith: 'Not enough faith',
  target: 'Nothing to aim at',
};

export const refusalText = (reason: CastRefusal): string => REFUSAL[reason];

export function abilityView(def: AbilityDef, status: AbilityStatus, active = false): AbilityView {
  const fraction =
    def.cooldownSec > 0 ? Math.min(1, Math.max(0, status.cooldownLeft / def.cooldownSec)) : 0;
  return {
    id: def.id,
    name: def.name,
    cost: describeCost(def),
    costIcon: def.cost.faith && !def.cost.energy ? 'faith' : 'energy',
    ready: status.ready,
    cooldownFraction: fraction,
    cooldownLeft: status.cooldownLeft,
    note: active ? 'Channelling' : status.reason ? refusalText(status.reason) : '',
    active,
  };
}

/** What to do once a cursor power is armed (the overview shows it as a hint). */
export const ARM_HINT: Record<string, string> = {
  blessing: 'Click a field, a house or a tree to bless it',
  kindle: 'Click a construction site to finish its stage',
  provide: 'Click anywhere to conjure food',
  call_rain: 'Click where the storm should gather',
  clear_skies: 'Click where the sky should part',
};
