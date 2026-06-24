// src/core/reveal/DayCycle.ts — post-reveal looping midnight→midnight sun cycle
import type { AmbientLight, DirectionalLight } from 'three';
import { applyWorldLightingFromElevation, getActiveCycle } from '../../rendering/sky/lightingCurves';
import {
  applySunPositionFromCyclePhase,
  sunPositionFromCyclePhase,
} from '../../rendering/sky/sunCycle';
import type { SkySystemContext } from '../../rendering/sky/SkySystem';
import { isDayCycleDevScrubLocked } from './dayCycleDevScrub';
import { isSunRevealDone, sunRevealState } from './WorldReveal';

export interface DayCycleContext {
  update: (dt: number) => void;
  dispose: () => void;
}

export { isDayCycleDevScrubLocked, setDayCycleDevScrubLock } from './dayCycleDevScrub';

class DayCycleController implements DayCycleContext {
  private started = false;
  private elapsed = 0;

  constructor(
    private readonly sun: DirectionalLight,
    private readonly ambientLight: AmbientLight,
    private readonly sky: SkySystemContext,
  ) {}

  update(dt: number): void {
    if (!isSunRevealDone()) return;

    const { dayDurationSec, loop, sunrisePhase } = getActiveCycle();

    if (!this.started) {
      this.started = true;
      this.elapsed = sunrisePhase * dayDurationSec;
    }

    if (isDayCycleDevScrubLocked()) return;

    this.elapsed += dt;
    if (loop && this.elapsed >= dayDurationSec) {
      this.elapsed %= dayDurationSec;
    }

    const cyclePhase = loop
      ? (this.elapsed / dayDurationSec) % 1
      : Math.min(this.elapsed / dayDurationSec, 1);

    const pos = sunPositionFromCyclePhase(cyclePhase);
    sunRevealState.elevationDeg = pos.elevationDeg;
    sunRevealState.azimuthDeg = pos.azimuthDeg;
    applyWorldLightingFromElevation(
      sunRevealState.elevationDeg,
      this.sun,
      this.ambientLight,
      this.sky,
    );
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

/** DEV: scrub cycle phase 0..1 without waiting for real time. */
export function scrubDayPhase(phase: number): number {
  const pos = applySunPositionFromCyclePhase(phase);
  return pos.elevationDeg;
}
