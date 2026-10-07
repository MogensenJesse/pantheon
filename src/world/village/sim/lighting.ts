// src/world/village/sim/lighting.ts — when windows glow and chimneys smoke (pure schedule rules)
import { VILLAGE } from '../../../config/village.ts';
import type { VillageBuildingType } from '../model/assetKeys.ts';
import { hash01, wrap01 } from './geometry.ts';

/** Whether a building's windows are lit: evenings until a per-house bedtime, and a wake-up glow. */
export function windowsLit(
  type: VillageBuildingType,
  id: number,
  occupied: boolean,
  dayPhase: number,
  vigil: boolean,
): boolean {
  if (!occupied) return false;
  const { LIGHTS } = VILLAGE;
  const h = hash01(id);
  if (vigil) return type === 'temple' || h < LIGHTS.VIGIL_SHARE;
  const p = wrap01(dayPhase);
  if (type === 'temple') return p >= LIGHTS.DUSK || p < LIGHTS.SUNRISE;
  const bedtime = LIGHTS.BEDTIME_MIN + LIGHTS.BEDTIME_SPAN * h;
  return (p >= LIGHTS.DUSK && p < bedtime) || (p >= LIGHTS.WAKE && p < LIGHTS.SUNRISE);
}

/** Chimney smoke strength 0..1 for an occupied home or workshop. */
export function smokeStrength(id: number, dayPhase: number, vigil: boolean): number {
  const { SMOKE } = VILLAGE;
  if (vigil) return SMOKE.VIGIL;
  const p = wrap01(dayPhase);
  const cooking =
    (p >= SMOKE.MORNING[0] && p < SMOKE.MORNING[1]) ||
    (p >= SMOKE.EVENING[0] && p < SMOKE.EVENING[1]);
  return cooking ? 0.75 + 0.25 * hash01(id + 17) : SMOKE.IDLE;
}
