// src/world/village/sim/routine.ts — what a villager wants to be doing at a given time of day
import { VILLAGE } from '../../../config/village.ts';
import { wrap01 } from './geometry.ts';
import { Activity, type ActivityId, Role } from './villageTypes.ts';

export interface RoutineSubject {
  role: number;
  piety: number;
  nightOwl: number;
  offset: number;
}

/**
 * Dawn prayer, a working day, dusk prayer, then bed. `dayPhase` is the day-cycle phase (0 midnight,
 * 0.25 sunrise). In vigil mode (Phase 0, the sun never rises) some people work or pray through the
 * night by lantern instead of sleeping.
 */
export function scheduledActivity(
  who: RoutineSubject,
  dayPhase: number,
  vigil: boolean,
): ActivityId {
  const { SCHEDULE, DAWN_PRAY_SHARE, DUSK_PRAY_SHARE } = VILLAGE.VILLAGERS;
  const p = wrap01(dayPhase + who.offset);
  const priest = who.role === Role.Priest;

  if (p >= SCHEDULE.WAKE && p < SCHEDULE.WORK_START) {
    return priest || who.piety < DAWN_PRAY_SHARE ? Activity.Pray : Activity.Wander;
  }
  if (p >= SCHEDULE.WORK_START && p < SCHEDULE.WORK_END) {
    if (priest) return Activity.Pray;
    return who.role === Role.Builder || who.role === Role.Farmer ? Activity.Work : Activity.Wander;
  }
  if (p >= SCHEDULE.WORK_END && p < SCHEDULE.DUSK_END) {
    return priest || who.piety < DUSK_PRAY_SHARE ? Activity.Pray : Activity.Wander;
  }
  if (vigil) {
    if (who.nightOwl === 1 && who.role === Role.Builder) return Activity.Work;
    if (who.nightOwl === 2 || priest) return Activity.Pray;
  }
  return Activity.Sleep;
}
