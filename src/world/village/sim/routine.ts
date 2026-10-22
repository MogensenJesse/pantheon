// src/world/village/sim/routine.ts — what a villager wants to be doing at a given time of day
import { VILLAGE } from '../../../config/village.ts';
import { Activity, type ActivityId, Role } from '../model/types.ts';
import { wrap01 } from './geometry.ts';

export interface RoutineSubject {
  role: number;
  piety: number;
  nightOwl: number;
  offset: number;
  /** `Done` bits set in the current window. */
  done: number;
}

/** What is going on in the village that changes the day. */
export interface RoutineWorld {
  /** Rain: everyone but the priests is at home. */
  shelter: boolean;
  /** There are graves to mourn at. */
  mourning: boolean;
  /** The whole village gathers to pray at dusk, rain or not (the story's last night). */
  gathering?: boolean;
}

/** Things a villager has done in the window they belong to; cleared again once the window is over (`clearedDone`). */
export const Done = { MiddayMeal: 1, EveningMeal: 2, Mourned: 4 } as const;

const { SCHEDULE } = VILLAGE.VILLAGERS;

const inWindow = (p: number, window: readonly [number, number]) => p >= window[0] && p < window[1];

/** The meal (a `Done` bit) the day phase `p` (with the villager's own offset) is the time of, or 0. */
export function mealAt(p: number): number {
  if (inWindow(p, SCHEDULE.MIDDAY_MEAL)) return Done.MiddayMeal;
  if (inWindow(p, SCHEDULE.EVENING_MEAL)) return Done.EveningMeal;
  return 0;
}

/** The meal round (1 midday, 2 evening) a meal at phase `p` belongs to, also when the window has just ended. */
export const mealRoundAt = (p: number): number =>
  mealAt(p) ||
  (p < (SCHEDULE.MIDDAY_MEAL[1] + SCHEDULE.EVENING_MEAL[0]) / 2
    ? Done.MiddayMeal
    : Done.EveningMeal);

/** The bits that still hold at phase `p`: each is forgotten once its window is over, ready for the next day. */
export function clearedDone(done: number, p: number): number {
  let out = done;
  if (!inWindow(p, SCHEDULE.MIDDAY_MEAL)) out &= ~Done.MiddayMeal;
  if (!inWindow(p, SCHEDULE.EVENING_MEAL)) out &= ~Done.EveningMeal;
  if (!inWindow(p, [SCHEDULE.WORK_END, SCHEDULE.DUSK_END])) out &= ~Done.Mourned;
  return out;
}

/** A villager's own clock: the day phase shifted by their personal offset. */
export const ownPhase = (dayPhase: number, offset: number): number => wrap01(dayPhase + offset);

/**
 * Dawn prayer, a working day with a meal at midday, dusk prayer (or mourning, for the priests) with an evening
 * meal, then bed. `dayPhase` is the day-cycle phase (0 midnight, 0.25 sunrise). Rain sends everyone but the
 * priests home. In vigil mode (Phase 0, the sun never rises) some people work or pray through the night by
 * lantern instead of sleeping.
 */
export function scheduledActivity(
  who: RoutineSubject,
  dayPhase: number,
  vigil: boolean,
  world: RoutineWorld = { shelter: false, mourning: false },
): ActivityId {
  const { DAWN_PRAY_SHARE, DUSK_PRAY_SHARE } = VILLAGE.VILLAGERS;
  const p = ownPhase(dayPhase, who.offset);
  const priest = who.role === Role.Priest;
  const idler = who.role === Role.Idler;

  const day = p >= SCHEDULE.WAKE && p < SCHEDULE.DUSK_END;
  if (day) {
    const meal = mealAt(p);
    if (meal !== 0 && (who.done & meal) === 0) return Activity.Eat;
    if (world.gathering && p >= SCHEDULE.WORK_END) return Activity.Pray;
    if (world.shelter && !priest) return Activity.Shelter;
  }

  if (p >= SCHEDULE.WAKE && p < SCHEDULE.WORK_START) {
    return priest || who.piety < DAWN_PRAY_SHARE ? Activity.Pray : Activity.Wander;
  }
  if (p >= SCHEDULE.WORK_START && p < SCHEDULE.WORK_END) {
    if (priest) return Activity.Pray;
    return idler ? Activity.Wander : Activity.Work;
  }
  if (p >= SCHEDULE.WORK_END && p < SCHEDULE.DUSK_END) {
    if (priest) {
      if (!world.mourning) return Activity.Pray;
      return (who.done & Done.Mourned) === 0 ? Activity.Mourn : Activity.Shelter;
    }
    if (who.piety < DUSK_PRAY_SHARE) return Activity.Pray;
    return idler ? Activity.Shelter : Activity.Wander;
  }
  if (vigil) {
    if (who.nightOwl === 1 && who.role === Role.Builder) return Activity.Work;
    if (who.nightOwl === 2 || priest) return Activity.Pray;
  }
  return Activity.Sleep;
}
