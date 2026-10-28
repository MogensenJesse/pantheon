// src/dev/panel/tod/todLightEditor.ts — Time-of-day stop editor: lighting, light colours, twilight afterglow, Preetham sky
import { VISUAL } from '../../../config/visualTuning';
import {
  getSkyAfterglowTune,
  resetSkyAfterglowDevOverride,
  setSkyAfterglowDevOverride,
} from '../../../rendering/atmosphere/skyAfterglowTsl';
import {
  getActiveLightingStop,
  resetLightingCurveDevOverride,
  setLightingStopDevOverride,
} from '../../../rendering/sky/lightingCurves';
import type { SkyAtmosphereScalars } from '../../../rendering/sky/skyDefaults';
import { getActiveSkyAtmosphereStop } from '../../../rendering/sky/skyDevOverrides';
import {
  getActiveTodLightPaletteStop,
  resetTodLightPaletteDevOverride,
  setTodLightPaletteDevOverride,
  type TodLightPaletteStop,
} from '../../../rendering/tod/todLightPalette';
import {
  bindColor,
  bindRange,
  injectRangeRows,
  type RangeSpec,
  subsectionHtml,
  syncColor,
  syncSlider,
} from '../../bindRange';
import {
  pushDevSkyAtmosphereStopOverride,
  pushDevSkyAtmosphereStopTint,
} from '../sky/devPanelSkyShared';
import type { TodEditor, TodEditorEnv } from './todEditor';

