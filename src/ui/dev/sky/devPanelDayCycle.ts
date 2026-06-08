// src/ui/dev/sky/devPanelDayCycle.ts — day arc + exposure curve tuning (DEV)
import type { AmbientLight, DirectionalLight } from 'three';
import { VISUAL } from '../../../config/visualTuning';
import { scrubDayPhase, setDayCycleDevScrubLock } from '../../../core/reveal/DayCycle';
import { isDayCycleDevScrubLocked } from '../../../core/reveal/dayCycleDevScrub';
import { sunRevealState } from '../../../core/reveal/WorldReveal';
import type { PostFXContext } from '../../../rendering/PostFX';
import {
  applyWorldLightingFromElevation,
  dayPhaseFromElevation,
  resetCycleDevOverride,
  resetLightingCurveDevOverride,
  sampleLighting,
  setCycleDevOverride,
  setLightingCurveDevOverride,
} from '../../../rendering/sky/lightingCurves';
import type { SkySystemContext } from '../../../rendering/sky/SkySystem';
import { applySkyForReveal, invalidateSkyRevealCache } from '../../../rendering/sky/skyRevealBlend';
import { bindRange, type RangeSpec, rangeRowHtml, syncSlider } from '../bindRange';

const DAY_CYCLE_SPECS = {
  elevation: {
    id: 'dev-day-elevation',
    label: 'Sun elevation (scrub)',
    min: -5,
    max: 70,
    step: 0.1,
    defaultValue: VISUAL.sky.reveal.elevationNight,
    format: (v: number) => `${v.toFixed(1)}°`,
  },
  phase: {
    id: 'dev-day-phase',
    label: 'Day phase (scrub)',
    min: 0,
    max: 1,
    step: 0.001,
    defaultValue: 0,
    format: (v: number) => v.toFixed(3),
  },
  peak: {
    id: 'dev-day-peak',
    label: 'Peak elevation',
    min: 30,
    max: 80,
    step: 0.1,
    defaultValue: VISUAL.sky.cycle.peakElevationDeg,
    format: (v: number) => `${v.toFixed(1)}°`,
  },
  duration: {
    id: 'dev-day-duration',
    label: 'Day duration',
    min: 30,
    max: 600,
    step: 1,
    defaultValue: VISUAL.sky.cycle.dayDurationSec,
    format: (v: number) => `${v.toFixed(0)}s`,
  },
  groundLow: {
    id: 'dev-exposure-ground-low',
    label: 'AgX low sun',
    min: 0,
    max: 1,
    step: 0.0001,
    defaultValue: VISUAL.sky.exposureCurve.groundLow,
    format: (v: number) => v.toFixed(4),
  },
  groundHigh: {
    id: 'dev-exposure-ground-high',
    label: 'AgX high sun',
    min: 0,
    max: 1,
    step: 0.0001,
    defaultValue: VISUAL.sky.exposureCurve.groundHigh,
    format: (v: number) => v.toFixed(4),
  },
  skyLow: {
    id: 'dev-exposure-sky-low',
    label: 'Sky exp low sun',
    min: 0,
    max: 2,
    step: 0.01,
    defaultValue: VISUAL.sky.exposureCurve.skyLow,
    format: (v: number) => v.toFixed(2),
  },
  skyHigh: {
    id: 'dev-exposure-sky-high',
    label: 'Sky exp high sun',
    min: 0,
    max: 2,
    step: 0.01,
    defaultValue: VISUAL.sky.exposureCurve.skyHigh,
    format: (v: number) => v.toFixed(2),
  },
} as const satisfies Record<string, RangeSpec>;

const ALL_SPECS = Object.values(DAY_CYCLE_SPECS);

let _panelSync: (() => void) | null = null;

