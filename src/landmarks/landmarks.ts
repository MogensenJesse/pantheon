// src/landmarks/landmarks.ts — the Phase 0 landmarks: waking one by standing at it, and the gate to the sunrise
// (pure and node-runnable; story-mechanics/PHASE_0_LANDMARKS.md has the design)
//
// A map holds each landmark kind at most once, so a kind is the landmark's identity. The state that is
// saved is which kinds are awake, in the order the player woke them, and how far each restoration has come
// (the village phase, story-mechanics/PHASE_2_RESTORATION.md); the dwell count is not saved.

import { isRecord } from '../core/guards.ts';
import { isLandmarkKind, type LandmarkKind } from '../map/MapTypes.ts';

/** Where a landmark stands. */
export type LandmarkPlace = { kind: LandmarkKind; x: number; z: number };

/** A place being restored by the village, or done. The work itself is saved with the village sim. */
export type RestorationStatus = 'inProgress' | 'restored';

/** The saved part: the kinds that are awake, in the order they were woken, and the restorations begun. */
export type LandmarkState = {
  awakened: LandmarkKind[];
  restoration: Partial<Record<LandmarkKind, RestorationStatus>>;
};

export const initialLandmarks = (): LandmarkState => ({ awakened: [], restoration: {} });

/** A copy that shares nothing with `state`. */
export const copyLandmarks = (state: LandmarkState): LandmarkState => ({
  awakened: [...state.awakened],
  restoration: { ...state.restoration },
});

/** Seconds the orb has stood at each dormant landmark it is near (runtime only, not saved). */
export type DwellState = Partial<Record<LandmarkKind, number>>;

export interface LandmarkRules {
  /** The orb must stand within this distance (m) of a landmark... */
  radiusM: number;
  /** ...for this many seconds to wake it. */
  dwellS: number;
}

export const isAwake = (state: LandmarkState, kind: LandmarkKind): boolean =>
  state.awakened.includes(kind);

/** `state` with `kind` awake (a new value; waking an awake landmark changes nothing). */
export function awaken(state: LandmarkState, kind: LandmarkKind): LandmarkState {
  return isAwake(state, kind) ? state : { ...state, awakened: [...state.awakened, kind] };
}

/** 1 for the first landmark woken, 2 for the second and so on; 0 for one that is still dormant. */
export function orderOf(state: LandmarkState, kind: LandmarkKind): number {
  return state.awakened.indexOf(kind) + 1;
}

/**
 * Moves the dwell counts on by `dt` seconds with the orb at (x, z): a dormant landmark within reach counts up,
 * every other count is dropped. Changes `dwell` in place and returns the kind that reached the dwell time this
 * step, if any (the first in `places` order when two do at once).
 */
export function advanceDwell(
  dwell: DwellState,
  places: readonly LandmarkPlace[],
  state: LandmarkState,
  x: number,
  z: number,
  dt: number,
  rules: LandmarkRules,
): LandmarkKind | null {
  let arrived: LandmarkKind | null = null;
  for (const place of places) {
    const near =
      !isAwake(state, place.kind) && Math.hypot(place.x - x, place.z - z) <= rules.radiusM;
    if (!near) {
      delete dwell[place.kind];
      continue;
    }
    const seconds = (dwell[place.kind] ?? 0) + dt;
    dwell[place.kind] = seconds;
    if (seconds >= rules.dwellS && arrived === null) arrived = place.kind;
  }
  return arrived;
}

/** How far a landmark's dwell has come, 0 to 1. */
export const dwellProgress = (
  dwell: DwellState,
  kind: LandmarkKind,
  rules: LandmarkRules,
): number => Math.min(1, (dwell[kind] ?? 0) / Math.max(1e-6, rules.dwellS));

/** The nearest landmark that is still dormant: where the guide line leads once the orbs are gone. */
export function nearestDormant(
  places: readonly LandmarkPlace[],
  state: LandmarkState,
  x: number,
  z: number,
): LandmarkPlace | null {
  let best: LandmarkPlace | null = null;
  let bestD = Number.POSITIVE_INFINITY;
  for (const place of places) {
    if (isAwake(state, place.kind)) continue;
    const d = Math.hypot(place.x - x, place.z - z);
    if (d < bestD) {
      bestD = d;
      best = place;
    }
  }
  return best;
}

