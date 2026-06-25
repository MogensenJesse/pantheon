// src/ui/dev/devPanelShadows.ts — live sun shadow map + per-receiver floor tuning (DEV)
import type { DirectionalLight } from 'three';
import { VISUAL } from '../../config/visualTuning';
import {
  readSunShadowMapSize,
  setShadowFloor,
  setSunShadowMapSize,
  shadowFloorForProfile,
  type SunShadowDebugTargets,
  type SunShadowReceiverProfile,
} from '../../rendering/sunShadow';
import type { TerrainSplatMaterial } from '../../world/terrain';
import { propShadowUniforms } from '../../world/mapProps/mapPropShadowUniforms';
import { syncPropLeafAlphaTest } from '../../world/mapProps/mapPropMaterial';
import {
  bindCheckbox,
  bindRange,
  injectRangeRows,
  mountSection,
  syncSlider,
  type RangeSpec,
} from './bindRange';

const L = VISUAL.shadows.lighting;
const R = VISUAL.shadows.receivers;

const SHADOW_MAP_SIZE_OPTIONS = [512, 1024, 2048, 4096, 8192] as const;

export interface DevPanelShadowContext {
  sun: DirectionalLight;
  sunShadowDebugTargets: SunShadowDebugTargets;
  terrainMaterial?: TerrainSplatMaterial;
}

interface CastSpec extends RangeSpec {
  apply: (sun: DirectionalLight, value: number) => void;
  read: (sun: DirectionalLight) => number;
}

const CAST_SPECS: CastSpec[] = [
  {
    id: 'dev-shadow-softness',
    label: 'PCF radius (texels)',
    min: 0,
    max: 12,
    step: 0.25,
    defaultValue: L.shadowSoftness,
    format: (v) => v.toFixed(1),
    apply: (sun, v) => {
      sun.shadow.radius = v;
    },
    read: (sun) => sun.shadow.radius,
  },
  {
    id: 'dev-shadow-bias',
    label: 'Depth bias',
    min: -0.005,
    max: 0.001,
    step: 0.00005,
    defaultValue: L.shadowBias,
    format: (v) => v.toFixed(5),
    apply: (sun, v) => {
      sun.shadow.bias = v;
    },
    read: (sun) => sun.shadow.bias,
  },
  {
    id: 'dev-shadow-normal-bias',
    label: 'Normal bias',
    min: 0,
    max: 0.1,
    step: 0.001,
    defaultValue: L.shadowNormalBias,
    format: (v) => v.toFixed(3),
    apply: (sun, v) => {
      sun.shadow.normalBias = v;
    },
    read: (sun) => sun.shadow.normalBias,
  },
];

interface FloorSpec extends RangeSpec {
  profile: SunShadowReceiverProfile;
}

const FLOOR_SPECS: FloorSpec[] = [
  {
    id: 'dev-shadow-floor-terrain',
    label: 'Terrain floor',
    min: 0,
    max: 1,
    step: 0.01,
    defaultValue: R.terrain.shadowFloor,
    format: (v) => v.toFixed(2),
    profile: 'terrain',
  },
  {
    id: 'dev-shadow-floor-grass',
    label: 'Grass floor',
    min: 0,
    max: 1,
    step: 0.01,
    defaultValue: R.grass.shadowFloor,
    format: (v) => v.toFixed(2),
    profile: 'grass',
  },
  {
    id: 'dev-shadow-floor-props',
    label: 'Props floor',
    min: 0,
    max: 1,
    step: 0.01,
    defaultValue: R.props.shadowFloor,
    format: (v) => v.toFixed(2),
    profile: 'props',
  },
  {
    id: 'dev-shadow-floor-water',
    label: 'Water floor',
    min: 0,
    max: 1,
    step: 0.01,
    defaultValue: R.water.shadowFloor,
    format: (v) => v.toFixed(2),
    profile: 'water',
  },
];

interface PropSpec extends RangeSpec {
  key: keyof Pick<
    typeof R.props,
    'shadowStrength' | 'shadowSmoothMin' | 'shadowSmoothMax'
  > | 'alphaTest' | 'alphaCutoffSharpness';
}

