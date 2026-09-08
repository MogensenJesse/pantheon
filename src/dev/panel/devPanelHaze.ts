// src/dev/panel/devPanelHaze.ts — DEV valley fog / distance haze (scene.fogNode)
import { sunRevealState } from '../../core/reveal/sunRevealState';
import {
  getHazeCycleParams,
  getValleyFogParams,
  type HazeCycleParams,
  hazeStrengthForElevation,
  resetValleyFogParams,
  setHazeCycleParams,
  setValleyFogParams,
  syncValleyFogDebug,
} from '../../rendering/atmosphere';
import { elevationToDayT, goldenHourT } from '../../rendering/sky/lightingCurves';
import { bindRange, injectRangeRows, mountSection, syncSpecs } from '../bindRange';
import { registerDevPanelLateTick } from '../panelTickHooks';
import {
  ALL_HAZE_SPECS,
  BAND_SPECS,
  CYCLE_SPECS,
  type HazeSpec,
  VALLEY_VOLUME_SPECS,
} from './devPanelHazeSpecs';

function readParam(key: HazeSpec['key']): number {
  return getValleyFogParams()[key];
}

function applyParam(key: HazeSpec['key'], value: number): void {
  setValleyFogParams({ [key]: value });
}

function formatClock(v: number): string {
  return v.toFixed(2);
}

function syncClock(panel: HTMLDivElement): void {
  const elev = sunRevealState.elevationDeg;
  const dayEl = panel.querySelector('#dev-haze-clock-dayt');
  const ghEl = panel.querySelector('#dev-haze-clock-ght');
  const masterEl = panel.querySelector('#dev-haze-clock-master');
  if (dayEl) dayEl.textContent = formatClock(elevationToDayT(elev));
  if (ghEl) ghEl.textContent = formatClock(goldenHourT(elev));
  if (masterEl) masterEl.textContent = formatClock(hazeStrengthForElevation(elev));
}

function syncUi(panel: HTMLDivElement): void {
  syncSpecs(panel, ALL_HAZE_SPECS, (s) => readParam(s.key));
  const cycle = getHazeCycleParams();
  syncSpecs(panel, CYCLE_SPECS, (s) => cycle[s.key]);
  syncClock(panel);
}

export function initDevPanelHaze(panel: HTMLDivElement): () => void {
  const body = mountSection(panel, {
    hostId: 'dev-section-haze',
    title: 'Distance haze',
    open: false,
    body: `
      <p class="dev-hint">Shared valley slab geometry + night-master cycle. Per-stop look (tint, density, aerial, sky horizon) lives under <strong>Time of day → Haze</strong>. Isolate in <strong>Perf</strong>: Disable valley fog vs Disable distance haze.</p>
      <p class="dev-hint">Clock: dayT <span id="dev-haze-clock-dayt">—</span> · goldenHourT <span id="dev-haze-clock-ght">—</span> · haze master <span id="dev-haze-clock-master">—</span></p>
      <details class="dev-subsection">
        <summary>Valley slab (world Y)</summary>
        <div class="dev-section-body" id="dev-haze-band-rows"></div>
      </details>
      <details class="dev-subsection">
        <summary>Night cycle</summary>
        <div class="dev-section-body">
          <p class="dev-hint">Night-valley master envelope (−5° full → 30° clear at power 1.4). Sibling to golden-hour band (Time of day) — do not force the endpoints identical.</p>
          <div id="dev-haze-cycle-rows"></div>
        </div>
      </details>
      <details class="dev-subsection">
        <summary>Night valley volume</summary>
        <div class="dev-section-body">
          <p class="dev-hint">Beer-Lambert path / surround veil geometry. Extinction density is per-stop under Time of day.</p>
          <div id="dev-haze-distance-rows"></div>
        </div>
      </details>
      <div class="dev-actions">
        <button type="button" id="dev-haze-reset">Reset haze</button>
      </div>
    `,
  });
  if (!body) return () => {};

  injectRangeRows(body.querySelector('#dev-haze-band-rows')!, BAND_SPECS);
  injectRangeRows(body.querySelector('#dev-haze-cycle-rows')!, CYCLE_SPECS);
  injectRangeRows(body.querySelector('#dev-haze-distance-rows')!, VALLEY_VOLUME_SPECS);
  syncUi(panel);

  const unregisterLateTick = registerDevPanelLateTick(() => syncClock(panel));
  const disposers: Array<() => void> = [];

  for (const s of ALL_HAZE_SPECS) {
    disposers.push(
      bindRange(panel, s.id, `${s.id}-out`, s.format, (v) => {
        applyParam(s.key, v);
      }),
    );
  }

  for (const s of CYCLE_SPECS) {
    disposers.push(
      bindRange(panel, s.id, `${s.id}-out`, s.format, (v) => {
        setHazeCycleParams({ [s.key]: v } as Partial<HazeCycleParams>);
        syncValleyFogDebug();
        syncClock(panel);
      }),
    );
  }

  const resetBtn = panel.querySelector('#dev-haze-reset') as HTMLButtonElement | null;
  const onReset = () => {
    resetValleyFogParams();
    syncUi(panel);
  };
  resetBtn?.addEventListener('click', onReset);

  return () => {
    unregisterLateTick();
    for (const fn of disposers) fn();
    resetBtn?.removeEventListener('click', onReset);
  };
}
