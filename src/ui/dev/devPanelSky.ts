// src/ui/dev/devPanelSky.ts — live Preetham sky + reveal tuning (DEV)
import { VISUAL } from '../../config/visualTuning';
import { SUN_REVEAL } from '../../rendering/skyDefaults';
import { clearSkyDevOverrides, setSkyDevOverride } from '../../rendering/skyDevOverrides';
import { applySkyForReveal, blendSkyForReveal } from '../../rendering/skyRevealBlend';
import type { SkyRevealAtmosphere } from '../../rendering/skyDefaults';
import { getSunRevealProgress, isSunRevealDone } from '../../rendering/WorldReveal';
import { resetSunDevState, sunDevState } from '../../rendering/sunDevState';
import type { PostFXContext } from '../../rendering/PostFX';
import type { SkySystemContext } from '../../rendering/SkySystem';
import { nightHdriWeightForGameState } from '../../rendering/nightHdriBlend';
import {
  bindRange,
  injectRangeRows,
  mountSection,
  rangeRowHtml,
  syncSpecs,
  type RangeSpec,
} from './bindRange';

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;

const NIGHT_HDRI = VISUAL.sky.nightHdri;

type SkyParamKey = keyof Pick<
  NonNullable<Parameters<SkySystemContext['setSkyParams']>[0]>,
  | 'turbidity'
  | 'rayleigh'
  | 'mieCoefficient'
  | 'mieDirectionalG'
  | 'fogDensity'
  | 'cloudCoverage'
  | 'cloudDensity'
  | 'cloudElevation'
  | 'showSunDisc'
>;

interface SkyRangeSpec extends RangeSpec {
  param: SkyParamKey;
}

const ATMOSPHERE_SPECS: SkyRangeSpec[] = [
  {
    id: 'dev-sky-turbidity',
    label: 'Turbidity',
    min: 0,
    max: 20,
    step: 0.1,
    defaultValue: VISUAL.sky.day.turbidity,
    format: (v) => v.toFixed(1),
    param: 'turbidity',
  },
  {
    id: 'dev-sky-rayleigh',
    label: 'Rayleigh',
    min: 0,
    max: 4,
    step: 0.001,
    defaultValue: VISUAL.sky.day.rayleigh,
    format: (v) => v.toFixed(3),
    param: 'rayleigh',
  },
  {
    id: 'dev-sky-mie-coeff',
    label: 'Mie coefficient',
    min: 0,
    max: 0.1,
    step: 0.001,
    defaultValue: VISUAL.sky.day.mieCoefficient,
    format: (v) => v.toFixed(3),
    param: 'mieCoefficient',
  },
  {
    id: 'dev-sky-mie-g',
    label: 'Mie directional G',
    min: 0,
    max: 1,
    step: 0.001,
    defaultValue: VISUAL.sky.day.mieDirectionalG,
    format: (v) => v.toFixed(3),
    param: 'mieDirectionalG',
  },
];

const AZIMUTH_SPEC: RangeSpec = {
  id: 'dev-sun-azimuth',
  label: 'Azimuth',
  min: -180,
  max: 180,
  step: 0.1,
  defaultValue: VISUAL.sky.sun.azimuthDeg,
  format: (v) => v.toFixed(1),
};

const EXPOSURE_SPEC: RangeSpec = {
  id: 'dev-sky-exposure',
  label: 'Exposure (AgX)',
  min: 0,
  max: 1,
  step: 0.0001,
  defaultValue: VISUAL.render.toneMappingExposure,
  format: (v) => v.toFixed(4),
};

const CLOUD_SPECS: SkyRangeSpec[] = [
  {
    id: 'dev-sky-cloud-coverage',
    label: 'Coverage',
    min: 0,
    max: 1,
    step: 0.01,
    defaultValue: VISUAL.sky.day.cloudCoverage,
    format: (v) => v.toFixed(2),
    param: 'cloudCoverage',
  },
  {
    id: 'dev-sky-cloud-density',
    label: 'Density',
    min: 0,
    max: 1,
    step: 0.01,
    defaultValue: VISUAL.sky.static.cloudDensity,
    format: (v) => v.toFixed(2),
    param: 'cloudDensity',
  },
  {
    id: 'dev-sky-cloud-elevation',
    label: 'Elevation',
    min: 0,
    max: 1,
    step: 0.01,
    defaultValue: VISUAL.sky.static.cloudElevation,
    format: (v) => v.toFixed(2),
    param: 'cloudElevation',
  },
];

const HDRI_INTENSITY_SPEC: RangeSpec = {
  id: 'dev-hdri-intensity',
  label: 'HDRI intensity',
  min: 0,
  max: 3,
  step: 0.01,
  defaultValue: NIGHT_HDRI.intensity,
  format: (v) => v.toFixed(2),
};

