// src/dev/panel/devPanelTod.ts — unified Time-of-Day look editor (DEV)
import type { TodStopId } from '../../config/visual/tod';
import { TOD_STOP_LABELS, TOD_STOPS } from '../../config/visual/tod';
import { VISUAL } from '../../config/visualTuning';
import { devSettings } from '../../core/GameState';
import { isDayCycleTimeFrozen } from '../../core/reveal/dayCycleDevScrub';
import { sunRevealState } from '../../core/reveal/sunRevealState';
import type { HazeLookStop } from '../../rendering/atmosphere';
import {
  getValleyFogParams,
  resetValleyFogParams,
  setValleyFogLookStop,
} from '../../rendering/atmosphere';
import type { PostFXContext } from '../../rendering/PostFX';
import { applyGradeLutToPostFX } from '../../rendering/postfx/applyGradeLut';
import {
  fetchGradeLutCatalog,
  findLutByPath,
  type GradeLutManifest,
  lutsForVendor,
} from '../../rendering/postfx/gradeLutCatalog';
import { resetPostFxGradeDev } from '../../rendering/postfx/postfxGrade';
import {
  dayPhaseFromElevation,
  getActiveCycle,
  getActiveLightingStop,
  resetLightingCurveDevOverride,
  setCycleDevOverride,
  setLightingStopDevOverride,
} from '../../rendering/sky/lightingCurves';
import type { SkyAtmosphereScalars } from '../../rendering/sky/skyDefaults';
import { getActiveSkyAtmosphereStop } from '../../rendering/sky/skyDevOverrides';
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
  readBloomSceneWeightStop,
  readShadowFloorStop,
  resetBloomSceneWeightDevOverride,
  resetShadowFloorDevOverrides,
  setBloomSceneWeightStop,
  setShadowFloorStop,
  type TodShadowReceiverProfile,
} from '../../rendering/tod/todDevOverrides';
import {
  TERRAIN_ATLAS_BIOME_KEYS,
  TERRAIN_BIOME_LABELS,
} from '../../world/terrain/config/terrainBiomeTuning';
import {
  bindCheckbox,
  bindColor,
  bindRange,
  injectRangeRows,
  mountSection,
  type RangeSpec,
  syncColor,
  syncSlider,
} from '../bindRange';
import { registerDevPanelLateTick } from '../panelTickHooks';
import {
  type DayCycleDevContext,
  scrubDayCyclePhase,
  scrubSunElevationDeg,
  syncDayCyclePanel,
} from './sky/devPanelDayCycle';
import {
  pushDevSkyAtmosphereStopOverride,
  pushDevSkyAtmosphereStopTint,
} from './sky/devPanelSkyShared';

/** Gameplay/sky scrub → update ToD stop select without re-scrubbing the sun. */
let _syncTodStopFromElevation: ((elevationDeg: number) => void) | null = null;

/** Align Time-of-day stop editors with the dominant stop at this sun elevation. */
export function syncTodStopFromElevation(elevationDeg: number): void {
  _syncTodStopFromElevation?.(elevationDeg);
}

const LIGHTING_FIELDS = [
  {
    key: 'daylightFactor' as const,
    label: 'Daylight (grass/water)',
    min: 0,
    max: 1,
    step: 0.01,
  },
  {
    key: 'sunIntensity' as const,
    label: 'Sun intensity (world)',
    min: 0,
    max: 3,
    step: 0.01,
  },
  {
    key: 'ambientIntensity' as const,
    label: 'Ambient (terrain)',
    min: 0,
    max: 2,
    step: 0.01,
  },
  {
    key: 'globalExposure' as const,
    label: 'AgX exposure',
    min: 0,
    max: 4,
    step: 0.01,
  },
  {
    key: 'skyExposure' as const,
    label: 'SkyMesh exposure',
    min: 0,
    max: 2,
    step: 0.01,
  },
];

const HAZE_LOOK_FIELDS: Array<{
  key: Exclude<keyof HazeLookStop, 'tint'>;
  label: string;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
}> = [
  {
    key: 'hazeDensity',
    label: 'Valley extinction (1/m)',
    min: 0,
    max: 0.02,
    step: 0.0001,
    format: (v) => v.toFixed(4),
  },
  {
    key: 'aerialStartM',
    label: 'Aerial start (m)',
    min: 20,
    max: 400,
    step: 5,
    format: (v) => v.toFixed(0),
  },
  {
    key: 'aerialEndM',
    label: 'Aerial end (m)',
    min: 100,
    max: 1200,
    step: 10,
    format: (v) => v.toFixed(0),
  },
  {
    key: 'aerialStrength',
    label: 'Aerial strength',
    min: 0,
    max: 1,
    step: 0.05,
    format: (v) => v.toFixed(2),
  },
  {
    key: 'aerialNightMul',
    label: 'Night aerial (× day)',
    min: 0,
    max: 1,
    step: 0.01,
    format: (v) => v.toFixed(2),
  },
  {
    key: 'skyHorizonStart',
    label: 'Sky horizon start',
    min: 0,
    max: 0.5,
    step: 0.01,
    format: (v) => v.toFixed(2),
  },
  {
    key: 'skyHorizonEnd',
    label: 'Sky horizon end',
    min: 0.05,
    max: 0.8,
    step: 0.01,
    format: (v) => v.toFixed(2),
  },
  {
    key: 'skyHorizonStrength',
    label: 'Sky horizon strength',
    min: 0,
    max: 1,
    step: 0.01,
    format: (v) => v.toFixed(2),
  },
];

