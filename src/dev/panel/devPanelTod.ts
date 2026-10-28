// src/dev/panel/devPanelTod.ts — unified Time-of-Day look editor (DEV): the stop select, the shared clock and reset.
// The per-stop editors live in ./tod/ (sky + light, grade + LUT, every other look).
import { TOD_STOP_LABELS, TOD_STOPS, type TodStopId } from '../../config/visual/tod';
import { VISUAL } from '../../config/visualTuning';
import { sunRevealState } from '../../core/reveal/sunRevealState';
import {
  dayPhaseFromElevation,
  getActiveCycle,
  setCycleDevOverride,
} from '../../rendering/sky/lightingCurves';
import {
  dominantTodStop,
  getTodBand,
  representativeElevation,
  resetTodBandDevOverride,
  setTodBandDevOverride,
  todGoldenAmount,
  todWeights,
} from '../../rendering/tod/todBlend';
import {
  bindRange,
  injectRangeRows,
  mountSection,
  type RangeSpec,
  subsectionHtml,
  syncSlider,
} from '../bindRange';
import { registerDevPanelLateTick } from '../panelTickHooks';
import {
  type DayCycleDevContext,
  scrubDayCyclePhase,
  scrubSunElevationDeg,
  syncDayCyclePanel,
} from './sky/devPanelDayCycle';
import type { DevPanelTodContext } from './tod/todEditor';
import { createTodGradeEditor, todGradeHtml } from './tod/todGradeEditor';
import { createTodLightEditor, todLightHtml } from './tod/todLightEditor';
import { createTodLookEditor, todLookHtml } from './tod/todLookEditor';

export type { DevPanelTodContext };

/** Gameplay/sky scrub → update ToD stop select without re-scrubbing the sun. */
let _syncTodStopFromElevation: ((elevationDeg: number) => void) | null = null;

/** Align Time-of-day stop editors with the dominant stop at this sun elevation. */
export function syncTodStopFromElevation(elevationDeg: number): void {
  _syncTodStopFromElevation?.(elevationDeg);
}

const CLOCK_SPECS = {
  nightFull: {
    id: 'dev-tod-night-full',
    label: 'Night full °',
    min: -20,
    max: 10,
    step: 0.1,
    defaultValue: VISUAL.tod.goldenHour.nightFullDeg,
    format: (v: number) => `${v.toFixed(1)}°`,
  },
  horizon: {
    id: 'dev-tod-horizon',
    label: 'Horizon °',
    min: -10,
    max: 20,
    step: 0.1,
    defaultValue: VISUAL.tod.goldenHour.horizonDeg,
    format: (v: number) => `${v.toFixed(1)}°`,
  },
  noonStart: {
    id: 'dev-tod-noon-start',
    label: 'Noon start °',
    min: 0,
    max: 40,
    step: 0.1,
    defaultValue: VISUAL.tod.goldenHour.noonStartDeg,
    format: (v: number) => `${v.toFixed(1)}°`,
  },
  bandPower: {
    id: 'dev-tod-band-power',
    label: 'Blend power',
    min: 0.5,
    max: 4,
    step: 0.05,
    defaultValue: VISUAL.tod.goldenHour.power,
    format: (v: number) => v.toFixed(2),
  },
  peak: {
    id: 'dev-tod-peak',
    label: 'Peak elevation',
    min: 30,
    max: 80,
    step: 0.1,
    defaultValue: VISUAL.sky.cycle.peakElevationDeg,
    format: (v: number) => `${v.toFixed(1)}°`,
  },
  duration: {
    id: 'dev-tod-duration',
    label: 'Cycle duration',
    min: 30,
    max: 600,
    step: 1,
    defaultValue: VISUAL.sky.cycle.dayDurationSec,
    format: (v: number) => `${v.toFixed(0)}s`,
  },
} as const satisfies Record<string, RangeSpec>;

/** The clock sliders that edit the blend band (and so the live weights), and the field of the band each one is. */
const BAND_CLOCK = [
  [CLOCK_SPECS.nightFull, 'nightFullDeg'],
  [CLOCK_SPECS.horizon, 'horizonDeg'],
  [CLOCK_SPECS.noonStart, 'noonStartDeg'],
  [CLOCK_SPECS.bandPower, 'power'],
] as const;

/** The clock sliders that edit the day cycle, and the field of the cycle each one is. */
const CYCLE_CLOCK = [
  [CLOCK_SPECS.peak, 'peakElevationDeg'],
  [CLOCK_SPECS.duration, 'dayDurationSec'],
] as const;

/** Scrub sun to a representative pose for the stop. Golden hour uses evening (descending). */
function scrubToTodStop(stop: TodStopId, ctx: DayCycleDevContext): void {
  const cycle = getActiveCycle();
  const elev = representativeElevation(stop, cycle.peakElevationDeg);

  if (stop === 'goldenHour') {
    // Mirror rising dayT onto the descending half so preview is evening, not dawn.
    const riseDayT = dayPhaseFromElevation(elev);
    const eveningDayT = 1 - Math.min(riseDayT, 0.5);
    const sunrise = cycle.sunrisePhase;
    const daySpan = 1 - sunrise * 2;
    const phase = sunrise + eveningDayT * daySpan;
    scrubDayCyclePhase(phase, ctx);
    return;
  }

  scrubSunElevationDeg(elev, ctx);
}

