// src/dev/panel/devPanelHaze.ts — DEV valley fog / distance haze (scene.fogNode)
import { VISUAL } from '../../config/visualTuning';
import { sunRevealState } from '../../core/reveal/sunRevealState';
import {
  getHazeCycleParams,
  type HazeCycleParams,
  hazeStrengthForElevation,
  setHazeCycleParams,
} from '../../rendering/atmosphere/hazeCycleStrength';
import {
  defaultValleyFogParams,
  getValleyFogParams,
  getValleyFogUniforms,
  resetValleyFogParams,
  setValleyFogParams,
  syncValleyFogDebug,
} from '../../rendering/atmosphere/valleyFog';
import { elevationToDayT, goldenHourT } from '../../rendering/sky/lightingCurves';
import { bindRange, injectRangeRows, mountSection, syncSpecs } from '../bindRange';
import { registerDevPanelLateTick } from '../panelTickHooks';
import {
  AERIAL_SPECS,
  ALL_HAZE_SPECS,
  BAND_SPECS,
  CYCLE_SPECS,
  type HazeSpec,
  VALLEY_VOLUME_SPECS,
} from './devPanelHazeSpecs';

const H = VISUAL.atmosphere.haze;

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
  const u = getValleyFogUniforms();
  const p = getValleyFogParams();
  const dayInput = panel.querySelector('#dev-haze-day-color') as HTMLInputElement | null;
  const nightInput = panel.querySelector('#dev-haze-night-color') as HTMLInputElement | null;
  if (dayInput) dayInput.value = p.dayColor;
  if (nightInput) nightInput.value = p.nightColor;
  if (u) {
    u.uFogColor.value.set(p.dayColor);
  }
  syncClock(panel);
}

export function initDevPanelHaze(panel: HTMLDivElement): () => void {
  const body = mountSection(panel, {
    hostId: 'dev-section-haze',
    title: 'Distance haze',
    open: false,
    body: `
      <p class="dev-hint">Day aerial is always-on camera-XZ distance via <code>scene.fogNode</code> so terrain, grass, props, and water wash together. Night valleys fill with a cheap Y-slab mist pool (path through fog base→top × master) — no extra pass. From a ridge you should see the pool in the bowl; walking in adds a near veil. Night tint must stay lighter than unlit terrain or the pool vanishes. Orbs / guide stay unfogged. Isolate in <strong>Perf</strong>: Disable valley fog vs Disable distance haze.</p>
      <p class="dev-hint">Clock: dayT <span id="dev-haze-clock-dayt">—</span> · goldenHourT <span id="dev-haze-clock-ght">—</span> · haze master <span id="dev-haze-clock-master">—</span></p>
      <details class="dev-subsection">
        <summary>Day aerial (XZ)</summary>
        <div class="dev-section-body" id="dev-haze-aerial-rows"></div>
      </details>
      <details class="dev-subsection">
        <summary>Valley slab (world Y)</summary>
        <div class="dev-section-body" id="dev-haze-band-rows"></div>
      </details>
      <details class="dev-subsection">
        <summary>Night cycle</summary>
        <div class="dev-section-body">
          <p class="dev-hint">Night-valley master envelope (−5° full → 30° clear at power 1.4). Sibling to golden-hour sharpness (peak 58°) — do not force the endpoints identical. Day fog-top recedes here; night fog-top is Valley slab.</p>
          <div id="dev-haze-cycle-rows"></div>
        </div>
      </details>
      <details class="dev-subsection">
        <summary>Night valley volume</summary>
        <div class="dev-section-body">
          <p class="dev-hint">Beer-Lambert along the view ray through the height slab. From a ridge the pool stays a path integral. From inside, looking at the horizon or sky uses a height-weighted veil so you are surrounded (stars dim) without a lid. Looking down still uses the path so nearby ground stays readable.</p>
          <div id="dev-haze-distance-rows"></div>
        </div>
      </details>
      <label class="dev-row">
        <span>Day haze tint</span>
        <input type="color" id="dev-haze-day-color" value="${H.dayColor}" />
      </label>
      <label class="dev-row">
        <span>Night haze tint</span>
        <input type="color" id="dev-haze-night-color" value="${H.nightColor}" />
      </label>
      <div class="dev-actions">
        <button type="button" id="dev-haze-reset">Reset haze</button>
      </div>
    `,
  });
  if (!body) return () => {};

  injectRangeRows(body.querySelector('#dev-haze-aerial-rows')!, AERIAL_SPECS);
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

  const dayColorInput = panel.querySelector('#dev-haze-day-color') as HTMLInputElement | null;
  const nightColorInput = panel.querySelector('#dev-haze-night-color') as HTMLInputElement | null;

  const onDayColor = () => {
    if (!dayColorInput) return;
    setValleyFogParams({ dayColor: dayColorInput.value });
  };
  const onNightColor = () => {
    if (!nightColorInput) return;
    setValleyFogParams({ nightColor: nightColorInput.value });
  };
  dayColorInput?.addEventListener('input', onDayColor);
  nightColorInput?.addEventListener('input', onNightColor);

  const resetBtn = panel.querySelector('#dev-haze-reset') as HTMLButtonElement | null;
  const onReset = () => {
    resetValleyFogParams();
    const d = defaultValleyFogParams();
    if (dayColorInput) dayColorInput.value = d.dayColor;
    if (nightColorInput) nightColorInput.value = d.nightColor;
    syncUi(panel);
  };
  resetBtn?.addEventListener('click', onReset);

  return () => {
    unregisterLateTick();
    for (const fn of disposers) fn();
    dayColorInput?.removeEventListener('input', onDayColor);
    nightColorInput?.removeEventListener('input', onNightColor);
    resetBtn?.removeEventListener('click', onReset);
  };
}