const HDRI_ROTATION_SPEC: RangeSpec = {
  id: 'dev-hdri-rotation',
  label: 'HDRI rotation Y (°)',
  min: -180,
  max: 180,
  step: 1,
  defaultValue: NIGHT_HDRI.rotationY * RAD2DEG,
  format: (v) => String(Math.round(v)),
};

const HDRI_FADE_START_SPEC: RangeSpec = {
  id: 'dev-hdri-fade-start',
  label: 'HDRI full at/below (°)',
  min: -30,
  max: 30,
  step: 0.5,
  defaultValue: NIGHT_HDRI.fadeElevationStart,
  format: (v) => v.toFixed(1),
};

const HDRI_FADE_END_SPEC: RangeSpec = {
  id: 'dev-hdri-fade-end',
  label: 'HDRI off at/above (°)',
  min: SUN_REVEAL.elevationNight + 0.5,
  max: SUN_REVEAL.elevationDay + 15,
  step: 0.5,
  defaultValue: NIGHT_HDRI.fadeElevationEnd,
  format: (v) => v.toFixed(1),
};

const HDRI_SPECS = [HDRI_INTENSITY_SPEC, HDRI_ROTATION_SPEC, HDRI_FADE_START_SPEC, HDRI_FADE_END_SPEC];

const FOG_SPEC: SkyRangeSpec = {
  id: 'dev-sky-fog-density',
  label: 'Aerial fog (game)',
  min: 0,
  max: 0.003,
  step: 0.0001,
  defaultValue: VISUAL.sky.static.fogDensity,
  format: (v) => v.toFixed(4),
  param: 'fogDensity',
};

function revealTForPanel(): number {
  const t = getSunRevealProgress();
  if (t !== null) return t;
  return isSunRevealDone() ? 1 : 0;
}

function syncHdriSpecs(panel: HTMLDivElement, sky: SkySystemContext): void {
  if (!sky.hasNightHdri) return;
  const h = sky.getNightHdriTuning();
  syncSpecs(panel, HDRI_SPECS, (s) => {
    if (s.id === HDRI_INTENSITY_SPEC.id) return h.intensity;
    if (s.id === HDRI_ROTATION_SPEC.id) return h.rotationY * RAD2DEG;
    if (s.id === HDRI_FADE_START_SPEC.id) return h.fadeElevationStart;
    if (s.id === HDRI_FADE_END_SPEC.id) return h.fadeElevationEnd;
    return 0;
  });
}

function syncPanelFromReveal(panel: HTMLDivElement, t: number, sky: SkySystemContext): void {
  const params = blendSkyForReveal(t);
  syncSpecs(panel, [...ATMOSPHERE_SPECS, AZIMUTH_SPEC, EXPOSURE_SPEC, ...CLOUD_SPECS, FOG_SPEC], (s) => {
    if (s.id === EXPOSURE_SPEC.id) return params.exposure;
    if (s.id === AZIMUTH_SPEC.id) return sunDevState.azimuthDeg;
    const key = (s as SkyRangeSpec).param;
    return params[key as keyof SkyRevealAtmosphere] as number;
  });
  syncHdriSpecs(panel, sky);
}

function pushDevSkyOverride<K extends keyof SkyRevealAtmosphere>(
  sky: SkySystemContext,
  postFX: PostFXContext,
  key: K,
  value: SkyRevealAtmosphere[K],
): void {
  setSkyDevOverride(key, value);
  applySkyForReveal(sky, postFX, revealTForPanel());
}

