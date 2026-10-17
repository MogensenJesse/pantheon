// src/core/reveal/revealPhase.ts — shared reveal state machine (leaf module)

export type RevealPhase = 'idle' | 'sunrise' | 'looping';

let phase: RevealPhase = 'idle';

export function resetRevealPhase(): void {
  phase = 'idle';
}

export function getRevealPhase(): RevealPhase {
  return phase;
}

/** Put the state machine back where a save left it (no side effects: the day cycle does the rest). */
export function restoreRevealPhase(saved: RevealPhase): void {
  phase = saved;
}

/** Player reached 100% energy — reveal sunrise may run. */
export function isEnergyCapReached(): boolean {
  return phase !== 'idle';
}

/** Post-cap reveal sunrise finished — looping day cycle is authoritative. */
export function isSunRevealDone(): boolean {
  return phase === 'looping';
}

/** True during the one-shot reveal sunrise (before intro hands off to the day loop). */
export function isRevealSunriseInProgress(): boolean {
  return phase === 'sunrise';
}

export function markEnergyCapReached(): void {
  if (phase === 'idle') phase = 'sunrise';
}

export function setRevealSunriseInProgress(active: boolean): void {
  if (active && phase !== 'idle') phase = 'sunrise';
}

export function markSunRevealIntroComplete(): void {
  if (phase !== 'idle') phase = 'looping';
}
