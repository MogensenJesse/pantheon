// src/world/village/sim/prayers.ts — believers voice a need; it is answered, or the villager loses their belief
// (pure: no DOM, no three, node-runnable)
//
// Three needs are read from the village as it is: food (the larder ran out at the last meal), rain (the
// fields have gone without it for days) and shelter (a villager has no bed). A need that has held for a while
// opens a prayer from a believer, at most `MAX_OPEN` at once. A prayer is answered when its need is met,
// by a power, a building or the weather, whoever did it; the villager's belief is restored and the village
// is paid a lump of faith. A prayer left unanswered for `PATIENCE_DAYS` lapses: that villager's belief
// drops below 1, so they stop believing (no faith income) until a calm spell passes (`RECOVER_DAYS` with
// no open prayer) or the villager is heartened. Nothing here draws a random number.

import { VILLAGE } from '../../../config/village.ts';
import { isCount, isInt, isRecord } from '../../../core/guards.ts';
import { Role } from '../model/types.ts';
import { believes } from './belief.ts';
import { followMove } from './villagerPool.ts';

const P = VILLAGE.PRAYERS;
const DAY_S = VILLAGE.ECONOMY.DAY_S;

export const PRAYER_KINDS = ['food', 'rain', 'shelter'] as const;
export type PrayerKind = (typeof PRAYER_KINDS)[number];

export interface Prayer {
  /** Villager index (it follows moves; see `removeVillager`). */
  villager: number;
  kind: PrayerKind;
  /** Seconds the prayer has been open. */
  age: number;
}

export interface PrayersState {
  open: Prayer[];
  /** Seconds each need has held without a break, by `PRAYER_KINDS` order. */
  held: number[];
  /** Villagers whose belief lapsed and has not come back. */
  lapsed: number[];
  /** Seconds with no open prayer (counts towards `RECOVER_DAYS` while someone is lapsed). */
  calmS: number;
  /** Prayers answered over the village's life. */
  answered: number;
}

export const createPrayersState = (): PrayersState => ({
  open: [],
  held: PRAYER_KINDS.map(() => 0),
  lapsed: [],
  calmS: 0,
  answered: 0,
});

/** What the prayers look at; the sim fills it in. `belief` is changed here (answers and lapses). */
export interface PrayerWorld {
  count: number;
  belief: Float32Array;
  dying: Float32Array;
  role: Uint8Array;
  /** Building id of each villager's bed, 0 for none. */
  home: Int32Array;
  /** The larder ran out at the last meal. */
  foodShort: boolean;
  /** There are fields to water. */
  hasFields: boolean;
  /** Rain here and now, 0..1. */
  rain01: number;
}

export type PrayerOutcome =
  | { kind: 'opened'; prayer: Prayer }
  | { kind: 'answered'; prayer: Prayer }
  | { kind: 'lapsed'; prayer: Prayer };

export const prayerNeedS = (kind: PrayerKind): number => P.NEED_DAYS[kind] * DAY_S;
export const prayerPatienceS = (): number => P.PATIENCE_DAYS * DAY_S;

/** Seconds a prayer has left before it lapses. */
export const prayerLeftS = (prayer: Pick<Prayer, 'age'>): number =>
  Math.max(0, prayerPatienceS() - prayer.age);

/** Whether the need of `kind` holds right now (shelter holds per villager, see `needMet`). */
function needNow(kind: PrayerKind, w: PrayerWorld): boolean {
  if (kind === 'food') return w.foodShort;
  if (kind === 'rain') return w.hasFields && w.rain01 <= P.DRY_BELOW;
  for (let i = 0; i < w.count; i++) if (w.home[i] === 0 && w.dying[i]! <= 0) return true;
  return false;
}

/** Whether the need behind a prayer is met. */
function needMet(prayer: Prayer, w: PrayerWorld): boolean {
  if (prayer.kind === 'food') return !w.foodShort;
  if (prayer.kind === 'rain') return w.rain01 >= P.RAIN_ANSWERS || !w.hasFields;
  return w.home[prayer.villager] !== 0;
}

/** The believer who prays for `kind`: lowest index among those it touches. -1 when nobody can. */
function whoPrays(kind: PrayerKind, w: PrayerWorld, praying: ReadonlySet<number>): number {
  let any = -1;
  for (let i = 0; i < w.count; i++) {
    if (!believes(w.belief, w.dying, i) || praying.has(i)) continue;
    if (kind === 'shelter') {
      if (w.home[i] === 0) return i;
    } else if (kind === 'rain' && w.role[i] === Role.Farmer) {
      return i;
    } else if (any < 0) {
      any = i;
    }
  }
  return kind === 'shelter' ? -1 : any;
}

/**
 * Raises a lapsed villager's belief back to 1; true when they were lapsed. Anyone else is raised too unless
 * `onlyLapsed` (a villager who never believed is not converted by a restore).
 */
