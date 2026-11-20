// src/dev/panel/devPanelUnderwater.ts — live knobs for the water volume (DEV)
// Writes to `underwaterSettings`; `syncUnderwater` pushes it to the GPU every frame. Per-stop colours are colour pickers.
// The sea floor groups (kelp, motes) write into `VISUAL.underwater.seabed` like the Life section does: the motes read it
// every frame, the kelp numbers are pushed to the grass uniforms and the kelp patches re-bake the grass data map.

import { VISUAL } from '../../config/visualTuning';
import {
  resetUnderwaterSettings,
  type UnderwaterSettings,
  underwaterSettings,
} from '../../rendering/underwater/underwaterUniforms';
import { applyGrassKelpUniforms } from '../../world/grass/config/grassUniforms';
import type { GrassSystem } from '../../world/grass/core/GrassSystem';
import { buildConfigGroups, type ConfigGroup } from '../bindConfig';
import {
  bindCheckbox,
  bindSpecs,
  injectRangeRows,
  mountSection,
  type RangeSpec,
  subsectionHtml,
  syncSpecs,
} from '../bindRange';

type NumKey =
  | 'density'
  | 'deepM'
  | 'causticStrength'
  | 'causticScaleM'
  | 'causticSpeed'
  | 'causticWidth'
  | 'causticFadeM'
  | 'shaftStrength'
  | 'windowGlow'
  | 'windowEdgeCos'
  | 'windowEdgeSoft'
  | 'windowRipple'
  | 'rippleAmp'
  | 'rippleScale'
  | 'rippleSpeed'
  | 'orbTint';

interface UnderwaterSpec extends RangeSpec {
  key: NumKey;
}

const d = underwaterSettings;

function spec(
  key: NumKey,
  label: string,
  min: number,
  max: number,
  step: number,
  digits = 2,
): UnderwaterSpec {
  return {
    id: `dev-uw-${key}`,
    key,
    label,
    min,
    max,
    step,
    defaultValue: d[key],
    format: (v) => v.toFixed(digits),
  };
}

const FOG_SPECS = [
  spec('density', 'Fog density (1/m)', 0.01, 0.4, 0.005, 3),
  spec('deepM', 'Depth to deep colour (m)', 1, 30, 0.5, 1),
  spec('orbTint', 'Orb tint under water', 0, 1, 0.05),
];
const CAUSTIC_SPECS = [
  spec('causticStrength', 'Strength', 0, 6, 0.05),
  spec('causticScaleM', 'Feature size (m)', 0.5, 8, 0.1, 1),
  spec('causticSpeed', 'Speed', 0, 2, 0.05),
  spec('causticWidth', 'Line width', 0, 1, 0.01),
  spec('causticFadeM', 'Fade with depth (m)', 1, 40, 0.5, 1),
];
const SHAFT_SPECS = [spec('shaftStrength', 'Brightness', 0, 3, 0.05)];
const WINDOW_SPECS = [
  spec('windowGlow', 'Window brightness', 0, 3, 0.05),
  spec('windowEdgeCos', 'Window size (cos)', 0.3, 0.95, 0.01),
  spec('windowEdgeSoft', 'Window rim softness', 0.01, 0.4, 0.01),
  spec('windowRipple', 'Surface ripple bends the view', 0, 2, 0.05),
];
const RIPPLE_SPECS = [
  spec('rippleAmp', 'Wobble strength (UV)', 0, 0.02, 0.0005, 4),
  spec('rippleScale', 'Wobble wavelength (UV)', 0.03, 0.5, 0.01),
  spec('rippleSpeed', 'Wobble speed', 0, 4, 0.05),
];
const ALL_SPECS: UnderwaterSpec[] = [
  ...FOG_SPECS,
  ...CAUSTIC_SPECS,
  ...SHAFT_SPECS,
  ...WINDOW_SPECS,
  ...RIPPLE_SPECS,
];

