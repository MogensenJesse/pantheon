// src/world/village/sim/faith.ts — the village's faith: a slow base rate, sped up by the orb's presence
import { VILLAGE } from '../../../config/village.ts';
import { isNum } from '../../../core/guards.ts';
import { clamp01 } from '../../../core/math/scalar.ts';

export interface FaithState {
  faith: number;
  /** Faith gathered over the village's life (never spent): drives the temple's orb and beam. */
  earned: number;
  /** Presence ramp 0..1: climbs while the orb is near, fades when it leaves. */
  dwell01: number;
  /** Current boost 0..1 (dwell times distance falloff); 0 while the phase gate is closed. */
  boost01: number;
  /** Faith per second right now. */
  rate: number;
}

/** Why a saved faith state cannot be used, or null. */
export function faithProblem(state: unknown): string | null {
  const s = state as Partial<FaithState> | null;
  const ok = !!s && [s.faith, s.earned, s.dwell01, s.boost01, s.rate].every(isNum);
  return ok ? null : 'saved village: the faith is missing or damaged';
}

export function createFaithState(): FaithState {
  return {
    faith: VILLAGE.FAITH.START,
    earned: VILLAGE.FAITH.START,
    dwell01: 0,
    boost01: 0,
    rate: VILLAGE.FAITH.BASE_PER_SEC,
  };
}

export interface FaithInputs {
  /** Distance from the orb to the village centre (m); null before the player exists. */
  playerDistM: number | null;
  /** False in Phase 0, when nobody can perceive the orb. */
  presenceActive: boolean;
  /** Faith per second before the orb's presence: the flat base rate unless the village says otherwise. */
  baseRate?: number;
  /** Faith per second added to the base before the presence and the multiplier (the shrines); default 0. */
  bonusRate?: number;
  /** Factor on all faith income (the skill tree); default 1. */
  mul?: number;
}

/** Faith the next building site costs; each building already standing raises it slightly. */
export function siteCost(buildingCount: number): number {
  return VILLAGE.FAITH.SITE_COST * (1 + VILLAGE.FAITH.SITE_COST_GROWTH * buildingCount);
}

export function stepFaith(state: FaithState, dt: number, inputs: FaithInputs): void {
  const f = VILLAGE.FAITH;
  const near =
    inputs.presenceActive &&
    inputs.playerDistM !== null &&
    inputs.playerDistM < f.PRESENCE_RADIUS_M;
  const ramp = near ? dt / f.DWELL_UP_S : -dt / f.DWELL_DOWN_S;
  state.dwell01 = clamp01(state.dwell01 + ramp);
  let falloff = 0;
  if (near && inputs.playerDistM !== null) {
    const span = f.PRESENCE_RADIUS_M - f.FULL_RADIUS_M;
    falloff = clamp01((f.PRESENCE_RADIUS_M - inputs.playerDistM) / span);
  }
  state.boost01 = inputs.presenceActive ? state.dwell01 * falloff : 0;
  const income =
    ((inputs.baseRate ?? f.BASE_PER_SEC) + (inputs.bonusRate ?? 0)) * (inputs.mul ?? 1);
  state.rate = income * (1 + (f.PRESENCE_MUL - 1) * state.boost01);
  state.faith += state.rate * dt;
  state.earned += state.rate * dt;
}
