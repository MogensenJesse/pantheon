// src/core/reveal/phase0Progress.ts — how far phase 0 has come, 0 to 1 (pure and node-runnable)
//
// The night lifts as the bar fills (orbs and landmarks both give energy) and stays lifted once the sun has
// risen, so a later power that spends energy does not darken the world again.

/** 0 with an empty bar, 1 at the cap and from phase 1 on. */
export function phase0Progress(energy: number, energyCap: number, phase: number): number {
  if (phase >= 1) return 1;
  return Math.min(1, Math.max(0, energy / Math.max(1, energyCap)));
}