const STOP_IDS = ['night', 'goldenHour', 'noon'] as const;
const STOP_LABELS = { night: 'Night', goldenHour: 'Golden hour', noon: 'Noon' } as const;

const SEABED = VISUAL.underwater.seabed;

/** The sea floor's numbers. The kelp is grass (`world/grass`), so its edits reach the grass system; `grass` is null in a scene without one. */
function seabedGroups(grass: GrassSystem | null): ConfigGroup[] {
  return [
    {
      title: 'Kelp',
      hint: 'Grass blades on the sea floor. Length and density change as the blades regrow (a few seconds).',
      root: SEABED.kelp,
      colors: [
        ['colorA', 'Root colour'],
        ['colorB', 'Tip colour'],
      ],
      rows: [
        ['density', 'Density (share of the grass blades)', 0, 0.4, 0.005, 3],
        ['heightM.0', 'Shortest blade (m)', 0.3, 2.25, 0.05],
        ['heightM.1', 'Longest blade (m)', 0.3, 2.25, 0.05],
        ['widthMul', 'Width (× the grass blade)', 0.5, 6, 0.1, 1],
        ['swayM', 'Sway (m)', 0, 2, 0.05],
        ['swayHz', 'Sway rate (Hz)', 0, 1, 0.01],
      ],
      onChange: () => {
        applyGrassKelpUniforms();
        grass?.requestCompactPass();
      },
    },
    {
      title: 'Kelp patches',
      hint: 'Where it grows. Baked into the grass data map: applied when you let go of a slider, then the whole map is baked again (a moment).',
      root: SEABED.kelp,
      rows: [
        ['depthM.0', 'Shallowest (m of water)', 0, 6, 0.1, 1],
        ['depthM.1', 'Deepest (m of water)', 4, 25, 0.5, 1],
        ['patchM', 'Patch size (m)', 4, 60, 1, 0],
        ['patchShare', 'Share of the sea floor', 0.05, 1, 0.01],
      ],
      commit: 'release',
      onChange: () => {
        grass?.refreshGrassDataMap();
        grass?.requestCompactPass();
      },
    },
    {
      title: 'Motes',
      hint: 'Specks adrift in the water. Their count and shape are built once: reload. Rocks are placed at load as map props: edit `seabed.rocks` in config/visual/underwater.ts and reload.',
      root: SEABED.motes,
      colors: [
        ['colorA', 'Colour A'],
        ['colorB', 'Colour B'],
      ],
      rows: [
        ['alpha', 'Opacity', 0, 1, 0.01],
        ['sizeM.0', 'Smallest (m)', 0.005, 0.15, 0.005, 3],
        ['sizeM.1', 'Largest (m)', 0.005, 0.2, 0.005, 3],
        ['nightMul', 'Brightness at night', 0, 1, 0.01],
        ['boxM', 'Box (m)', 8, 60, 1, 0],
        ['heightM', 'Height of the box (m)', 2, 30, 0.5, 1],
        ['windMps', 'Carried (m/s)', 0, 1, 0.01],
        ['fallMps', 'Fall (m/s)', 0, 0.5, 0.005, 3],
        ['wobbleM', 'Wobble (m)', 0, 2, 0.05],
        ['wobbleHz', 'Wobble rate (Hz)', 0, 1, 0.01],
      ],
    },
  ];
}

function colorRowsHtml(): string {
  return STOP_IDS.map(
    (id) => `
      <label class="dev-row">
        <span>${STOP_LABELS[id]}: shallow / deep</span>
        <input type="color" id="dev-uw-${id}-shallow" value="${d.stops[id].shallow}" />
        <input type="color" id="dev-uw-${id}-deep" value="${d.stops[id].deep}" />
      </label>`,
  ).join('');
}

function syncUi(panel: HTMLDivElement): void {
  syncSpecs(panel, ALL_SPECS, (s) => d[s.key]);
  const enabled = panel.querySelector('#dev-uw-enabled') as HTMLInputElement | null;
  if (enabled) enabled.checked = d.enabled;
  for (const id of STOP_IDS) {
    for (const part of ['shallow', 'deep'] as const) {
      const el = panel.querySelector(`#dev-uw-${id}-${part}`) as HTMLInputElement | null;
      if (el) el.value = d.stops[id][part];
    }
  }
}