export function restoreBelief(
  state: PrayersState,
  w: Pick<PrayerWorld, 'belief'>,
  i: number,
  onlyLapsed = false,
): boolean {
  const at = state.lapsed.indexOf(i);
  if (at < 0) {
    if (!onlyLapsed) w.belief[i] = 1;
    return false;
  }
  w.belief[i] = 1;
  state.lapsed.splice(at, 1);
  return true;
}

/**
 * Advance by `dt`. Returns what happened: prayers opened, answered (belief set to 1, `answered` counted) and
 * lapsed (belief dropped to `LAPSED_BELIEF`). The caller pays the faith for an answer and reports the rest.
 */
export function stepPrayers(
  state: PrayersState,
  dt: number,
  w: PrayerWorld,
  /** False until the village is converted: nobody prays before then. */
  active: boolean,
): PrayerOutcome[] {
  const out: PrayerOutcome[] = [];
  if (!active) return out;

  for (let k = 0; k < PRAYER_KINDS.length; k++) {
    state.held[k] = needNow(PRAYER_KINDS[k]!, w) ? state.held[k]! + dt : 0;
  }

  for (let n = state.open.length - 1; n >= 0; n--) {
    const prayer = state.open[n]!;
    if (prayer.villager >= w.count || w.dying[prayer.villager]! > 0) {
      state.open.splice(n, 1); // the villager is gone or dying: nothing to answer
      continue;
    }
    prayer.age += dt;
    if (needMet(prayer, w)) {
      state.open.splice(n, 1);
      restoreBelief(state, w, prayer.villager);
      state.answered++;
      out.push({ kind: 'answered', prayer });
    } else if (prayer.age >= prayerPatienceS()) {
      state.open.splice(n, 1);
      w.belief[prayer.villager] = P.LAPSED_BELIEF;
      if (!state.lapsed.includes(prayer.villager)) state.lapsed.push(prayer.villager);
      out.push({ kind: 'lapsed', prayer });
    }
  }

  if (state.open.length < P.MAX_OPEN) {
    const praying = new Set(state.open.map((p) => p.villager));
    for (let k = 0; k < PRAYER_KINDS.length && state.open.length < P.MAX_OPEN; k++) {
      const kind = PRAYER_KINDS[k]!;
      if (state.held[k]! < prayerNeedS(kind) || state.open.some((p) => p.kind === kind)) continue;
      const villager = whoPrays(kind, w, praying);
      if (villager < 0) continue;
      const prayer: Prayer = { villager, kind, age: 0 };
      state.open.push(prayer);
      praying.add(villager);
      out.push({ kind: 'opened', prayer });
    }
  }

  // A calm spell brings the lapsed back.
  if (state.open.length === 0 && state.lapsed.length > 0) {
    state.calmS += dt;
    if (state.calmS >= P.RECOVER_DAYS * DAY_S) {
      for (const i of state.lapsed) if (i < w.count) w.belief[i] = 1;
      state.lapsed.length = 0;
      state.calmS = 0;
    }
  } else {
    state.calmS = 0;
  }
  return out;
}

/** A villager was removed: `moved` (the last villager) took their index. Prayers and lapses follow. */
export function removeVillager(state: PrayersState, villager: number, moved: number): void {
  state.open = state.open.filter((p) => p.villager !== villager);
  for (const p of state.open) p.villager = followMove(p.villager, villager, moved);
  state.lapsed = state.lapsed
    .filter((i) => i !== villager)
    .map((i) => followMove(i, villager, moved));
}

/** The open prayer of a villager, or undefined. */
export const prayerOf = (state: PrayersState, villager: number): Prayer | undefined =>
  state.open.find((p) => p.villager === villager);

/** Why a saved prayers state cannot be used, or null. */
export function prayersProblem(state: unknown, count: number): string | null {
  const bad = 'saved village: the prayers are missing or damaged';
  if (!isRecord(state)) return bad;
  const { open, held, lapsed, calmS, answered } = state;
  if (!Array.isArray(open) || open.length > P.MAX_OPEN) return bad;
  const seen = new Set<number>();
  for (const p of open) {
    if (!isRecord(p) || !isInt(p.villager) || p.villager < 0 || p.villager >= count) return bad;
    if (!PRAYER_KINDS.includes(p.kind as PrayerKind) || !isCount(p.age) || seen.has(p.villager)) {
      return bad;
    }
    seen.add(p.villager);
  }
  if (!Array.isArray(held) || held.length !== PRAYER_KINDS.length || !held.every(isCount))
    return bad;
  if (!Array.isArray(lapsed) || !lapsed.every((i) => isInt(i) && i >= 0 && i < count)) return bad;
  return isCount(calmS) && isInt(answered) && answered >= 0 ? null : bad;
}

export const serializePrayers = (state: PrayersState): PrayersState => ({
  open: state.open.map((p) => ({ ...p })),
  held: [...state.held],
  lapsed: [...state.lapsed],
  calmS: state.calmS,
  answered: state.answered,
});

export function restorePrayers(state: PrayersState, saved: PrayersState): void {
  state.open = saved.open.map((p) => ({ ...p }));
  state.held = [...saved.held];
  state.lapsed = [...saved.lapsed];
  state.calmS = saved.calmS;
  state.answered = saved.answered;
}
