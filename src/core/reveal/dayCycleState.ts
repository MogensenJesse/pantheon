// src/core/reveal/dayCycleState.ts — what a save keeps of the reveal and the day clock, and how to
// check a stored one (pure: no DOM, no three, node-runnable)

import { isCount, isRecord } from '../guards.ts';
import type { RevealPhase } from './revealPhase.ts';

/** What a save keeps of the reveal and the looping day clock. */
export interface DayCycleState {
  reveal: RevealPhase;
  /** Seconds into the one-shot reveal sunrise. */
  introElapsed: number;
  /** Seconds into the looping day (0 until the loop starts). */
  elapsed: number;
}

const REVEAL_PHASES: readonly unknown[] = ['idle', 'sunrise', 'looping'] satisfies RevealPhase[];

/** The stored day-cycle state as a clean copy, or null when it is damaged. */
export function parseDayCycle(raw: unknown): DayCycleState | null {
  if (!isRecord(raw)) return null;
  const { reveal, introElapsed, elapsed } = raw;
  if (!REVEAL_PHASES.includes(reveal) || !isCount(introElapsed) || !isCount(elapsed)) return null;
  return { reveal: reveal as RevealPhase, introElapsed, elapsed };
}