const PROP_SPECS: PropSpec[] = [
  {
    id: 'dev-shadow-prop-strength',
    label: 'Shadow strength',
    min: 0,
    max: 1,
    step: 0.01,
    defaultValue: R.props.shadowStrength,
    format: (v) => v.toFixed(2),
    key: 'shadowStrength',
  },
  {
    id: 'dev-shadow-prop-smooth-min',
    label: 'PCF smooth min',
    min: 0,
    max: 1,
    step: 0.01,
    defaultValue: R.props.shadowSmoothMin,
    format: (v) => v.toFixed(2),
    key: 'shadowSmoothMin',
  },
  {
    id: 'dev-shadow-prop-smooth-max',
    label: 'PCF smooth max',
    min: 0,
    max: 1,
    step: 0.01,
    defaultValue: R.props.shadowSmoothMax,
    format: (v) => v.toFixed(2),
    key: 'shadowSmoothMax',
  },
  {
    id: 'dev-prop-alpha-cutoff',
    label: 'Alpha cutoff (leaves)',
    min: 0.1,
    max: 0.7,
    step: 0.01,
    defaultValue: VISUAL.props.alphaTest,
    format: (v) => v.toFixed(2),
    key: 'alphaTest',
  },
  {
    id: 'dev-prop-alpha-sharpness',
    label: 'Alpha sharpness',
    min: 0,
    max: 0.15,
    step: 0.005,
    defaultValue: VISUAL.props.alphaCutoffSharpness,
    format: (v) => v.toFixed(3),
    key: 'alphaCutoffSharpness',
  },
];

function readFloor(targets: SunShadowDebugTargets, profile: SunShadowReceiverProfile): number {
  const v = targets[profile]?.value;
  return typeof v === 'number' ? v : shadowFloorForProfile(profile);
}

function readPropUniform(key: PropSpec['key']): number {
  const map = {
    shadowStrength: propShadowUniforms.uShadowStrength,
    shadowSmoothMin: propShadowUniforms.uShadowSmoothMin,
    shadowSmoothMax: propShadowUniforms.uShadowSmoothMax,
    alphaTest: propShadowUniforms.uAlphaTest,
    alphaCutoffSharpness: propShadowUniforms.uAlphaCutoffSharpness,
  } as const;
  return Number(map[key].value);
}

function syncUi(
  panel: HTMLDivElement,
  ctx: DevPanelShadowContext,
): void {
  for (const s of CAST_SPECS) {
    syncSlider(panel, s.id, `${s.id}-out`, s.read(ctx.sun), s.format);
  }
  for (const s of FLOOR_SPECS) {
    syncSlider(
      panel,
      s.id,
      `${s.id}-out`,
      readFloor(ctx.sunShadowDebugTargets, s.profile),
      s.format,
    );
  }
  for (const s of PROP_SPECS) {
    syncSlider(panel, s.id, `${s.id}-out`, readPropUniform(s.key), s.format);
  }
  const mapSizeSelect = panel.querySelector('#dev-shadow-map-size') as HTMLSelectElement | null;
  if (mapSizeSelect) {
    mapSizeSelect.value = String(readSunShadowMapSize(ctx.sun));
  }
  const debugView = ctx.terrainMaterial?.terrainUniforms.uDebugShadowView;
  const el = panel.querySelector('#dev-shadow-debug-view') as HTMLInputElement | null;
  if (el && debugView) {
    el.checked = Number(debugView.value) > 0.5;
  }
}

function resetShadows(ctx: DevPanelShadowContext): void {
  setSunShadowMapSize(ctx.sun, L.mapSize);
  for (const s of CAST_SPECS) {
    s.apply(ctx.sun, s.defaultValue);
  }
  for (const s of FLOOR_SPECS) {
    setShadowFloor(ctx.sunShadowDebugTargets, s.profile, shadowFloorForProfile(s.profile));
  }
  propShadowUniforms.uShadowStrength.value = R.props.shadowStrength;
  propShadowUniforms.uShadowSmoothMin.value = R.props.shadowSmoothMin;
  propShadowUniforms.uShadowSmoothMax.value = R.props.shadowSmoothMax;
  propShadowUniforms.uAlphaTest.value = VISUAL.props.alphaTest;
  propShadowUniforms.uAlphaCutoffSharpness.value = VISUAL.props.alphaCutoffSharpness;
  syncPropLeafAlphaTest();
  const debugView = ctx.terrainMaterial?.terrainUniforms.uDebugShadowView;
  if (debugView) debugView.value = 0;
}

