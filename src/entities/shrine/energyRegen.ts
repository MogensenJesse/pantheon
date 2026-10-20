// src/entities/shrine/energyRegen.ts — the one energy regeneration tick
//
// Sums the sources (regen.ts) once per fixed step and adds the result to the energy. Every source is gated
// by a skill (Attunement, Renewal, Devotion), so a game with none of them never gains energy here.

import { PHASE0 } from '../../config/phase0';
import { bus } from '../../core/EventBus';
import { setEnergy } from '../../core/energy';
import { state } from '../../core/state/gameState';
import { modifiers } from '../../skills/modifiers';
import {
  regenRate,
  regenStep,
  type ShrineSource,
  type ShrineZone,
  templeRateAt,
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

/** What the village gives the energy (Devotion): where its temple stands and how many believe. */
export interface RegenVillage {
  temple: () => { x: number; z: number } | null;
  believers: () => number;
}

export function initEnergyRegen(
  shrines: readonly ShrineSource[],
  playerPosition: () => { x: number; z: number },
  village?: RegenVillage | null,
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
        templeRate:
          modifiers.templeRegen > 0
            ? templeRateAt(
                village?.temple() ?? null,
                p.x,
                p.z,
                PHASE0.SHRINE.RADIUS_M,
                PHASE0.SHRINE.REGEN_PER_SEC,
              )
            : 0,
        believerRate: (village?.believers() ?? 0) * modifiers.energyPerBeliever,
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