/**
 * The landmark the guide line leads to: the one it led to before while that is still dormant (so the line does
 * not jump between two landmarks as the orb moves), else the nearest dormant one.
 */
export function stickyTarget(
  places: readonly LandmarkPlace[],
  state: LandmarkState,
  previous: LandmarkKind | null,
  x: number,
  z: number,
): LandmarkPlace | null {
  const kept = places.find((place) => place.kind === previous && !isAwake(state, place.kind));
  return kept ?? nearestDormant(places, state, x, z);
}

export const restorationOf = (state: LandmarkState, kind: LandmarkKind): RestorationStatus | null =>
  state.restoration[kind] ?? null;

export const isRestored = (state: LandmarkState, kind: LandmarkKind): boolean =>
  state.restoration[kind] === 'restored';

/** A place can be started once: it is awake, the village is converted and nothing has begun there. */
export const canStartRestoration = (
  state: LandmarkState,
  kind: LandmarkKind,
  villageConverted: boolean,
): boolean => villageConverted && isAwake(state, kind) && restorationOf(state, kind) === null;

/** `state` with the restoration of `kind` begun (the same value when it cannot begin). */
export function startRestoration(state: LandmarkState, kind: LandmarkKind): LandmarkState {
  if (!isAwake(state, kind) || restorationOf(state, kind) !== null) return state;
  return { ...state, restoration: { ...state.restoration, [kind]: 'inProgress' } };
}

/** `state` with the restoration of `kind` done (the same value unless it was in progress). */
export function finishRestoration(state: LandmarkState, kind: LandmarkKind): LandmarkState {
  if (restorationOf(state, kind) !== 'inProgress') return state;
  return { ...state, restoration: { ...state.restoration, [kind]: 'restored' } };
}

/** How many of the map's places are restored. */
export const restoredCount = (places: readonly LandmarkPlace[], state: LandmarkState): number =>
  places.filter((place) => isRestored(state, place.kind)).length;

/** Every landmark the map has is restored (true for a map with none). */
export const allRestored = (places: readonly LandmarkPlace[], state: LandmarkState): boolean =>
  places.every((place) => isRestored(state, place.kind));

/** Every landmark the map has is awake (true for a map with none). */
export const allAwake = (places: readonly LandmarkPlace[], state: LandmarkState): boolean =>
  places.every((place) => isAwake(state, place.kind));

/**
 * The gate to the sunrise and phase 1: the energy bar is full **and** every landmark of the map is awake.
 * A map without landmarks needs the bar alone.
 */
export const isPhase0Complete = (
  energy: number,
  energyCap: number,
  places: readonly LandmarkPlace[],
  state: LandmarkState,
): boolean => energy >= energyCap && allAwake(places, state);

export type ParsedLandmarks =
  | { ok: true; landmarks: LandmarkState }
  | { ok: false; message: string };

/** Accepts a stored landmark state, or says it is damaged (nothing is applied from one that fails). */
export function parseLandmarks(raw: unknown): ParsedLandmarks {
  const bad: ParsedLandmarks = { ok: false, message: "The save's landmarks are damaged." };
  if (!isRecord(raw) || !Array.isArray(raw.awakened) || !isRecord(raw.restoration)) return bad;
  const kinds: LandmarkKind[] = [];
  for (const kind of raw.awakened) {
    if (!isLandmarkKind(kind) || kinds.includes(kind)) return bad;
    kinds.push(kind);
  }
  const restoration: LandmarkState['restoration'] = {};
  for (const [kind, status] of Object.entries(raw.restoration)) {
    // Only a place that was woken can be restored.
    if (!isLandmarkKind(kind) || !kinds.includes(kind)) return bad;
    if (status !== 'inProgress' && status !== 'restored') return bad;
    restoration[kind] = status;
  }
  return { ok: true, landmarks: { awakened: kinds, restoration } };
}