export function initDevPanelShadows(
  panel: HTMLDivElement,
  ctx: DevPanelShadowContext,
): () => void {
  const hasDebugView = ctx.terrainMaterial?.terrainUniforms.uDebugShadowView != null;

  const body = mountSection(panel, {
    hostId: 'dev-section-shadows',
    title: 'Shadows',
    open: false,
    body: `
      <p class="dev-hint">Sun shadow map + receive floors. PCF radius widens Vogel-disk filtering (texels). 0 = black in full shadow, 1 = no darkening. Disable all contribution via Debug → Disable shadows.</p>
      <details class="dev-subsection">
        <summary>Shadow map (cast)</summary>
        <div class="dev-section-body">
          <label class="dev-row">
            <span>Map resolution</span>
            <select id="dev-shadow-map-size">
              ${SHADOW_MAP_SIZE_OPTIONS.map(
                (n) => `<option value="${n}">${n}×${n}</option>`,
              ).join('')}
            </select>
          </label>
          <div id="dev-shadow-cast-rows"></div>
        </div>
      </details>
      <details class="dev-subsection" open>
        <summary>Receiver floors</summary>
        <div class="dev-section-body" id="dev-shadow-floor-rows"></div>
      </details>
      <details class="dev-subsection">
        <summary>Props shading</summary>
        <p class="dev-hint">Alpha sliders affect tree leaf cutout only (petals/flowers stay at 0.2).</p>
        <div class="dev-section-body" id="dev-shadow-prop-rows"></div>
      </details>
      ${
        hasDebugView
          ? `
      <label class="dev-row dev-row-check">
        <span>Terrain shadow view</span>
        <input type="checkbox" id="dev-shadow-debug-view" />
      </label>`
          : ''
      }
      <div class="dev-actions">
        <button type="button" id="dev-shadow-reset">Reset shadows</button>
      </div>
    `,
  });
  if (!body) return () => {};

  injectRangeRows(body.querySelector('#dev-shadow-cast-rows')!, CAST_SPECS);
  injectRangeRows(body.querySelector('#dev-shadow-floor-rows')!, FLOOR_SPECS);
  injectRangeRows(body.querySelector('#dev-shadow-prop-rows')!, PROP_SPECS);
  syncUi(panel, ctx);

  const disposers: Array<() => void> = [];

  const mapSizeSelect = panel.querySelector('#dev-shadow-map-size') as HTMLSelectElement | null;
  const onMapSizeChange = () => {
    if (!mapSizeSelect) return;
    const applied = setSunShadowMapSize(ctx.sun, Number(mapSizeSelect.value));
    mapSizeSelect.value = String(applied);
  };
  mapSizeSelect?.addEventListener('change', onMapSizeChange);

  for (const s of CAST_SPECS) {
    disposers.push(
      bindRange(panel, s.id, `${s.id}-out`, s.format, (v) => {
        s.apply(ctx.sun, v);
      }),
    );
  }

  for (const s of FLOOR_SPECS) {
    disposers.push(
      bindRange(panel, s.id, `${s.id}-out`, s.format, (v) => {
        setShadowFloor(ctx.sunShadowDebugTargets, s.profile, v);
      }),
    );
  }

  for (const s of PROP_SPECS) {
    disposers.push(
      bindRange(panel, s.id, `${s.id}-out`, s.format, (v) => {
        const uniform = {
          shadowStrength: propShadowUniforms.uShadowStrength,
          shadowSmoothMin: propShadowUniforms.uShadowSmoothMin,
          shadowSmoothMax: propShadowUniforms.uShadowSmoothMax,
          alphaTest: propShadowUniforms.uAlphaTest,
          alphaCutoffSharpness: propShadowUniforms.uAlphaCutoffSharpness,
        }[s.key];
        uniform.value = v;
        if (s.key === 'alphaTest') syncPropLeafAlphaTest();
      }),
    );
  }

  if (hasDebugView) {
    const u = ctx.terrainMaterial!.terrainUniforms.uDebugShadowView;
    disposers.push(
      bindCheckbox(
        panel,
        'dev-shadow-debug-view',
        () => Number(u.value) > 0.5,
        (on) => {
          u.value = on ? 1 : 0;
        },
      ),
    );
  }

  const resetBtn = panel.querySelector('#dev-shadow-reset') as HTMLButtonElement | null;
  const onReset = () => {
    resetShadows(ctx);
    syncUi(panel, ctx);
  };
  resetBtn?.addEventListener('click', onReset);

  return () => {
    for (const fn of disposers) fn();
    mapSizeSelect?.removeEventListener('change', onMapSizeChange);
    resetBtn?.removeEventListener('click', onReset);
  };
}