const PREETHAM_FIELDS: Array<{
  param: keyof SkyAtmosphereScalars;
  label: string;
  min: number;
  max: number;
  step: number;
}> = [
  { param: 'turbidity', label: 'Turbidity', min: 0, max: 20, step: 0.1 },
  { param: 'rayleigh', label: 'Rayleigh', min: 0, max: 4, step: 0.001 },
  { param: 'mieCoefficient', label: 'Mie coefficient', min: 0, max: 0.1, step: 0.001 },
  { param: 'mieDirectionalG', label: 'Mie directional G', min: 0, max: 1, step: 0.001 },
];

const GRADE_REGIONS = ['shadows', 'midtones', 'highlights'] as const;
type GradeRegionId = (typeof GRADE_REGIONS)[number];
const GRADE_REGION_LABELS: Record<GradeRegionId, string> = {
  shadows: 'Shadows',
  midtones: 'Midtones',
  highlights: 'Highlights',
};
const GRADE_REGION_NUM_FIELDS = [
  { key: 'saturation' as const, label: 'Saturation', min: 0.5, max: 1.5, step: 0.01 },
  { key: 'contrast' as const, label: 'Contrast', min: 0.5, max: 1.5, step: 0.01 },
];
const GRADE_WARMTH_FIELD = {
  key: 'warmth' as const,
  label: 'Warmth',
  min: -0.2,
  max: 0.4,
  step: 0.01,
};

const SHADOW_PROFILES: Array<{ id: TodShadowReceiverProfile; label: string }> = [
  { id: 'terrain', label: 'Terrain floor' },
  { id: 'grass', label: 'Grass floor' },
  { id: 'props', label: 'Props floor' },
  { id: 'water', label: 'Water floor' },
];

const PALETTE_CHANNELS = ['sun', 'ground', 'shadow'] as const;

