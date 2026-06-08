// src/core/reveal/DayCycle.ts — post-reveal sun arc (dawn → peak → sunset)
import type { AmbientLight, DirectionalLight } from 'three';
import {
  applyWorldLightingFromElevation,
  elevationFromDayPhase,
  getActiveCycle,
} from '../../rendering/sky/lightingCurves';
import type { SkySystemContext } from '../../rendering/sky/SkySystem';
import { isDayCycleDevScrubLocked } from './dayCycleDevScrub';
import { isSunRevealDone, sunRevealState } from './WorldReveal';

export interface DayCycleContext {
  update: (dt: number) => void;
  dispose: () => void;
}

export { isDayCycleDevScrubLocked, setDayCycleDevScrubLock } from './dayCycleDevScrub';

class DayCycleController implements DayCycleContext {
  private phase: 'idle' | 'running' | 'done' = 'idle';
  private elapsed = 0;

  constructor(
    private readonly sun: DirectionalLight,
    private readonly ambientLight: AmbientLight,
    private readonly sky: SkySystemContext,
  ) {}

  update(dt: number): void {
    if (!isSunRevealDone()) return;

    if (this.phase === 'idle') {
      this.phase = 'running';
      this.elapsed = 0;
    }

    if (this.phase !== 'running') return;
    if (isDayCycleDevScrubLocked()) return;

    const { dayDurationSec, loop } = getActiveCycle();
    this.elapsed += dt;
    const dayPhase = Math.min(this.elapsed / dayDurationSec, 1);

    sunRevealState.elevationDeg = elevationFromDayPhase(dayPhase);
    applyWorldLightingFromElevation(
      sunRevealState.elevationDeg,
      this.sun,
      this.ambientLight,
      this.sky,
    );

    if (dayPhase >= 1) {
      if (loop) {
        this.elapsed = 0;
      } else {
        this.phase = 'done';
      }
    }
  }

  dispose(): void {}
}

export function initDayCycle(
  sun: DirectionalLight,
  ambientLight: AmbientLight,
  sky: SkySystemContext,
): DayCycleContext {
  return new DayCycleController(sun, ambientLight, sky);
}

/** DEV: scrub day phase 0..1 without waiting for real time. */
export function scrubDayPhase(phase: number): number {
  const elev = elevationFromDayPhase(phase);
  sunRevealState.elevationDeg = elev;
  return elev;
}