export function initDevPanelUnderwater(
  panel: HTMLDivElement,
  grass: GrassSystem | null = null,
): () => void {
  const seabed = buildConfigGroups('dev-uw-seabed', SEABED, seabedGroups(grass));
  const body = mountSection(panel, {
    hostId: 'dev-section-underwater',
    title: 'Underwater',
    open: false,
    body: `
      <p class="dev-hint">The water volume: fog along the part of a view ray under the surface (tints the sea floor you see through the surface, and everything when the camera is under), caustics on sunlit ground under water, the surface seen from below as a refracted window onto the world above plus a water-coloured ceiling, and a screen wobble while the camera is under. Move the orb into the sea to see it; Water → Shore depth sets how far down the surface lets the floor show.</p>
      <label class="dev-row dev-row-check">
        <span>Underwater enabled</span>
        <input type="checkbox" id="dev-uw-enabled" />
      </label>
      <div id="dev-uw-fog"></div>
      ${subsectionHtml('Caustics', '<div id="dev-uw-caustics"></div>')}
      ${subsectionHtml('Light shafts', '<div id="dev-uw-shafts"></div>')}
      ${subsectionHtml('Surface from below', '<div id="dev-uw-window"></div>')}
      ${subsectionHtml('Underwater wobble', '<div id="dev-uw-ripple"></div>')}
      ${subsectionHtml('Colours', colorRowsHtml())}
      ${seabed.html}
      <div class="dev-actions">
        <button type="button" id="dev-uw-reset">Reset underwater</button>
      </div>
    `,
  });
  if (!body) return () => {};

  const hostFog = panel.querySelector('#dev-uw-fog');
  if (hostFog) injectRangeRows(hostFog, FOG_SPECS);
  const hostCaustics = panel.querySelector('#dev-uw-caustics');
  if (hostCaustics) injectRangeRows(hostCaustics, CAUSTIC_SPECS);
  const hostShafts = panel.querySelector('#dev-uw-shafts');
  if (hostShafts) injectRangeRows(hostShafts, SHAFT_SPECS);
  const hostWindow = panel.querySelector('#dev-uw-window');
  if (hostWindow) injectRangeRows(hostWindow, WINDOW_SPECS);
  const hostRipple = panel.querySelector('#dev-uw-ripple');
  if (hostRipple) injectRangeRows(hostRipple, RIPPLE_SPECS);
  syncUi(panel);

  const disposers: Array<() => void> = [seabed.bind(panel)];
  disposers.push(
    ...bindSpecs(panel, ALL_SPECS, (s, v) => {
      (d as UnderwaterSettings)[s.key] = v;
    }),
  );
  disposers.push(
    bindCheckbox(
      panel,
      'dev-uw-enabled',
      () => d.enabled,
      (v) => {
        d.enabled = v;
      },
    ),
  );
  const colorHandlers: Array<[HTMLInputElement, () => void]> = [];
  for (const id of STOP_IDS) {
    for (const part of ['shallow', 'deep'] as const) {
      const el = panel.querySelector(`#dev-uw-${id}-${part}`) as HTMLInputElement | null;
      if (!el) continue;
      const on = () => {
        d.stops[id][part] = el.value;
      };
      el.addEventListener('input', on);
      colorHandlers.push([el, on]);
    }
  }
  const resetBtn = panel.querySelector('#dev-uw-reset') as HTMLButtonElement | null;
  const onReset = () => {
    resetUnderwaterSettings();
    seabed.reset(panel);
    syncUi(panel);
  };
  resetBtn?.addEventListener('click', onReset);

  return () => {
    for (const fn of disposers) fn();
    for (const [el, on] of colorHandlers) el.removeEventListener('input', on);
    resetBtn?.removeEventListener('click', onReset);
  };
}
