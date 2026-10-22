// src/quests/finaleTimeline.ts — the last night's cutscene as a pure timeline: where the view is, which
// beams have risen and which strokes of the rune are lit at a given second (node-runnable)
//
// The view opens on the gathering at the temple, glides to each place of power in turn (a beam shoots into
// the sky there and one stroke of the rune lights), returns to the temple and looks up at the whole rune,
// which glows and holds. The game plays it by asking `at(t)` each frame; skipping jumps to `at(duration)`.

import { PHASE0 } from '../config/phase0.ts';
import type { LandmarkKind } from '../map/MapTypes.ts';

const C = PHASE0.QUEST.FINALE.CUTSCENE;

export interface FinalePlace {
  kind: LandmarkKind;
  x: number;
  z: number;
}

/** Where the view looks (ground position plus a height above it) and from where (an orbit around it). */
export interface FinaleView {
  x: number;
  z: number;
  /** Height above the ground at (x, z) the view looks at (m). */
  lookM: number;
  distanceM: number;
  yaw: number;
  pitch: number;
}

export interface FinaleFrame {
  view: FinaleView;
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

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const smooth = (v: number) => {
  const x = clamp01(v);
  return x * x * (3 - 2 * x);
};
/** Angles the short way round. */
const lerpAngle = (a: number, b: number, k: number) => {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * k;
};
const lerpView = (a: FinaleView, b: FinaleView, k: number): FinaleView => ({
  x: a.x + (b.x - a.x) * k,
  z: a.z + (b.z - a.z) * k,
  lookM: a.lookM + (b.lookM - a.lookM) * k,
  distanceM: a.distanceM + (b.distanceM - a.distanceM) * k,
  yaw: lerpAngle(a.yaw, b.yaw, k),
  pitch: a.pitch + (b.pitch - a.pitch) * k,
});

/** Builds the timeline for the places this map has (in the order given) and the temple. */
export function buildFinaleTimeline(
  places: readonly FinalePlace[],
  temple: { x: number; z: number },
): FinaleTimeline {
  const n = places.length;
  const slotStart = (i: number) => C.INTRO_S + i * C.PLACE_S;
  const placesEnd = slotStart(n);
  const duration = placesEnd + C.RETURN_S + C.HOLD_S;

  const templeView: FinaleView = {
    x: temple.x,
    z: temple.z,
    lookM: C.TEMPLE.LOOK_M,
    distanceM: C.TEMPLE.DISTANCE_M,
    yaw: 0.6,
    pitch: C.TEMPLE.PITCH,
  };
  // Each place is seen from the side facing away from the temple, so the village lies beyond it.
  const placeView = (p: FinalePlace, i: number): FinaleView => ({
    x: p.x,
    z: p.z,
    lookM: C.PLACE.LOOK_M,
    distanceM: C.PLACE.DISTANCE_M,
    yaw: Math.atan2(p.x - temple.x, p.z - temple.z) + (i % 2 === 0 ? 0.5 : -0.5),
    pitch: C.PLACE.PITCH,
  });
  const skyView: FinaleView = {
    x: temple.x,
    z: temple.z,
    lookM: C.RUNE_HEIGHT_M,
    distanceM: C.SKY.DISTANCE_M,
    yaw: 0.6,
    pitch: C.SKY.PITCH,
  };
  const views = places.map(placeView);

  /** The opening look, as it is when the first glide leaves it. */
  const introEnd: FinaleView = { ...templeView, yaw: templeView.yaw + C.INTRO_S * C.INTRO_DRIFT };
  /** A place's view as it is when the next glide leaves it (it drifts round the place all through its slot). */
  const leaving = (i: number): FinaleView => {
    const v = views[i] as FinaleView;
    return { ...v, yaw: v.yaw + C.PLACE_S * C.PLACE_DRIFT };
  };

  const viewAt = (t: number): FinaleView => {
    if (t < C.INTRO_S) return { ...templeView, yaw: templeView.yaw + t * C.INTRO_DRIFT };
    if (t < placesEnd) {
      const i = Math.min(n - 1, Math.floor((t - C.INTRO_S) / C.PLACE_S));
      const into = t - slotStart(i);
      const to = views[i] as FinaleView;
      return lerpView(
        i === 0 ? introEnd : leaving(i - 1),
        { ...to, yaw: to.yaw + into * C.PLACE_DRIFT },
        smooth(into / C.GLIDE_S),
      );
    }
    return lerpView(
      n > 0 ? leaving(n - 1) : introEnd,
      skyView,
      smooth((t - placesEnd) / C.RETURN_S),
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
      beams[p.kind] = smooth((t - slotStart(i) - C.BEAM_AT_S) / C.BEAM_RISE_S);
      strokes[p.kind] = smooth((t - strokeStart(i)) / C.STROKE_FADE_S);
    });
    const glow =
      C.GLOW_BASE * smooth((t - strokeStart(0)) / C.STROKE_FADE_S) +
      (1 - C.GLOW_BASE) * smooth((t - lastStrokeDone) / Math.max(0.1, duration - lastStrokeDone));
    return { view: viewAt(t), beams, strokes, glow };
  };
  return { duration, at };
}