export function dayCycleSubsectionHtml(): string {
  return `
      <details class="dev-subsection" open>
        <summary>Day cycle</summary>
        <div class="dev-section-body">
          <p class="dev-hint">Scrub locks auto reveal + day arc. Peak/duration apply live via dev overrides.</p>
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

export function syncDayCyclePanel(panel: HTMLDivElement): void {
  const elev = sunRevealState.elevationDeg;
  syncSlider(
    panel,
    DAY_CYCLE_SPECS.elevation.id,
    `${DAY_CYCLE_SPECS.elevation.id}-out`,
    elev,
    DAY_CYCLE_SPECS.elevation.format,
  );
  syncSlider(
    panel,
    DAY_CYCLE_SPECS.phase.id,
    `${DAY_CYCLE_SPECS.phase.id}-out`,
    dayPhaseFromElevation(elev),
    DAY_CYCLE_SPECS.phase.format,
  );
}

/** Call each frame in DEV when scrub lock is off — keeps sliders in sync with auto arc. */
export function tickDayCyclePanelSync(): void {
  if (isDayCycleDevScrubLocked()) return;
  _panelSync?.();
}

export function bindDayCyclePanel(
  panel: HTMLDivElement,
  sky: SkySystemContext,
  postFX: PostFXContext,
  sun: DirectionalLight,
  ambientLight: AmbientLight,
): () => void {
  _panelSync = () => syncDayCyclePanel(panel);

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
        syncSlider(
          panel,
          DAY_CYCLE_SPECS.phase.id,
          `${DAY_CYCLE_SPECS.phase.id}-out`,
          dayPhaseFromElevation(v),
          DAY_CYCLE_SPECS.phase.format,
        );
      },
    ),
  );

  disposers.push(
    bindRange(
      panel,
      DAY_CYCLE_SPECS.phase.id,
      `${DAY_CYCLE_SPECS.phase.id}-out`,
      DAY_CYCLE_SPECS.phase.format,
      (v) => {
        setDayCycleDevScrubLock(true);
        const elev = scrubDayPhase(v);
        applyLightingAtCurrentElevation(sun, ambientLight, sky, postFX);
        syncSlider(
          panel,
          DAY_CYCLE_SPECS.elevation.id,
          `${DAY_CYCLE_SPECS.elevation.id}-out`,
          elev,
          DAY_CYCLE_SPECS.elevation.format,
        );
      },
    ),
  );

  disposers.push(
    bindRange(
      panel,
      DAY_CYCLE_SPECS.peak.id,
      `${DAY_CYCLE_SPECS.peak.id}-out`,
      DAY_CYCLE_SPECS.peak.format,
      (v) => {
        setCycleDevOverride({ peakElevationDeg: v });
        applyLightingAtCurrentElevation(sun, ambientLight, sky, postFX);
        syncSlider(
          panel,
          DAY_CYCLE_SPECS.phase.id,
          `${DAY_CYCLE_SPECS.phase.id}-out`,
          dayPhaseFromElevation(sunRevealState.elevationDeg),
          DAY_CYCLE_SPECS.phase.format,
        );
      },
    ),
  );

  disposers.push(
    bindRange(
      panel,
      DAY_CYCLE_SPECS.duration.id,
      `${DAY_CYCLE_SPECS.duration.id}-out`,
      DAY_CYCLE_SPECS.duration.format,
      (v) => {
        setCycleDevOverride({ dayDurationSec: v });
      },
    ),
  );

  const bindExposure = (
    spec: RangeSpec,
    key: 'groundLow' | 'groundHigh' | 'skyLow' | 'skyHigh',
  ) => {
    disposers.push(
      bindRange(panel, spec.id, `${spec.id}-out`, spec.format, (v) => {
        setLightingCurveDevOverride({ [key]: v });
        applyLightingAtCurrentElevation(sun, ambientLight, sky, postFX);
      }),
    );
  };

  bindExposure(DAY_CYCLE_SPECS.groundLow, 'groundLow');
  bindExposure(DAY_CYCLE_SPECS.groundHigh, 'groundHigh');
  bindExposure(DAY_CYCLE_SPECS.skyLow, 'skyLow');
  bindExposure(DAY_CYCLE_SPECS.skyHigh, 'skyHigh');

  syncDayCyclePanel(panel);

  return () => {
    _panelSync = null;
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
  syncDayCyclePanel(panel);
  void sampleLighting(sunRevealState.elevationDeg);
}
