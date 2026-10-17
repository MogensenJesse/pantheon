// src/entities/shrine/energyRegen.ts — the one energy regeneration tick
//
// Sums the sources (regen.ts) once per fixed step and adds the result to the energy. Nothing returns
// until a skill allows it, so a game that has taken no regeneration node never gains energy here.

import { bus } from '../../core/EventBus';
import { setEnergy } from '../../core/energy';
import { state } from '../../core/GameState';
import { modifiers } from '../../skills/modifiers';
import {
  regenRate,
  regenStep,
  type ShrineSource,
  type ShrineZone,
  toZone,
  zoneRateAt,
} from './regen';

export interface EnergyRegen {
  zones: readonly ShrineZone[];
  /** Energy per second now (0 when the bar is full). */
  rate: () => number;
  /** Does the orb stand in a zone whose energy it can take (Attunement taken)? */
  inActiveZone: () => boolean;
  update: (dt: number) => void;
}

export function initEnergyRegen(
  shrines: readonly ShrineSource[],
  playerPosition: () => { x: number; z: number },
): EnergyRegen {
  const zones = shrines.map(toZone);
  let current = 0;
  let inActive = false;
  let shown = 0;

  return {
    zones,
    rate: () => current,
    inActiveZone: () => inActive,
    update: (dt) => {
      const p = playerPosition();
      const zoneRate = zoneRateAt(zones, p.x, p.z);
      inActive = modifiers.shrineAttuned > 0 && zoneRate > 0;
      const rate = regenRate({
        zoneRate,
        attuned: modifiers.shrineAttuned,
        flatPerSec: modifiers.flatRegenPerSec,
      });
      const full = state.energy >= state.energyCap;
      current = full ? 0 : rate;
      if (current > 0) setEnergy(regenStep(state.energy, state.energyCap, current, dt));
      // The HUD only hears about changes of the shown rate, not every step.
      if (Math.abs(current - shown) > 1e-9) {
        shown = current;
        bus.emit('energy:regen', { perSec: shown });
      }
    },
  };
}