export function initDevPanelSky(
  panel: HTMLDivElement,
  sky: SkySystemContext,
  postFX: PostFXContext,
): () => void {
  const body = mountSection(panel, {
    hostId: 'dev-section-sky',
    title: 'Sky &amp; atmosphere',
    open: false,
    body: `
      <p class="dev-hint">Preetham sky — live. Sun elevation: energy reveal −5° → 5° over ${SUN_REVEAL.revealDuration}s. Tonemap: AgX.</p>
      ${ATMOSPHERE_SPECS.map(rangeRowHtml).join('')}
      ${rangeRowHtml(AZIMUTH_SPEC)}
      ${rangeRowHtml(EXPOSURE_SPEC)}
      <details class="dev-subsection" id="dev-sky-hdri-subsection">
        <summary>Night HDRI</summary>
        <div class="dev-section-body" id="dev-sky-hdri-rows"></div>
        <p class="dev-hint">HDRI fade uses sun elevation (reveal ${SUN_REVEAL.elevationNight}° → ${SUN_REVEAL.elevationDay}°). &quot;Off at/above&quot; above day keeps EXR partially visible at cap. Log night HDRI in Debug.</p>
      </details>
      <label class="dev-row dev-row-check">
        <span>Show sun disc</span>
        <input type="checkbox" id="dev-sky-show-sun-disc" checked />
      </label>
      <details class="dev-subsection">
        <summary>Clouds (SkyMesh)</summary>
        <div class="dev-section-body" id="dev-sky-cloud-rows"></div>
      </details>
      <p class="dev-hint">Game-only — official example has no terrain fog.</p>
      <div id="dev-sky-fog-row"></div>
      <div class="dev-actions">
        <button type="button" id="dev-sky-reset">Reset sky</button>
      </div>
    `,
  });
  if (!body) return () => {};

  const hdriSubsection = panel.querySelector('#dev-sky-hdri-subsection') as HTMLDetailsElement | null;
  const hdriHost = panel.querySelector('#dev-sky-hdri-rows');
  if (sky.hasNightHdri && hdriHost) {
    injectRangeRows(hdriHost, HDRI_SPECS);
  } else if (hdriSubsection) {
    hdriSubsection.hidden = true;
  }

  const cloudHost = panel.querySelector('#dev-sky-cloud-rows');
  if (cloudHost) injectRangeRows(cloudHost, CLOUD_SPECS);
  const fogHost = panel.querySelector('#dev-sky-fog-row');
  if (fogHost) injectRangeRows(fogHost, [FOG_SPEC]);

  const disposers: Array<() => void> = [];

  for (const s of ATMOSPHERE_SPECS) {
    disposers.push(
      bindRange(panel, s.id, `${s.id}-out`, s.format, (v) => {
        pushDevSkyOverride(sky, postFX, s.param, v);
      }),
    );
  }

  disposers.push(
    bindRange(panel, AZIMUTH_SPEC.id, `${AZIMUTH_SPEC.id}-out`, AZIMUTH_SPEC.format, (v) => {
      sunDevState.azimuthDeg = v;
    }),
  );
  disposers.push(
    bindRange(panel, EXPOSURE_SPEC.id, `${EXPOSURE_SPEC.id}-out`, EXPOSURE_SPEC.format, (v) => {
      pushDevSkyOverride(sky, postFX, 'exposure', v);
    }),
  );

  if (sky.hasNightHdri) {
    disposers.push(
      bindRange(panel, HDRI_INTENSITY_SPEC.id, `${HDRI_INTENSITY_SPEC.id}-out`, HDRI_INTENSITY_SPEC.format, (v) => {
        sky.setNightHdriTuning({ intensity: v });
        sky.setNightHdriWeight(nightHdriWeightForGameState());
      }),
    );
    disposers.push(
      bindRange(panel, HDRI_ROTATION_SPEC.id, `${HDRI_ROTATION_SPEC.id}-out`, HDRI_ROTATION_SPEC.format, (v) => {
        sky.setNightHdriTuning({ rotationY: v * DEG2RAD });
      }),
    );
    disposers.push(
      bindRange(panel, HDRI_FADE_START_SPEC.id, `${HDRI_FADE_START_SPEC.id}-out`, HDRI_FADE_START_SPEC.format, (v) => {
        sky.setNightHdriTuning({ fadeElevationStart: v });
        sky.setNightHdriWeight(nightHdriWeightForGameState());
      }),
    );
    disposers.push(
      bindRange(panel, HDRI_FADE_END_SPEC.id, `${HDRI_FADE_END_SPEC.id}-out`, HDRI_FADE_END_SPEC.format, (v) => {
        sky.setNightHdriTuning({ fadeElevationEnd: v });
        sky.setNightHdriWeight(nightHdriWeightForGameState());
      }),
    );
  }

  for (const s of CLOUD_SPECS) {
    disposers.push(
      bindRange(panel, s.id, `${s.id}-out`, s.format, (v) => {
        pushDevSkyOverride(sky, postFX, s.param, v);
      }),
    );
  }

  disposers.push(
    bindRange(panel, FOG_SPEC.id, `${FOG_SPEC.id}-out`, FOG_SPEC.format, (v) => {
      pushDevSkyOverride(sky, postFX, FOG_SPEC.param, v);
    }),
  );

  const showDisc = panel.querySelector('#dev-sky-show-sun-disc') as HTMLInputElement;
  showDisc.checked = VISUAL.sky.static.showSunDisc > 0;
  const onDiscChange = () => {
    pushDevSkyOverride(sky, postFX, 'showSunDisc', showDisc.checked ? 1 : 0);
  };
  showDisc.addEventListener('change', onDiscChange);

  syncPanelFromReveal(panel, revealTForPanel(), sky);

  const resetBtn = panel.querySelector('#dev-sky-reset') as HTMLButtonElement | null;
  const onReset = () => {
    resetSunDevState();
    clearSkyDevOverrides();
    if (sky.hasNightHdri) {
      sky.resetNightHdriTuning();
      sky.setNightHdriWeight(nightHdriWeightForGameState());
    }
    const t = revealTForPanel();
    applySkyForReveal(sky, postFX, t);
    syncPanelFromReveal(panel, t, sky);
    showDisc.checked = VISUAL.sky.static.showSunDisc > 0;
  };
  resetBtn?.addEventListener('click', onReset);

  return () => {
    for (const fn of disposers) fn();
    showDisc.removeEventListener('change', onDiscChange);
    resetBtn?.removeEventListener('click', onReset);
  };
}
