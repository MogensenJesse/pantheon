// src/core/reveal/DayCycle.ts — post-reveal sun arc (dawn → peak → sunset)
import type { AmbientLight, DirectionalLight } from 'three';
import type { SkySystemContext } from '../../rendering/sky/SkySystem';
import {
  applyWorldLightingFromElevation,
  elevationFromDayPhase,
  getActiveCycle,
} from '../../rendering/sky/lightingCurves';
import { isDayCycleDevScrubLocked } from './dayCycleDevScrub';
import { isSunRevealDone, sunRevealState } from './WorldReveal';

export interface DayCycleContext {
  update: (dt: number) => void;
  dispose: () => void;
}

export { setDayCycleDevScrubLock, isDayCycleDevScrubLocked } from './dayCycleDevScrub';

export function initDayCycle(
  sun: DirectionalLight,
  ambientLight: AmbientLight,
  sky: SkySystemContext,
): DayCycleContext {
  let phase: 'idle' | 'running' | 'done' = 'idle';
  let elapsed = 0;

  const update = (dt: number) => {
    if (!isSunRevealDone()) return;

    if (phase === 'idle') {
      phase = 'running';
      elapsed = 0;
    }

    if (phase !== 'running') return;
    if (isDayCycleDevScrubLocked()) return;

    const { dayDurationSec, loop } = getActiveCycle();
    elapsed += dt;
    const dayPhase = Math.min(elapsed / dayDurationSec, 1);

    sunRevealState.elevationDeg = elevationFromDayPhase(dayPhase);
    applyWorldLightingFromElevation(sunRevealState.elevationDeg, sun, ambientLight, sky);

    if (dayPhase >= 1) {
      if (loop) {
        elapsed = 0;
      } else {
        phase = 'done';
      }
    }
  };

  return {
    update,
    dispose: () => {},
  };
}

/** DEV: scrub day phase 0..1 without waiting for real time. */
export function scrubDayPhase(phase: number): number {
  const elev = elevationFromDayPhase(phase);
  sunRevealState.elevationDeg = elev;
  return elev;
}
