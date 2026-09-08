// src/dev/panel/sky/devPanelDayCycle.ts — day arc scrub + cycle duration (DEV)
import type { AmbientLight, DirectionalLight } from 'three';
import { VISUAL } from '../../../config/visualTuning';
import {
  scrubDayPhase,
  setDayCycleDevScrubLock,
  skipRevealSunriseIntro,
  syncDayCycleElapsedFromSun,
} from '../../../core/reveal/DayCycle';
import { isDayCycleTimeFrozen } from '../../../core/reveal/dayCycleDevScrub';
import { sunRevealState } from '../../../core/reveal/sunRevealState';
import type { PostFXContext } from '../../../rendering/PostFX';
import {
  applyWorldLightingFromElevation,
  resetCycleDevOverride,
  resetLightingCurveDevOverride,
  sampleLighting,
} from '../../../rendering/sky/lightingCurves';
import type { SkySystemContext } from '../../../rendering/sky/SkySystem';
import { applySkyForReveal, invalidateSkyRevealCache } from '../../../rendering/sky/skyRevealBlend';
import { cyclePhaseFromSunPosition } from '../../../rendering/sky/sunCycle';
import { bindRange, type RangeSpec, rangeRowHtml, syncSlider } from '../../bindRange';
import { registerDevPanelLateTick } from '../../panelTickHooks';

const DAY_CYCLE_PHASE_SPEC = {
  id: 'dev-day-phase',
  label: 'Cycle phase (scrub)',
  min: 0,
  max: 1,
  step: 0.001,
  defaultValue: VISUAL.sky.cycle.sunrisePhase,
  format: (v: number) => v.toFixed(3),
} as const satisfies RangeSpec;

const DAY_CYCLE_SPECS = {
  elevation: {
    id: 'dev-day-elevation',
    label: 'Sun elevation (scrub)',
    min: -5,
    max: 70,
    step: 0.1,
    defaultValue: VISUAL.sky.nightBaseline.elevationNight,
    format: (v: number) => `${v.toFixed(1)}°`,
  },
} as const satisfies Record<string, RangeSpec>;

const ALL_SPECS = Object.values(DAY_CYCLE_SPECS);

export { DAY_CYCLE_PHASE_SPEC };

export function dayCyclePhaseScrubHtml(): string {
  return rangeRowHtml(DAY_CYCLE_PHASE_SPEC);
}

export function dayCycleSubsectionHtml(): string {
  return `
      <details class="dev-subsection">
        <summary>Day cycle</summary>
        <div class="dev-section-body">
          <p class="dev-hint">Scrub locks auto cycle. Cycle phase scrub lives under <strong>Gameplay</strong>. Golden band, peak/duration, and AgX/sky exposure live under <strong>Time of day</strong>. Reload-only: sunriseElev ${VISUAL.sky.cycle.sunriseElevationDeg}°, sunsetElev ${VISUAL.sky.cycle.sunsetElevationDeg}°, azimuthEast ${VISUAL.sky.cycle.azimuthEast}°, loop ${VISUAL.sky.cycle.loop}.</p>
          ${ALL_SPECS.map(rangeRowHtml).join('')}
        </div>
      </details>`;
}

function applyLightingAtCurrentElevation(
  sun: DirectionalLight,
  ambientLight: AmbientLight,
  sky: SkySystemContext,
  postFX: PostFXContext,
): void {
  const elev = sunRevealState.elevationDeg;
  invalidateSkyRevealCache();
  applyWorldLightingFromElevation(elev, sun, ambientLight, sky);
  applySkyForReveal(sky, postFX, elev);
}

function applyScrubbedElevation(
  elevationDeg: number,
  sun: DirectionalLight,
  ambientLight: AmbientLight,
  sky: SkySystemContext,
  postFX: PostFXContext,
): void {
  sunRevealState.elevationDeg = elevationDeg;
  applyLightingAtCurrentElevation(sun, ambientLight, sky, postFX);
}

export interface DayCycleDevContext {
  sky: SkySystemContext;
  postFX: PostFXContext;
  sun: DirectionalLight;
  ambientLight: AmbientLight;
}

/** DEV: lock day arc and set sun elevation (gameplay test preset, etc.). */
export function scrubSunElevationDeg(elevationDeg: number, ctx: DayCycleDevContext): void {
  setDayCycleDevScrubLock(true);
  skipRevealSunriseIntro();
  applyScrubbedElevation(elevationDeg, ctx.sun, ctx.ambientLight, ctx.sky, ctx.postFX);
  syncDayCycleElapsedFromSun();
}