export function initDevPanelTod(panel: HTMLDivElement, ctx?: DevPanelTodContext): () => void {
  const body = mountSection(panel, {
    hostId: 'dev-section-tod',
    title: 'Time of day',
    open: false,
    body: `
      <p class="dev-hint">Master look stops. Choosing a stop scrubs the sun to that anchor (night at/below −5°, golden at the horizon, noon at the cycle peak). Cycle-phase scrub updates this stop to the dominant weight.</p>
      <label class="dev-row">
        <span>Stop</span>
        <select id="dev-tod-stop">
          ${TOD_STOPS.map((s) => `<option value="${s}">${TOD_STOP_LABELS[s]}</option>`).join('')}
        </select>
      </label>
      <p class="dev-hint">Live weights — N <span id="dev-tod-w-night">—</span> · G <span id="dev-tod-w-golden">—</span> · Noon <span id="dev-tod-w-noon">—</span> · elev <span id="dev-tod-elev">—</span> · goldenT <span id="dev-tod-gt">—</span></p>
      ${subsectionHtml('Shared clock', '<div id="dev-tod-clock-rows"></div>', true)}
      ${subsectionHtml('Stop editors', `${todLightHtml()}${todGradeHtml()}${todLookHtml()}`, true)}
      <div class="dev-actions">
        <button type="button" id="dev-tod-reset">Reset ToD overrides</button>
      </div>
    `,
  });
  if (!body) return () => {};

  let selectedStop: TodStopId = dominantTodStop(sunRevealState.elevationDeg);
  const stopSelect = panel.querySelector('#dev-tod-stop') as HTMLSelectElement;
  stopSelect.value = selectedStop;

  injectRangeRows(body.querySelector('#dev-tod-clock-rows')!, Object.values(CLOCK_SPECS));

  const env = { panel, body, ctx, stop: () => selectedStop };
  const editors = [createTodLightEditor(env), createTodGradeEditor(env), createTodLookEditor(env)];

  const syncWeights = () => {
    const elev = sunRevealState.elevationDeg;
    const w = todWeights(elev);
    const set = (id: string, text: string) => {
      const el = panel.querySelector(id);
      if (el) el.textContent = text;
    };
    set('#dev-tod-w-night', w.night.toFixed(2));
    set('#dev-tod-w-golden', w.goldenHour.toFixed(2));
    set('#dev-tod-w-noon', w.noon.toFixed(2));
    set('#dev-tod-elev', `${elev.toFixed(1)}°`);
    set('#dev-tod-gt', todGoldenAmount(elev).toFixed(2));
  };

  const syncClock = () => {
    const band = getTodBand();
    const cycle = getActiveCycle();
    for (const [spec, key] of BAND_CLOCK) {
      syncSlider(panel, spec.id, `${spec.id}-out`, band[key], spec.format);
    }
    for (const [spec, key] of CYCLE_CLOCK) {
      syncSlider(panel, spec.id, `${spec.id}-out`, cycle[key], spec.format);
    }
  };

  const syncStopEditors = () => {
    for (const editor of editors) editor.sync();
  };

  const syncAll = () => {
    syncClock();
    syncStopEditors();
    syncWeights();
  };

  const disposers: Array<() => void> = [];

  const onStopChange = () => {
    selectedStop = stopSelect.value as TodStopId;
    if (ctx) {
      scrubToTodStop(selectedStop, ctx);
      syncDayCyclePanel(panel);
    }
    syncStopEditors();
    syncWeights();
  };
  stopSelect.addEventListener('change', onStopChange);

  _syncTodStopFromElevation = (elevationDeg: number) => {
    const stop = dominantTodStop(elevationDeg);
    if (stop === selectedStop) return;
    selectedStop = stop;
    stopSelect.value = stop;
    syncStopEditors();
    syncWeights();
  };

  // Shared clock
  for (const [spec, key] of BAND_CLOCK) {
    disposers.push(
      bindRange(panel, spec.id, `${spec.id}-out`, spec.format, (v) => {
        setTodBandDevOverride({ [key]: v });
        syncWeights();
      }),
    );
  }
  for (const [spec, key] of CYCLE_CLOCK) {
    disposers.push(
      bindRange(panel, spec.id, `${spec.id}-out`, spec.format, (v) => {
        setCycleDevOverride({ [key]: v });
      }),
    );
  }

  const resetBtn = panel.querySelector('#dev-tod-reset') as HTMLButtonElement | null;
  const onReset = () => {
    resetTodBandDevOverride();
    for (const editor of editors) editor.reset();
    syncAll();
  };
  resetBtn?.addEventListener('click', onReset);

  const unregisterLateTick = registerDevPanelLateTick(syncWeights, body);

  syncAll();
  if (ctx) {
    // Do not scrub on mount — WorldReveal starts at night baseline; scrubbing would
    // lock the clock and skip the reveal sunrise before energy cap.
    syncDayCyclePanel(panel);
  }

  return () => {
    _syncTodStopFromElevation = null;
    unregisterLateTick();
    for (const fn of disposers) fn();
    for (const editor of editors) editor.dispose();
    stopSelect.removeEventListener('change', onStopChange);
    resetBtn?.removeEventListener('click', onReset);
  };
}
