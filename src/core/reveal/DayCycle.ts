// src/core/reveal/DayCycle.ts — post-reveal looping midnight→midnight sun cycle
import type { AmbientLight, DirectionalLight } from 'three';
import { MathUtils } from 'three';
import { VISUAL } from '../../config/visualTuning';
import {
  applyWorldLightingFromElevation,
  dayPhaseFromElevation,
  getActiveCycle,
  lerpLightingSample,
  sampleLighting,
  setRevealSunriseLightingSample,
} from '../../rendering/sky/lightingCurves';
import {
  applySunPositionFromCyclePhase,
  sunPositionFromCyclePhase,
} from '../../rendering/sky/sunCycle';
import type { SkySystemContext } from '../../rendering/sky/SkySystem';
import { isDayCycleDevScrubLocked } from './dayCycleDevScrub';
import {
  isEnergyCapReached,
  markSunRevealIntroComplete,
  setRevealSunriseInProgress,
  sunRevealState,
} from './WorldReveal';

export interface DayCycleContext {
  update: (dt: number) => void;
  dispose: () => void;
}

export { isDayCycleDevScrubLocked, setDayCycleDevScrubLock } from './dayCycleDevScrub';

function cyclePhaseForElevation(elevationDeg: number): number {
  const cycle = getActiveCycle();
  const dayT = dayPhaseFromElevation(elevationDeg);
  const daySpan = 1 - cycle.sunrisePhase * 2;
  return cycle.sunrisePhase + dayT * daySpan;
}

class DayCycleController implements DayCycleContext {
  private loopStarted = false;
  private introDone = false;
  private introElapsed = 0;
  private elapsed = 0;

  constructor(
    private readonly sun: DirectionalLight,
    private readonly ambientLight: AmbientLight,
    private readonly sky: SkySystemContext,
  ) {}

  private skipRevealSunriseIntro(): void {
    if (this.introDone) return;

    const { dayDurationSec } = getActiveCycle();
    setRevealSunriseInProgress(false);
    setRevealSunriseLightingSample(null);
    this.introDone = true;
    markSunRevealIntroComplete();
    this.elapsed = cyclePhaseForElevation(sunRevealState.elevationDeg) * dayDurationSec;
    this.loopStarted = true;
  }

  private updateRevealSunrise(dt: number): boolean {
    const { revealSunrise } = VISUAL.sky.cycle;
    if (revealSunrise.durationSec <= 0) {
      setRevealSunriseInProgress(false);
      this.introDone = true;
      markSunRevealIntroComplete();
      return false;
    }

    setRevealSunriseInProgress(true);

    if (!isDayCycleDevScrubLocked()) {
      this.introElapsed += dt;
    }

    const progress = MathUtils.clamp(this.introElapsed / revealSunrise.durationSec, 0, 1);

    const { sunrisePhase, sunriseElevationDeg, dayDurationSec } = getActiveCycle();
    const handoffPhase = cyclePhaseForElevation(revealSunrise.targetElevationDeg);
    const dawnPos = sunPositionFromCyclePhase(sunrisePhase);
    const handoffPos = sunPositionFromCyclePhase(handoffPhase);

    const elevation = MathUtils.lerp(
      sunriseElevationDeg,
      revealSunrise.targetElevationDeg,
      progress,
    );
    const azimuth = MathUtils.lerp(dawnPos.azimuthDeg, handoffPos.azimuthDeg, progress);

    const dawnSample = sampleLighting(sunriseElevationDeg);
    const targetSample = sampleLighting(revealSunrise.targetElevationDeg);
    setRevealSunriseLightingSample(lerpLightingSample(dawnSample, targetSample, progress));

    sunRevealState.elevationDeg = elevation;
    sunRevealState.azimuthDeg = azimuth;
    applyWorldLightingFromElevation(elevation, this.sun, this.ambientLight, this.sky);

    if (progress < 1) return true;

    setRevealSunriseInProgress(false);
    setRevealSunriseLightingSample(null);
    this.introDone = true;
    markSunRevealIntroComplete();
    this.elapsed = handoffPhase * dayDurationSec;
    this.loopStarted = true;
    return true;
  }

  private updateLoopingCycle(dt: number): void {
    const { dayDurationSec, loop, sunrisePhase } = getActiveCycle();

    if (!this.loopStarted) {
      this.loopStarted = true;
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

  update(dt: number): void {
    if (!isEnergyCapReached()) return;

    if (!this.introDone) {
      if (this.updateRevealSunrise(dt)) return;
    }

    this.updateLoopingCycle(dt);
  }

  dispose(): void {}
}

let dayCycleController: DayCycleController | null = null;

/** DEV: skip the post-cap reveal sunrise (e.g. gameplay testing preset). */
export function skipRevealSunriseIntro(): void {
  dayCycleController?.skipRevealSunriseIntro();
}

export function initDayCycle(
  sun: DirectionalLight,
  ambientLight: AmbientLight,
  sky: SkySystemContext,
): DayCycleContext {
  dayCycleController = new DayCycleController(sun, ambientLight, sky);
  return dayCycleController;
}

/** DEV: scrub cycle phase 0..1 without waiting for real time. */
export function scrubDayPhase(phase: number): number {
  const pos = applySunPositionFromCyclePhase(phase);
  return pos.elevationDeg;
}