/** DEV: resume automatic reveal / day arc elevation. */
export function releaseSunElevationScrub(): void {
  setDayCycleDevScrubLock(false);
}

export function syncDayCyclePanel(panel: HTMLDivElement): void {
  const elev = sunRevealState.elevationDeg;
  const az = sunRevealState.azimuthDeg;
  syncSlider(
    panel,
    DAY_CYCLE_SPECS.elevation.id,
    `${DAY_CYCLE_SPECS.elevation.id}-out`,
    elev,
    DAY_CYCLE_SPECS.elevation.format,
  );
  syncSlider(
    panel,
    DAY_CYCLE_PHASE_SPEC.id,
    `${DAY_CYCLE_PHASE_SPEC.id}-out`,
    cyclePhaseFromSunPosition(elev, az),
    DAY_CYCLE_PHASE_SPEC.format,
  );
}

export function bindDayCyclePanel(
  panel: HTMLDivElement,
  sky: SkySystemContext,
  postFX: PostFXContext,
  sun: DirectionalLight,
  ambientLight: AmbientLight,
  onElevationScrub?: (elevationDeg: number) => void,
): () => void {
  const unregisterLateTick = registerDevPanelLateTick(() => {
    if (isDayCycleTimeFrozen()) return;
    syncDayCyclePanel(panel);
  });

  const disposers: Array<() => void> = [];

  disposers.push(
    bindRange(
      panel,
      DAY_CYCLE_SPECS.elevation.id,
      `${DAY_CYCLE_SPECS.elevation.id}-out`,
      DAY_CYCLE_SPECS.elevation.format,
      (v) => {
        setDayCycleDevScrubLock(true);
        applyScrubbedElevation(v, sun, ambientLight, sky, postFX);
        syncDayCycleElapsedFromSun();
        syncSlider(
          panel,
          DAY_CYCLE_PHASE_SPEC.id,
          `${DAY_CYCLE_PHASE_SPEC.id}-out`,
          cyclePhaseFromSunPosition(v, sunRevealState.azimuthDeg),
          DAY_CYCLE_PHASE_SPEC.format,
        );
        onElevationScrub?.(v);
      },
    ),
  );

  syncDayCyclePanel(panel);

  return () => {
    unregisterLateTick();
    for (const fn of disposers) fn();
  };
}

export function resetDayCyclePanel(
  panel: HTMLDivElement,
  sky: SkySystemContext,
  postFX: PostFXContext,
  sun: DirectionalLight,
  ambientLight: AmbientLight,
): void {
  setDayCycleDevScrubLock(false);
  resetLightingCurveDevOverride();
  resetCycleDevOverride();

  applyLightingAtCurrentElevation(sun, ambientLight, sky, postFX);

  for (const spec of ALL_SPECS) {
    syncSlider(panel, spec.id, `${spec.id}-out`, spec.defaultValue, spec.format);
  }
  syncSlider(
    panel,
    DAY_CYCLE_PHASE_SPEC.id,
    `${DAY_CYCLE_PHASE_SPEC.id}-out`,
    DAY_CYCLE_PHASE_SPEC.defaultValue,
    DAY_CYCLE_PHASE_SPEC.format,
  );
  syncDayCyclePanel(panel);
  void sampleLighting(sunRevealState.elevationDeg);
}

/** DEV: scrub cycle phase 0..1 from Gameplay (locks auto cycle). */
export function scrubDayCyclePhase(phase: number, ctx: DayCycleDevContext): number {
  setDayCycleDevScrubLock(true);
  skipRevealSunriseIntro();
  const elev = scrubDayPhase(phase);
  applyLightingAtCurrentElevation(ctx.sun, ctx.ambientLight, ctx.sky, ctx.postFX);
  return elev;
}

/** Bind the Gameplay cycle-phase scrub slider (same panel DOM as Sky day-cycle). */
export function bindDayCyclePhaseScrub(
  panel: HTMLDivElement,
  ctx: DayCycleDevContext,
  onScrub?: () => void,
): () => void {
  return bindRange(
    panel,
    DAY_CYCLE_PHASE_SPEC.id,
    `${DAY_CYCLE_PHASE_SPEC.id}-out`,
    DAY_CYCLE_PHASE_SPEC.format,
    (v) => {
      const elev = scrubDayCyclePhase(v, ctx);
      syncSlider(
        panel,
        DAY_CYCLE_SPECS.elevation.id,
        `${DAY_CYCLE_SPECS.elevation.id}-out`,
        elev,
        DAY_CYCLE_SPECS.elevation.format,
      );
      onScrub?.();
    },
  );
}
