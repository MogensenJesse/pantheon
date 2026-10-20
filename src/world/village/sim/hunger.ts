// src/world/village/sim/hunger.ts — what an empty larder does to a village: weakness, then deaths
// (pure: no DOM, no three, node-runnable)
//
// One number, `level`, tells how long hunger has built up: it grows by a second per second while food is
// out and drains (faster) once there is food again. Everyone is weak from `STARVE_GRACE_DAYS` on; at
// `STARVE_GRACE_DAYS + DEATH_AFTER_DAYS` it stops growing and deaths begin, one at once and then one every
// `DEATH_INTERVAL_DAYS` while the larder stays empty.

import { VILLAGE } from '../../../config/village.ts';
import { Role, type Villagers } from '../model/types.ts';

const H = VILLAGE.HUNGER;
const DAY_S = VILLAGE.ECONOMY.DAY_S;

/**
 * Seconds of hunger after which everyone is weak, and after which deaths begin. `grace` multiplies the days
 * of grace (a skill, Lean winters); the day count of the deaths' own wait does not change.
 */
export const weakAtS = (grace = 1): number => H.STARVE_GRACE_DAYS * grace * DAY_S;
export const deathsAtS = (grace = 1): number =>
  (H.STARVE_GRACE_DAYS * grace + H.DEATH_AFTER_DAYS) * DAY_S;
export const WEAK_AT_S = weakAtS();
export const DEATHS_AT_S = deathsAtS();
/** The most grace any skill gives: a saved build-up may be as high as that allows. */
const MAX_GRACE = 3;
const DEATH_INTERVAL_S = H.DEATH_INTERVAL_DAYS * DAY_S;
/** How fast the build-up drains once food is back: the stretch from the first death down to weakness, in RECOVERY_DAYS. */
const DRAIN_PER_S = (H.DEATH_AFTER_DAYS * DAY_S) / (H.RECOVERY_DAYS * DAY_S);

export interface HungerState {
  /** Seconds of hunger built up, 0 .. DEATHS_AT_S. */
  level: number;
  /** Seconds since the last death while deaths are on. */
  sinceDeath: number;
}

export const createHungerState = (): HungerState => ({ level: 0, sinceDeath: DEATH_INTERVAL_S });

export type HungerStage = 'fed' | 'empty' | 'weak' | 'dying';

/** Where the village is: fed, the larder just ran out, weak, or losing people. */
export function stageOf(state: HungerState, foodEmpty: boolean, grace = 1): HungerStage {
  if (state.level >= deathsAtS(grace)) return 'dying';
  if (state.level >= weakAtS(grace)) return 'weak';
  return foodEmpty || state.level > 0 ? 'empty' : 'fed';
}

export const isWeak = (state: Readonly<HungerState>, grace = 1): boolean =>
  state.level >= weakAtS(grace);

/** Why a saved hunger state cannot be used, or null. */
export function hungerProblem(state: unknown): string | null {
  const s = state as Partial<HungerState> | null;
  const ok = (n: unknown) => typeof n === 'number' && Number.isFinite(n) && n >= 0;
  if (!s || !ok(s.level) || !ok(s.sinceDeath) || (s.level as number) > deathsAtS(MAX_GRACE)) {
    return 'saved village: the hunger state is missing or damaged';
  }
  return null;
}

/**
 * Advance by `dt` with the larder empty (`foodEmpty`) or not. Returns true when a villager dies now.
 */
export function stepHunger(state: HungerState, dt: number, foodEmpty: boolean, grace = 1): boolean {
  const deathsAt = deathsAtS(grace);
  if (foodEmpty) state.level = Math.min(deathsAt, state.level + dt);
  else state.level = Math.max(0, Math.min(deathsAt, state.level) - dt * DRAIN_PER_S);
  if (state.level < deathsAt) {
    state.sinceDeath = DEATH_INTERVAL_S; // the next time deaths begin, the first is at once
    return false;
  }
  state.sinceDeath += dt;
  if (state.sinceDeath < DEATH_INTERVAL_S) return false;
  state.sinceDeath = 0;
  return true;
}

/** The order the kinds die in: idlers first, priests last. */
const DEATH_ORDER: readonly number[] = [
  Role.Idler,
  Role.Woodcutter,
  Role.Builder,
  Role.Fisherman,
  Role.Farmer,
  Role.Priest,
];

/**
 * Who dies next: by `DEATH_ORDER`, and within a kind the newest villager (the highest index). Never someone
 * already dying, never the elder while the village is not converted, never the last villager. -1 when
 * nobody can.
 */
export function pickVictim(
  v: Pick<Villagers, 'count' | 'role' | 'dying'>,
  elder: number,
  converted: boolean,
): number {
  let alive = 0;
  for (let i = 0; i < v.count; i++) if (v.dying[i]! <= 0) alive++;
  if (alive <= 1) return -1;
  for (const role of DEATH_ORDER) {
    let best = -1;
    for (let i = 0; i < v.count; i++) {
      if (v.dying[i]! > 0 || v.role[i] !== role) continue;
      if (i === elder && !converted) continue;
      // The elder goes last of all, even among priests.
      if (i === elder && best >= 0) continue;
      if (best < 0 || (best === elder ? true : i > best)) best = i;
    }
    if (best >= 0) return best;
  }
  return -1;
}
