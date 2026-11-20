// src/world/snow/cpu/snowFieldMath.ts — the tracks field's upkeep as plain maths: where the window sits, what decays when
//
// The field is a toroidal texture: texel t holds the world point nearest the window centre c among t + k * windowM.
// Moving c leaves a strip of texels whose world point changed (they entered the window on the far side): those must be
// zeroed, or old prints reappear as ghosts. Decay is banked: a half-float cannot hold a per-frame fade of 1 / tau, so
// frame time is added up and applied in one multiplicative pass about once a second, with the factor computed here in f64.
// Pure: no imports.

/** Where the window centre goes for the orb at `p`: it stays put within `hysteresisM`, else snaps to the `snapM` lattice. */
export function recentreAxis(
  centre: number,
  p: number,
  snapM: number,
  hysteresisM: number,
): number {
  if (Number.isNaN(centre) || Math.abs(p - centre) > hysteresisM)
    return Math.round(p / snapM) * snapM;
  return centre;
}

/** The world point texel `t` (a world coordinate mod `windowM`) stands for when the window is centred on `c`; the GPU pass does the same. */
export function windowWorld(t: number, c: number, windowM: number): number {
  const x = (t - c) / windowM + 0.5;
  return c + (x - Math.floor(x)) * windowM - windowM / 2;
}

/** Whether texel `t` holds a different world point once the window moves from `from` to `to` (so it must be cleared). */
export function texelEnters(t: number, from: number, to: number, windowM: number): boolean {
  return Math.abs(windowWorld(t, from, windowM) - windowWorld(t, to, windowM)) > 0.01;
}

/** Share kept after `seconds` with time constant `tauS` (a `tauS` of 0 or less = gone as soon as any time passes). */
export function decayFactor(seconds: number, tauS: number): number {
  if (seconds <= 0) return 1;
  return tauS > 0 ? Math.exp(-seconds / tauS) : 0;
}

/** Banks `dt`; returns the time to apply now (the whole bank once it reaches `passS`, else 0) and the bank left. */
export function bankDecayTime(
  bank: number,
  dt: number,
  passS: number,
): { bank: number; apply: number } {
  const total = bank + Math.max(0, dt);
  return total >= passS ? { bank: 0, apply: total } : { bank: total, apply: 0 };
}