const LIGHTING_FIELDS = [
  {
    key: 'daylightFactor' as const,
    label: 'Daylight (grass/water/clouds)',
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

type AfterglowRangeKey =
  | 'strength'
  | 'startDeg'
  | 'peakDeg'
  | 'endDeg'
  | 'bandHeight'
  | 'sunSidePower'
  | 'antiSunStrength';

const AFTERGLOW_SPECS: readonly { key: AfterglowRangeKey; spec: RangeSpec }[] = [
  {
    key: 'strength',
    spec: {
      id: 'dev-afterglow-strength',
      label: 'Strength',
      min: 0,
      max: 1.5,
      step: 0.01,
      defaultValue: VISUAL.sky.afterglow.strength,
      format: (v) => v.toFixed(2),
    },
  },
  {
    key: 'startDeg',
    spec: {
      id: 'dev-afterglow-startDeg',
      label: 'Start (sun °)',
      min: -2,
      max: 6,
      step: 0.1,
      defaultValue: VISUAL.sky.afterglow.startDeg,
      format: (v) => v.toFixed(1),
    },
  },
  {
    key: 'peakDeg',
    spec: {
      id: 'dev-afterglow-peakDeg',
      label: 'Peak (sun °)',
      min: -6,
      max: 2,
      step: 0.1,
      defaultValue: VISUAL.sky.afterglow.peakDeg,
      format: (v) => v.toFixed(1),
    },
  },
  {
    key: 'endDeg',
    spec: {
      id: 'dev-afterglow-endDeg',
      label: 'End (sun °)',
      min: -12,
      max: -1,
      step: 0.1,
      defaultValue: VISUAL.sky.afterglow.endDeg,
      format: (v) => v.toFixed(1),
    },
  },
  {
    key: 'bandHeight',
    spec: {
      id: 'dev-afterglow-bandHeight',
      label: 'Band height',
      min: 0.02,
      max: 1,
      step: 0.01,
      defaultValue: VISUAL.sky.afterglow.bandHeight,
      format: (v) => v.toFixed(2),
    },
  },
  {
    key: 'sunSidePower',
    spec: {
      id: 'dev-afterglow-sunSidePower',
      label: 'Sun-side tightness',
      min: 0.25,
      max: 8,
      step: 0.05,
      defaultValue: VISUAL.sky.afterglow.sunSidePower,
      format: (v) => v.toFixed(2),
    },
  },
  {
    key: 'antiSunStrength',
    spec: {
      id: 'dev-afterglow-antiSunStrength',
      label: 'Opposite strength',
      min: 0,
      max: 1.5,
      step: 0.01,
      defaultValue: VISUAL.sky.afterglow.antiSunStrength,
      format: (v) => v.toFixed(2),
    },
  },
];

const LIGHT_PALETTE_FIELDS: readonly { key: keyof TodLightPaletteStop; label: string }[] = [
  { key: 'sun', label: 'Sun (key)' },
  { key: 'ambient', label: 'Ambient (fill)' },
  { key: 'foliageSky', label: 'Foliage sky' },
  { key: 'foliageGround', label: 'Foliage ground' },
];

const LIGHTING_SPECS = LIGHTING_FIELDS.map((f) => ({
  key: f.key,
  spec: {
    id: `dev-tod-light-${f.key}`,
    label: f.label,
    min: f.min,
    max: f.max,
    step: f.step,
    defaultValue: VISUAL.sky.lighting.goldenHour[f.key],
    format: (v: number) => v.toFixed(2),
  } satisfies RangeSpec,
}));

const PREETHAM_SPECS = PREETHAM_FIELDS.map((f) => ({
  param: f.param,
  spec: {
    id: `dev-tod-preetham-${f.param}`,
    label: f.label,
    min: f.min,
    max: f.max,
    step: f.step,
    defaultValue: VISUAL.sky.goldenHour[f.param],
    format: (v: number) => (f.step < 0.01 ? v.toFixed(3) : v.toFixed(1)),
  } satisfies RangeSpec,
}));

/** The markup of the lighting, light & foliage, afterglow and Preetham subsections. */
export function todLightHtml(): string {
  return [
    subsectionHtml(
      'Lighting',
      `<p class="dev-hint">Stop values blend at the current scrub elevation. Sun/ambient/daylight push every frame (works while scrub is locked).</p>
        <div id="dev-tod-lighting-rows"></div>`,
      true,
    ),
    subsectionHtml(
      'Light &amp; foliage',
      `<p class="dev-hint">Key (sun) / fill (ambient) light colors and foliage hemisphere tints for the selected stop. Terrain + grass use the light colors directly; props use them relative to <code>sky.lightColorReference</code>.</p>
        ${LIGHT_PALETTE_FIELDS.map((f) => `<label class="dev-row"><span>${f.label}</span><input type="color" id="dev-tod-light-${f.key}" /></label>`).join('')}`,
      true,
    ),
    subsectionHtml(
      'Twilight afterglow',
      `<p class="dev-hint">Shared (not per stop). Additive horizon glow while the sun is just below the horizon; warm toward the sun, rose opposite.</p>
        <label class="dev-row"><span>Sun-side color</span><input type="color" id="dev-afterglow-sun-color" /></label>
        <label class="dev-row"><span>Opposite color</span><input type="color" id="dev-afterglow-anti-color" /></label>
        <div id="dev-afterglow-rows"></div>`,
    ),
    subsectionHtml(
      'Preetham',
      `<label class="dev-row"><span>Sky tint</span><input type="color" id="dev-tod-preetham-tint" /></label>
        <div id="dev-tod-preetham-rows"></div>`,
    ),
  ].join('');
}

export function createTodLightEditor(env: TodEditorEnv): TodEditor {
  const { panel, body, ctx, stop } = env;

  injectRangeRows(
    body.querySelector('#dev-afterglow-rows')!,
    AFTERGLOW_SPECS.map((a) => a.spec),
  );
  injectRangeRows(
    body.querySelector('#dev-tod-lighting-rows')!,
    LIGHTING_SPECS.map((l) => l.spec),
  );
  injectRangeRows(
    body.querySelector('#dev-tod-preetham-rows')!,
    PREETHAM_SPECS.map((p) => p.spec),
  );

  const disposers: Array<() => void> = [];

  for (const { key, spec } of LIGHTING_SPECS) {
    disposers.push(
      bindRange(panel, spec.id, `${spec.id}-out`, spec.format, (v) => {
        setLightingStopDevOverride(stop(), { [key]: v });
      }),
    );
  }

  disposers.push(
    bindColor(panel, 'dev-tod-preetham-tint', (hex) => {
      if (!ctx) return;
      pushDevSkyAtmosphereStopTint(ctx.sky, ctx.postFX, stop(), hex);
    }),
  );
  for (const { param, spec } of PREETHAM_SPECS) {
    disposers.push(
      bindRange(panel, spec.id, `${spec.id}-out`, spec.format, (v) => {
        if (!ctx) return;
        pushDevSkyAtmosphereStopOverride(ctx.sky, ctx.postFX, stop(), param, v);
      }),
    );
  }

  for (const a of AFTERGLOW_SPECS) {
    disposers.push(
      bindRange(panel, a.spec.id, `${a.spec.id}-out`, a.spec.format, (v) => {
        setSkyAfterglowDevOverride({ [a.key]: v });
      }),
    );
  }
  disposers.push(
    bindColor(panel, 'dev-afterglow-sun-color', (hex) => {
      setSkyAfterglowDevOverride({ sunSideColor: hex });
    }),
    bindColor(panel, 'dev-afterglow-anti-color', (hex) => {
      setSkyAfterglowDevOverride({ antiSunColor: hex });
    }),
  );

  for (const f of LIGHT_PALETTE_FIELDS) {
    disposers.push(
      bindColor(panel, `dev-tod-light-${f.key}`, (hex) => {
        setTodLightPaletteDevOverride(stop(), { [f.key]: hex });
      }),
    );
  }

  return {
    sync: () => {
      const lighting = getActiveLightingStop(stop());
      for (const { key, spec } of LIGHTING_SPECS) {
        syncSlider(panel, spec.id, `${spec.id}-out`, lighting[key], spec.format);
      }
      const atm = getActiveSkyAtmosphereStop(stop());
      syncColor(panel, 'dev-tod-preetham-tint', atm.tint);
      for (const { param, spec } of PREETHAM_SPECS) {
        syncSlider(panel, spec.id, `${spec.id}-out`, atm[param], spec.format);
      }
      const glow = getSkyAfterglowTune();
      for (const a of AFTERGLOW_SPECS) {
        syncSlider(panel, a.spec.id, `${a.spec.id}-out`, glow[a.key], a.spec.format);
      }
      syncColor(panel, 'dev-afterglow-sun-color', glow.sunSideColor);
      syncColor(panel, 'dev-afterglow-anti-color', glow.antiSunColor);
      const lightPal = getActiveTodLightPaletteStop(stop());
      for (const f of LIGHT_PALETTE_FIELDS) {
        syncColor(panel, `dev-tod-light-${f.key}`, lightPal[f.key]);
      }
    },
    reset: () => {
      resetLightingCurveDevOverride();
      resetTodLightPaletteDevOverride();
      resetSkyAfterglowDevOverride();
    },
    dispose: () => {
      for (const fn of disposers) fn();
    },
  };
}
