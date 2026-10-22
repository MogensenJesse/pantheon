// src/quests/finaleTimeline.ts — the last night's cutscene as a pure timeline: where the view is, which
// beams have risen and which strokes of the rune are lit at a given second (node-runnable)
//
// The view opens on the gathering at the temple, glides to each place of power in turn (a beam shoots into
// the sky there and one stroke of the rune lights), returns to the temple and looks up at the whole rune,
// which glows and holds. The game plays it by asking `at(t)` each frame; skipping jumps to `at(duration)`.

import { PHASE0 } from '../config/phase0.ts';
import type { CinematicView } from '../core/cinematic.ts';
import { lerp, smoothstep01, turnToward } from '../core/math/scalar.ts';
import type { LandmarkPlace } from '../landmarks/landmarks.ts';
import type { LandmarkKind } from '../map/MapTypes.ts';

const C = PHASE0.QUEST.FINALE.CUTSCENE;

export interface FinaleFrame {
  view: CinematicView;
  /** Beam strength 0..1 per place, and how far each stroke of the rune is lit 0..1. */
  beams: Partial<Record<LandmarkKind, number>>;
  strokes: Partial<Record<LandmarkKind, number>>;
  /** The whole rune's glow 0..1, rising once every stroke is lit. */
  glow: number;
}

export interface FinaleTimeline {
  duration: number;
  at: (t: number) => FinaleFrame;
}

const lerpView = (a: CinematicView, b: CinematicView, k: number): CinematicView => ({
  x: lerp(a.x, b.x, k),
  z: lerp(a.z, b.z, k),
  lookM: lerp(a.lookM, b.lookM, k),
  distanceM: lerp(a.distanceM, b.distanceM, k),
  yaw: turnToward(a.yaw, b.yaw, k),
  pitch: lerp(a.pitch, b.pitch, k),
});

/** Builds the timeline for the places this map has (in the order given) and the temple. */
export function buildFinaleTimeline(
  places: readonly LandmarkPlace[],
  temple: { x: number; z: number },
): FinaleTimeline {
  const n = places.length;
  const slotStart = (i: number) => C.INTRO_S + i * C.PLACE_S;
  const placesEnd = slotStart(n);
  const duration = placesEnd + C.RETURN_S + C.HOLD_S;

  const templeView: CinematicView = {
    x: temple.x,
    z: temple.z,
    lookM: C.TEMPLE.LOOK_M,
    distanceM: C.TEMPLE.DISTANCE_M,
    yaw: 0.6,
    pitch: C.TEMPLE.PITCH,
  };
  // Each place is seen from the side facing away from the temple, so the village lies beyond it.
  const placeView = (p: LandmarkPlace, i: number): CinematicView => ({
    x: p.x,
    z: p.z,
    lookM: C.PLACE.LOOK_M,
    distanceM: C.PLACE.DISTANCE_M,
    yaw: Math.atan2(p.x - temple.x, p.z - temple.z) + (i % 2 === 0 ? 0.5 : -0.5),
    pitch: C.PLACE.PITCH,
  });
  const skyView: CinematicView = {
    x: temple.x,
    z: temple.z,
    lookM: C.RUNE_HEIGHT_M,
    distanceM: C.SKY.DISTANCE_M,
    yaw: 0.6,
    pitch: C.SKY.PITCH,
  };
  const views = places.map(placeView);

  /** The opening look, as it is when the first glide leaves it. */
  const introEnd: CinematicView = {
    ...templeView,
    yaw: templeView.yaw + C.INTRO_S * C.INTRO_DRIFT,
  };
  /** A place's view as it is when the next glide leaves it (it drifts round the place all through its slot). */
  const leaving = (i: number): CinematicView => {
    const v = views[i] as CinematicView;
    return { ...v, yaw: v.yaw + C.PLACE_S * C.PLACE_DRIFT };
  };

  const viewAt = (t: number): CinematicView => {
    if (t < C.INTRO_S) return { ...templeView, yaw: templeView.yaw + t * C.INTRO_DRIFT };
    if (t < placesEnd) {
      const i = Math.min(n - 1, Math.floor((t - C.INTRO_S) / C.PLACE_S));
      const into = t - slotStart(i);
      const to = views[i] as CinematicView;
      return lerpView(
        i === 0 ? introEnd : leaving(i - 1),
        { ...to, yaw: to.yaw + into * C.PLACE_DRIFT },
        smoothstep01(into / C.GLIDE_S),
      );
    }
    return lerpView(
      n > 0 ? leaving(n - 1) : introEnd,
      skyView,
      smoothstep01((t - placesEnd) / C.RETURN_S),
    );
  };

  // The strokes light in the return shot, in the order of the places, then the whole rune glows.
  const strokeStart = (i: number) => placesEnd + C.RETURN_S * C.STROKES_AT + i * C.STROKE_STAGGER_S;
  const lastStrokeDone = strokeStart(Math.max(0, n - 1)) + C.STROKE_FADE_S;

  const at = (t0: number): FinaleFrame => {
    const t = Math.max(0, Math.min(duration, t0));
    const beams: Partial<Record<LandmarkKind, number>> = {};
    const strokes: Partial<Record<LandmarkKind, number>> = {};
    places.forEach((p, i) => {
      beams[p.kind] = smoothstep01((t - slotStart(i) - C.BEAM_AT_S) / C.BEAM_RISE_S);
      strokes[p.kind] = smoothstep01((t - strokeStart(i)) / C.STROKE_FADE_S);
    });
    const glow =
      C.GLOW_BASE * smoothstep01((t - strokeStart(0)) / C.STROKE_FADE_S) +
      (1 - C.GLOW_BASE) *
        smoothstep01((t - lastStrokeDone) / Math.max(0.1, duration - lastStrokeDone));
    return { view: viewAt(t), beams, strokes, glow };
  };
  return { duration, at };
}