const CLOCK_SPECS = {
  bandStart: {
    id: 'dev-tod-band-start',
    label: 'Golden start °',
    min: -10,
    max: 20,
    step: 0.1,
    defaultValue: VISUAL.tod.goldenHour.startElevationDeg,
    format: (v: number) => `${v.toFixed(1)}°`,
  },
  bandEnd: {
    id: 'dev-tod-band-end',
    label: 'Golden end °',
    min: 0,
    max: 40,
    step: 0.1,
    defaultValue: VISUAL.tod.goldenHour.endElevationDeg,
    format: (v: number) => `${v.toFixed(1)}°`,
  },
  bandPower: {
    id: 'dev-tod-band-power',
    label: 'Golden power',
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

export type DevPanelTodContext = DayCycleDevContext & {
  postFX: PostFXContext;
};

export function initDevPanelTod(panel: HTMLDivElement, ctx?: DevPanelTodContext): () => void {
  const body = mountSection(panel, {
    hostId: 'dev-section-tod',
    title: 'Time of day',
    open: false,
    body: `
      <p class="dev-hint">Master look stops. Choosing a stop scrubs the sun (and Gameplay cycle phase) to a representative pose (golden hour → evening). Cycle-phase scrub updates this stop to the dominant weight. Shared clock drives golden band + day arc.</p>
      <label class="dev-row">
        <span>Stop</span>
        <select id="dev-tod-stop">
          ${TOD_STOPS.map((s) => `<option value="${s}">${TOD_STOP_LABELS[s]}</option>`).join('')}
        </select>
      </label>
      <p class="dev-hint">Live weights — N <span id="dev-tod-w-night">—</span> · G <span id="dev-tod-w-golden">—</span> · Noon <span id="dev-tod-w-noon">—</span> · elev <span id="dev-tod-elev">—</span> · goldenT <span id="dev-tod-gt">—</span></p>
      <details class="dev-subsection" open>
        <summary>Shared clock</summary>
        <div class="dev-section-body" id="dev-tod-clock-rows"></div>
      </details>
      <details class="dev-subsection" open>
        <summary>Stop editors</summary>
        <div class="dev-section-body">
          <details class="dev-subsection" open><summary>Lighting</summary><div class="dev-section-body">
            <p class="dev-hint">Stop values blend at the current scrub elevation. Sun/ambient/daylight push every frame (works while scrub is locked).</p>
            <div id="dev-tod-lighting-rows"></div>
          </div></details>
          <details class="dev-subsection"><summary>Preetham</summary><div class="dev-section-body">
            <label class="dev-row"><span>Sky tint</span><input type="color" id="dev-tod-preetham-tint" /></label>
            <div id="dev-tod-preetham-rows"></div>
          </div></details>
          <details class="dev-subsection"><summary>Grade + LUT</summary><div class="dev-section-body" id="dev-tod-grade-rows">
            <p class="dev-hint">Master off bypasses procedural grade. Sat/contrast/lift are per shadows / midtones / highlights. Perf <strong>Disable grade</strong> kills both.</p>
            <label class="dev-row dev-row-check"><span>Grade enabled</span><input type="checkbox" id="dev-tod-grade-enabled" /></label>
            <label class="dev-row"><span>Warmth tint</span><input type="color" id="dev-tod-grade-warmth-tint" /></label>
            <div id="dev-tod-grade-warmth-row"></div>
            <div id="dev-tod-grade-regions"></div>
            <label class="dev-row dev-row-check"><span>LUT enabled</span><input type="checkbox" id="dev-tod-lut-enabled" /></label>
            <label class="dev-row"><span>LUT strength</span><input type="range" id="dev-tod-lut-strength" min="0" max="1" step="0.01" /><output id="dev-tod-lut-strength-out"></output></label>
            <label class="dev-row"><span>LUT vendor</span><select id="dev-tod-lut-vendor" disabled><option value="">Loading…</option></select></label>
            <label class="dev-row"><span>LUT</span><select id="dev-tod-lut-pick" disabled><option value="">None</option></select></label>
            <p id="dev-tod-lut-status" class="dev-hint"></p>
          </div></details>
          <details class="dev-subsection"><summary>Terrain palettes</summary><div class="dev-section-body" id="dev-tod-terrain-rows">
            <div class="dev-palette-legend"><span></span><span>Sun</span><span>Ground</span><span>Shadow</span></div>
          </div></details>
          <details class="dev-subsection"><summary>Bloom weight</summary><div class="dev-section-body" id="dev-tod-bloom-rows"></div></details>
          <details class="dev-subsection"><summary>God rays</summary><div class="dev-section-body" id="dev-tod-godray-rows">
            <label class="dev-row"><span>Tint</span><input type="color" id="dev-tod-godray-tint" /></label>
            <div id="dev-tod-godray-weight-rows"></div>
          </div></details>
          <details class="dev-subsection"><summary>Haze look</summary><div class="dev-section-body" id="dev-tod-haze-rows">
            <p class="dev-hint">Per-stop look. Slab geometry + night-master cycle stay under Distance haze.</p>
            <label class="dev-row"><span>Tint</span><input type="color" id="dev-tod-haze-tint" /></label>
            <div id="dev-tod-haze-scalar-rows"></div>
          </div></details>
          <details class="dev-subsection"><summary>Water look</summary><div class="dev-section-body" id="dev-tod-water-rows">
            <label class="dev-row"><span>Water color</span><input type="color" id="dev-tod-water-color" /></label>
            <label class="dev-row"><span>Sun color</span><input type="color" id="dev-tod-water-sun" /></label>
            <label class="dev-row"><span>Shallow color</span><input type="color" id="dev-tod-water-shallow" /></label>
            <label class="dev-row"><span>Distortion</span><input type="range" id="dev-tod-water-distortion" min="0" max="8" step="0.1" /><output id="dev-tod-water-distortion-out"></output></label>
          </div></details>
          <details class="dev-subsection"><summary>Grass colors</summary><div class="dev-section-body" id="dev-tod-grass-rows">
            <p class="dev-hint">Blade albedo per stop (blended by todWeights). Foliage wrap tints stay under Grass.</p>
            <label class="dev-row"><span>Dark base</span><input type="color" id="dev-tod-grass-base-dark" /></label>
            <label class="dev-row"><span>Base</span><input type="color" id="dev-tod-grass-base" /></label>
            <label class="dev-row"><span>Tip</span><input type="color" id="dev-tod-grass-tip" /></label>
            <label class="dev-row"><span>Rust</span><input type="color" id="dev-tod-grass-rust" /></label>
            <label class="dev-row"><span>Warm</span><input type="color" id="dev-tod-grass-warm" /></label>
          </div></details>
          <details class="dev-subsection"><summary>Shadow floors</summary><div class="dev-section-body" id="dev-tod-shadow-rows"></div></details>
        </div>
      </details>
      <div class="dev-actions">
        <button type="button" id="dev-tod-reset">Reset ToD overrides</button>
      </div>
    `,
  });
  if (!body) return () => {};

  let selectedStop: TodStopId = dominantTodStop(sunRevealState.elevationDeg);
  const stopSelect = panel.querySelector('#dev-tod-stop') as HTMLSelectElement;
  stopSelect.value = selectedStop;

  const lightingSpecs: RangeSpec[] = LIGHTING_FIELDS.map((f) => ({
    id: `dev-tod-light-${f.key}`,
    label: f.label,
    min: f.min,
    max: f.max,
    step: f.step,
    defaultValue: VISUAL.sky.lighting.goldenHour[f.key],
    format: (v) => v.toFixed(2),
  }));
  const preethamSpecs: RangeSpec[] = PREETHAM_FIELDS.map((f) => ({
    id: `dev-tod-preetham-${f.param}`,
    label: f.label,
    min: f.min,
    max: f.max,
    step: f.step,
    defaultValue: VISUAL.sky.goldenHour[f.param],
    format: (v) => (f.step < 0.01 ? v.toFixed(3) : v.toFixed(1)),
  }));
  const gradeWarmthSpec: RangeSpec = {
    id: 'dev-tod-grade-warmth',
    label: GRADE_WARMTH_FIELD.label,
    min: GRADE_WARMTH_FIELD.min,
    max: GRADE_WARMTH_FIELD.max,
    step: GRADE_WARMTH_FIELD.step,
    defaultValue: VISUAL.postfx.grade.stops.goldenHour.warmth,
    format: (v) => v.toFixed(2),
  };
  const gradeRegionSpecs: RangeSpec[] = [];
  for (const region of GRADE_REGIONS) {
    for (const f of GRADE_REGION_NUM_FIELDS) {
      gradeRegionSpecs.push({
        id: `dev-tod-grade-${region}-${f.key}`,
        label: f.label,
        min: f.min,
        max: f.max,
        step: f.step,
        defaultValue: VISUAL.postfx.grade.stops.goldenHour[region][f.key],
        format: (v) => v.toFixed(2),
      });
    }
    for (const ch of ['r', 'g', 'b'] as const) {
      gradeRegionSpecs.push({
        id: `dev-tod-grade-${region}-lift-${ch}`,
        label: `Lift ${ch.toUpperCase()}`,
        min: -0.2,
        max: 0.2,
        step: 0.005,
        defaultValue: VISUAL.postfx.grade.stops.goldenHour[region].lift[ch],
        format: (v) => v.toFixed(3),
      });
    }
  }
  const hazeLookSpecs: RangeSpec[] = HAZE_LOOK_FIELDS.map((f) => ({
    id: `dev-tod-haze-${f.key}`,
    label: f.label,
    min: f.min,
    max: f.max,
    step: f.step,
    defaultValue: VISUAL.atmosphere.haze.stops.goldenHour[f.key],
    format: f.format,
  }));
  const bloomSpec: RangeSpec = {
    id: 'dev-tod-bloom-weight',
    label: 'Scene weight',
    min: 0,
    max: 2,
    step: 0.01,
    defaultValue: VISUAL.bloom.sceneWeight.goldenHour,
    format: (v) => v.toFixed(2),
  };
  const godraySpec: RangeSpec = {
    id: 'dev-tod-godray-weight',
    label: 'Weight',
    min: 0,
    max: 2,
    step: 0.01,
    defaultValue: VISUAL.godrays.weight.goldenHour,
    format: (v) => v.toFixed(2),
  };
  const shadowSpecs: RangeSpec[] = SHADOW_PROFILES.map((p) => ({
    id: `dev-tod-shadow-${p.id}`,
    label: p.label,
    min: 0,
    max: 1,
    step: 0.01,
    defaultValue: VISUAL.shadows.receivers[p.id].shadowFloor.goldenHour,
    format: (v) => v.toFixed(2),
  }));

  injectRangeRows(body.querySelector('#dev-tod-clock-rows')!, Object.values(CLOCK_SPECS));
  injectRangeRows(body.querySelector('#dev-tod-lighting-rows')!, lightingSpecs);
  injectRangeRows(body.querySelector('#dev-tod-preetham-rows')!, preethamSpecs);
  injectRangeRows(body.querySelector('#dev-tod-grade-warmth-row')!, [gradeWarmthSpec]);
  const gradeRegionsHost = body.querySelector('#dev-tod-grade-regions')!;
  for (const region of GRADE_REGIONS) {
    const details = document.createElement('details');
    details.className = 'dev-subsection';
    details.innerHTML = `<summary>${GRADE_REGION_LABELS[region]}</summary><div class="dev-section-body" id="dev-tod-grade-${region}-rows"></div>`;
    gradeRegionsHost.appendChild(details);
    const regionSpecs = gradeRegionSpecs.filter((s) => s.id.includes(`-${region}-`));
    injectRangeRows(details.querySelector(`#dev-tod-grade-${region}-rows`)!, regionSpecs);
  }
  injectRangeRows(body.querySelector('#dev-tod-haze-scalar-rows')!, hazeLookSpecs);
  injectRangeRows(body.querySelector('#dev-tod-bloom-rows')!, [bloomSpec]);
  injectRangeRows(body.querySelector('#dev-tod-godray-weight-rows')!, [godraySpec]);
  injectRangeRows(body.querySelector('#dev-tod-shadow-rows')!, shadowSpecs);

  const terrainHost = body.querySelector('#dev-tod-terrain-rows')!;
  for (const biome of TERRAIN_ATLAS_BIOME_KEYS) {
    const row = document.createElement('div');
    row.className = 'dev-palette-tod';
    row.innerHTML = `<span>${TERRAIN_BIOME_LABELS[biome]}</span>${PALETTE_CHANNELS.map(
      (ch) => `<input type="color" id="dev-tod-terrain-${biome}-${ch}" title="${ch}" />`,
    ).join('')}`;
    terrainHost.appendChild(row);
  }

  const grade = () => devSettings.postfx.grade.stops[selectedStop];
  const waterStop = () => devSettings.water.stops[selectedStop];
  const grassColorStop = () => devSettings.grass.colorStops[selectedStop];

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
    syncSlider(
      panel,
      CLOCK_SPECS.bandStart.id,
      `${CLOCK_SPECS.bandStart.id}-out`,
      band.startElevationDeg,
      CLOCK_SPECS.bandStart.format,
    );
    syncSlider(
      panel,
      CLOCK_SPECS.bandEnd.id,
      `${CLOCK_SPECS.bandEnd.id}-out`,
      band.endElevationDeg,
      CLOCK_SPECS.bandEnd.format,
    );
    syncSlider(
      panel,
      CLOCK_SPECS.bandPower.id,
      `${CLOCK_SPECS.bandPower.id}-out`,
      band.power,
      CLOCK_SPECS.bandPower.format,
    );
    syncSlider(
      panel,
      CLOCK_SPECS.peak.id,
      `${CLOCK_SPECS.peak.id}-out`,
      cycle.peakElevationDeg,
      CLOCK_SPECS.peak.format,
    );
    syncSlider(
      panel,
      CLOCK_SPECS.duration.id,
      `${CLOCK_SPECS.duration.id}-out`,
      cycle.dayDurationSec,
      CLOCK_SPECS.duration.format,
    );
  };

  const syncStopEditors = () => {
    const lighting = getActiveLightingStop(selectedStop);
    for (const f of LIGHTING_FIELDS) {
      const spec = lightingSpecs.find((s) => s.id === `dev-tod-light-${f.key}`)!;
      syncSlider(panel, spec.id, `${spec.id}-out`, lighting[f.key], spec.format);
    }
    const atm = getActiveSkyAtmosphereStop(selectedStop);
    syncColor(panel, 'dev-tod-preetham-tint', atm.tint);
    for (const f of PREETHAM_FIELDS) {
      const spec = preethamSpecs.find((s) => s.id === `dev-tod-preetham-${f.param}`)!;
      syncSlider(panel, spec.id, `${spec.id}-out`, atm[f.param], spec.format);
    }
    const g = grade();
    const gradeEnabled = panel.querySelector('#dev-tod-grade-enabled') as HTMLInputElement | null;
    if (gradeEnabled) gradeEnabled.checked = devSettings.postfx.grade.enabled;
    syncColor(panel, 'dev-tod-grade-warmth-tint', g.warmthTint);
    syncSlider(
      panel,
      gradeWarmthSpec.id,
      `${gradeWarmthSpec.id}-out`,
      g.warmth,
      gradeWarmthSpec.format,
    );
    for (const region of GRADE_REGIONS) {
      const reg = g[region];
      for (const f of GRADE_REGION_NUM_FIELDS) {
        const spec = gradeRegionSpecs.find((s) => s.id === `dev-tod-grade-${region}-${f.key}`)!;
        syncSlider(panel, spec.id, `${spec.id}-out`, reg[f.key], spec.format);
      }
      for (const ch of ['r', 'g', 'b'] as const) {
        const id = `dev-tod-grade-${region}-lift-${ch}`;
        syncSlider(panel, id, `${id}-out`, reg.lift[ch], (v) => v.toFixed(3));
      }
    }
    const lutEnabled = panel.querySelector('#dev-tod-lut-enabled') as HTMLInputElement | null;
    if (lutEnabled) lutEnabled.checked = g.lut.enabled;
    syncSlider(panel, 'dev-tod-lut-strength', 'dev-tod-lut-strength-out', g.lut.strength, (v) =>
      v.toFixed(2),
    );

    syncSlider(
      panel,
      bloomSpec.id,
      `${bloomSpec.id}-out`,
      readBloomSceneWeightStop(selectedStop),
      bloomSpec.format,
    );
    if (ctx) {
      const gp = ctx.postFX.getGodraysParams();
      syncColor(panel, 'dev-tod-godray-tint', gp.tint[selectedStop]);
      syncSlider(
        panel,
        godraySpec.id,
        `${godraySpec.id}-out`,
        gp.weight[selectedStop],
        godraySpec.format,
      );
    }
    const haze = getValleyFogParams().stops[selectedStop];
    syncColor(panel, 'dev-tod-haze-tint', haze.tint);
    for (const f of HAZE_LOOK_FIELDS) {
      const spec = hazeLookSpecs.find((s) => s.id === `dev-tod-haze-${f.key}`)!;
      syncSlider(panel, spec.id, `${spec.id}-out`, haze[f.key], spec.format);
    }

    for (const biome of TERRAIN_ATLAS_BIOME_KEYS) {
      const pal = devSettings.terrain.stylize.biomes[biome][selectedStop];
      for (const ch of PALETTE_CHANNELS) {
        syncColor(panel, `dev-tod-terrain-${biome}-${ch}`, pal[ch]);
      }
    }

    const ws = waterStop();
    syncColor(panel, 'dev-tod-water-color', ws.waterColor);
    syncColor(panel, 'dev-tod-water-sun', ws.sunColor);
    syncColor(panel, 'dev-tod-water-shallow', ws.shallowColor);
    syncSlider(
      panel,
      'dev-tod-water-distortion',
      'dev-tod-water-distortion-out',
      ws.distortion,
      (v) => v.toFixed(1),
    );

    const gs = grassColorStop();
    syncColor(panel, 'dev-tod-grass-base-dark', gs.baseColorDark);
    syncColor(panel, 'dev-tod-grass-base', gs.baseColor);
    syncColor(panel, 'dev-tod-grass-tip', gs.tipColor);
    syncColor(panel, 'dev-tod-grass-rust', gs.rustColor);
    syncColor(panel, 'dev-tod-grass-warm', gs.warmColor);

    for (const p of SHADOW_PROFILES) {
      const spec = shadowSpecs.find((s) => s.id === `dev-tod-shadow-${p.id}`)!;
      syncSlider(
        panel,
        spec.id,
        `${spec.id}-out`,
        readShadowFloorStop(p.id, selectedStop),
        spec.format,
      );
    }
  };

  const syncAll = () => {
    syncClock();
    syncStopEditors();
    syncWeights();
  };

  // --- LUT catalog (selected stop) ---
  const lutVendorSelect = panel.querySelector('#dev-tod-lut-vendor') as HTMLSelectElement | null;
  const lutPickSelect = panel.querySelector('#dev-tod-lut-pick') as HTMLSelectElement | null;
  const lutStatus = panel.querySelector('#dev-tod-lut-status') as HTMLParagraphElement | null;
  let lutCatalog: GradeLutManifest | null = null;
  let lutLoadToken = 0;
  let applyingLut = false;

  const setLutStatus = (msg: string) => {
    if (lutStatus) lutStatus.textContent = msg;
  };

  const populateLutPick = (vendor: string, selectedPath: string | null) => {
    if (!lutPickSelect || !lutCatalog) return;
    const previous = selectedPath ?? lutPickSelect.value;
    lutPickSelect.innerHTML = '<option value="">None</option>';
    for (const entry of vendor ? lutsForVendor(lutCatalog, vendor) : []) {
      const opt = document.createElement('option');
      opt.value = entry.path;
      opt.textContent = entry.name;
      lutPickSelect.appendChild(opt);
    }
    lutPickSelect.disabled = !vendor || applyingLut;
    if (previous && [...lutPickSelect.options].some((o) => o.value === previous)) {
      lutPickSelect.value = previous;
    } else {
      lutPickSelect.value = '';
    }
  };

  const populateVendors = (selectedPath: string | null) => {
    if (!lutVendorSelect || !lutCatalog) return;
    const current = findLutByPath(lutCatalog, selectedPath);
    lutVendorSelect.innerHTML = '<option value="">—</option>';
    for (const vendor of lutCatalog.vendors) {
      const opt = document.createElement('option');
      opt.value = vendor;
      opt.textContent = vendor;
      lutVendorSelect.appendChild(opt);
    }
    lutVendorSelect.disabled = applyingLut;
    lutVendorSelect.value = current?.vendor ?? '';
    populateLutPick(lutVendorSelect.value, selectedPath);
  };

  const applyLutSelection = async (path: string | null) => {
    if (!ctx) return;
    const token = ++lutLoadToken;
    applyingLut = true;
    if (lutVendorSelect) lutVendorSelect.disabled = true;
    if (lutPickSelect) lutPickSelect.disabled = true;
    setLutStatus(path ? 'Loading LUT…' : '');
    try {
      await applyGradeLutToPostFX(ctx.postFX, path, grade().lut.size, selectedStop);
      if (token !== lutLoadToken) return;
      if (path) {
        grade().lut.enabled = true;
        const el = panel.querySelector('#dev-tod-lut-enabled') as HTMLInputElement | null;
        if (el) el.checked = true;
        const entry = lutCatalog ? findLutByPath(lutCatalog, path) : undefined;
        setLutStatus(entry ? `Active: ${entry.id}` : 'LUT loaded');
      } else {
        setLutStatus('No LUT');
      }
    } catch (err) {
      if (token !== lutLoadToken) return;
      setLutStatus(err instanceof Error ? err.message : 'LUT load failed');
    } finally {
      if (token === lutLoadToken) {
        applyingLut = false;
        if (lutCatalog) populateVendors(grade().lut.path);
      }
    }
  };

  void fetchGradeLutCatalog()
    .then((manifest) => {
      lutCatalog = manifest;
      populateVendors(grade().lut.path);
    })
    .catch(() => setLutStatus('LUT catalog unavailable'));

  const disposers: Array<() => void> = [];

  const onStopChange = () => {
    selectedStop = stopSelect.value as TodStopId;
    if (ctx) {
      scrubToTodStop(selectedStop, ctx);
      syncDayCyclePanel(panel);
    }
    syncStopEditors();
    populateVendors(grade().lut.path);
    syncWeights();
  };
  stopSelect.addEventListener('change', onStopChange);

  _syncTodStopFromElevation = (elevationDeg: number) => {
    const stop = dominantTodStop(elevationDeg);
    if (stop === selectedStop) return;
    selectedStop = stop;
    stopSelect.value = stop;
    syncStopEditors();
    populateVendors(grade().lut.path);
    syncWeights();
  };

  // Shared clock
  disposers.push(
    bindRange(
      panel,
      CLOCK_SPECS.bandStart.id,
      `${CLOCK_SPECS.bandStart.id}-out`,
      CLOCK_SPECS.bandStart.format,
      (v) => {
        setTodBandDevOverride({ startElevationDeg: v });
        syncWeights();
      },
    ),
    bindRange(
      panel,
      CLOCK_SPECS.bandEnd.id,
      `${CLOCK_SPECS.bandEnd.id}-out`,
      CLOCK_SPECS.bandEnd.format,
      (v) => {
        setTodBandDevOverride({ endElevationDeg: v });
        syncWeights();
      },
    ),
    bindRange(
      panel,
      CLOCK_SPECS.bandPower.id,
      `${CLOCK_SPECS.bandPower.id}-out`,
      CLOCK_SPECS.bandPower.format,
      (v) => {
        setTodBandDevOverride({ power: v });
        syncWeights();
      },
    ),
    bindRange(
      panel,
      CLOCK_SPECS.peak.id,
      `${CLOCK_SPECS.peak.id}-out`,
      CLOCK_SPECS.peak.format,
      (v) => {
        setCycleDevOverride({ peakElevationDeg: v });
      },
    ),
    bindRange(
      panel,
      CLOCK_SPECS.duration.id,
      `${CLOCK_SPECS.duration.id}-out`,
      CLOCK_SPECS.duration.format,
      (v) => {
        setCycleDevOverride({ dayDurationSec: v });
      },
    ),
  );

  // Lighting
  for (const f of LIGHTING_FIELDS) {
    const spec = lightingSpecs.find((s) => s.id === `dev-tod-light-${f.key}`)!;
    disposers.push(
      bindRange(panel, spec.id, `${spec.id}-out`, spec.format, (v) => {
        setLightingStopDevOverride(selectedStop, { [f.key]: v });
      }),
    );
  }

  // Preetham
  disposers.push(
    bindColor(panel, 'dev-tod-preetham-tint', (hex) => {
      if (!ctx) return;
      pushDevSkyAtmosphereStopTint(ctx.sky, ctx.postFX, selectedStop, hex);
    }),
  );
  for (const f of PREETHAM_FIELDS) {
    const spec = preethamSpecs.find((s) => s.id === `dev-tod-preetham-${f.param}`)!;
    disposers.push(
      bindRange(panel, spec.id, `${spec.id}-out`, spec.format, (v) => {
        if (!ctx) return;
        pushDevSkyAtmosphereStopOverride(ctx.sky, ctx.postFX, selectedStop, f.param, v);
      }),
    );
  }

  // Grade
  disposers.push(
    bindCheckbox(
      panel,
      'dev-tod-grade-enabled',
      () => devSettings.postfx.grade.enabled,
      (v) => {
        devSettings.postfx.grade.enabled = v;
      },
    ),
  );
  disposers.push(
    bindColor(panel, 'dev-tod-grade-warmth-tint', (hex) => {
      grade().warmthTint = hex;
    }),
    bindRange(
      panel,
      gradeWarmthSpec.id,
      `${gradeWarmthSpec.id}-out`,
      gradeWarmthSpec.format,
      (v) => {
        grade().warmth = v;
      },
    ),
  );
  for (const region of GRADE_REGIONS) {
    for (const f of GRADE_REGION_NUM_FIELDS) {
      const spec = gradeRegionSpecs.find((s) => s.id === `dev-tod-grade-${region}-${f.key}`)!;
      disposers.push(
        bindRange(panel, spec.id, `${spec.id}-out`, spec.format, (v) => {
          grade()[region][f.key] = v;
        }),
      );
    }
    for (const ch of ['r', 'g', 'b'] as const) {
      const id = `dev-tod-grade-${region}-lift-${ch}`;
      disposers.push(
        bindRange(
          panel,
          id,
          `${id}-out`,
          (v) => v.toFixed(3),
          (v) => {
            grade()[region].lift[ch] = v;
          },
        ),
      );
    }
  }
  disposers.push(
    bindCheckbox(
      panel,
      'dev-tod-lut-enabled',
      () => grade().lut.enabled,
      (v) => {
        grade().lut.enabled = v;
      },
    ),
    bindRange(
      panel,
      'dev-tod-lut-strength',
      'dev-tod-lut-strength-out',
      (v) => v.toFixed(2),
      (v) => {
        grade().lut.strength = v;
      },
    ),
  );
  const onLutVendor = () => {
    populateLutPick(lutVendorSelect?.value ?? '', null);
  };
  const onLutPick = () => {
    void applyLutSelection(lutPickSelect?.value || null);
  };
  lutVendorSelect?.addEventListener('change', onLutVendor);
  lutPickSelect?.addEventListener('change', onLutPick);

  // Terrain palettes
  for (const biome of TERRAIN_ATLAS_BIOME_KEYS) {
    for (const ch of PALETTE_CHANNELS) {
      disposers.push(
        bindColor(panel, `dev-tod-terrain-${biome}-${ch}`, (hex) => {
          devSettings.terrain.stylize.biomes[biome][selectedStop][ch] = hex;
          devSettings.terrain.dirty = true;
        }),
      );
    }
  }

  // Bloom / godrays / haze / water / grass / shadows
  disposers.push(
    bindRange(panel, bloomSpec.id, `${bloomSpec.id}-out`, bloomSpec.format, (v) => {
      setBloomSceneWeightStop(selectedStop, v);
    }),
  );
  if (ctx) {
    disposers.push(
      bindColor(panel, 'dev-tod-godray-tint', (hex) => {
        const cur = ctx.postFX.getGodraysParams().tint;
        ctx.postFX.setGodraysParams({ tint: { ...cur, [selectedStop]: hex } });
      }),
      bindRange(panel, godraySpec.id, `${godraySpec.id}-out`, godraySpec.format, (v) => {
        const cur = ctx.postFX.getGodraysParams().weight;
        ctx.postFX.setGodraysParams({ weight: { ...cur, [selectedStop]: v } });
      }),
    );
  }
  disposers.push(
    bindColor(panel, 'dev-tod-haze-tint', (hex) => {
      setValleyFogLookStop(selectedStop, { tint: hex });
    }),
  );
  for (const f of HAZE_LOOK_FIELDS) {
    const spec = hazeLookSpecs.find((s) => s.id === `dev-tod-haze-${f.key}`)!;
    disposers.push(
      bindRange(panel, spec.id, `${spec.id}-out`, spec.format, (v) => {
        setValleyFogLookStop(selectedStop, { [f.key]: v });
      }),
    );
  }
  disposers.push(
    bindColor(panel, 'dev-tod-water-color', (hex) => {
      waterStop().waterColor = hex;
    }),
    bindColor(panel, 'dev-tod-water-sun', (hex) => {
      waterStop().sunColor = hex;
    }),
    bindColor(panel, 'dev-tod-water-shallow', (hex) => {
      waterStop().shallowColor = hex;
    }),
    bindRange(
      panel,
      'dev-tod-water-distortion',
      'dev-tod-water-distortion-out',
      (v) => v.toFixed(1),
      (v) => {
        waterStop().distortion = v;
      },
    ),
    bindColor(panel, 'dev-tod-grass-base-dark', (hex) => {
      grassColorStop().baseColorDark = hex;
    }),
    bindColor(panel, 'dev-tod-grass-base', (hex) => {
      grassColorStop().baseColor = hex;
    }),
    bindColor(panel, 'dev-tod-grass-tip', (hex) => {
      grassColorStop().tipColor = hex;
    }),
    bindColor(panel, 'dev-tod-grass-rust', (hex) => {
      grassColorStop().rustColor = hex;
    }),
    bindColor(panel, 'dev-tod-grass-warm', (hex) => {
      grassColorStop().warmColor = hex;
    }),
  );
  for (const p of SHADOW_PROFILES) {
    const spec = shadowSpecs.find((s) => s.id === `dev-tod-shadow-${p.id}`)!;
    disposers.push(
      bindRange(panel, spec.id, `${spec.id}-out`, spec.format, (v) => {
        setShadowFloorStop(p.id, selectedStop, v);
      }),
    );
  }

  const resetBtn = panel.querySelector('#dev-tod-reset') as HTMLButtonElement | null;
  const onReset = () => {
    resetTodBandDevOverride();
    resetLightingCurveDevOverride();
    resetBloomSceneWeightDevOverride();
    resetShadowFloorDevOverrides();
    resetPostFxGradeDev(devSettings.postfx.grade);
    resetValleyFogParams();
    devSettings.grass.colorStops = structuredClone(VISUAL.grass.colorStops);
    if (ctx) {
      ctx.postFX.resetGodraysParams();
    }
    syncAll();
    populateVendors(grade().lut.path);
  };
  resetBtn?.addEventListener('click', onReset);

  const unregisterLateTick = registerDevPanelLateTick(() => {
    if (!isDayCycleTimeFrozen()) syncWeights();
    else syncWeights();
  });

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
    stopSelect.removeEventListener('change', onStopChange);
    lutVendorSelect?.removeEventListener('change', onLutVendor);
    lutPickSelect?.removeEventListener('change', onLutPick);
    resetBtn?.removeEventListener('click', onReset);
  };
}
