// src/ui/dev/devPanelShadows.ts — live sun shadow map + per-receiver floor tuning (DEV)
import type { DirectionalLight } from 'three';
import { VISUAL } from '../../config/visualTuning';
import {
  readSunShadowMapSize,
  type SunShadowDebugTargets,
  type SunShadowReceiverProfile,
  setShadowFloor,
  setSunShadowMapSize,
  shadowFloorForProfile,
} from '../../rendering/sunShadow';
import { syncPropLeafAlphaTest } from '../../world/mapProps/mapPropMaterial';
import { propShadowUniforms } from '../../world/mapProps/mapPropShadowUniforms';
import { syncPropGroundContactFromVisual } from '../../world/mapProps/propGroundContactUniforms';
import type { TerrainSplatMaterial } from '../../world/terrain';
import {
  bindCheckbox,
  bindRange,
  injectRangeRows,
  mountSection,
  type RangeSpec,
  syncSlider,
} from './bindRange';

const L = VISUAL.shadows.lighting;
const R = VISUAL.shadows.receivers;
const FL = VISUAL.props.foliageLighting;
const GC = VISUAL.props.groundContact;

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
  key:
    | keyof Pick<typeof R.props, 'shadowStrength' | 'shadowSmoothMin' | 'shadowSmoothMax'>
    | 'alphaTest'
    | 'alphaCutoffSharpness';
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

interface FoliageSpec extends RangeSpec {
  key: keyof Pick<
    typeof FL,
    | 'wrapStrength'
    | 'hemisphereStrength'
    | 'vertexColorMul'
    | 'foliageMul'
    | 'barkMul'
    | 'defaultMul'
  >;
}

const FOLIAGE_SPECS: FoliageSpec[] = [
  {
    id: 'dev-foliage-wrap',
    label: 'Wrap diffuse',
    min: 0,
    max: 1,
    step: 0.01,
    defaultValue: FL.wrapStrength,
    format: (v) => v.toFixed(2),
    key: 'wrapStrength',
  },
  {
    id: 'dev-foliage-hemisphere',
    label: 'Hemisphere ambient',
    min: 0,
    max: 1,
    step: 0.01,
    defaultValue: FL.hemisphereStrength,
    format: (v) => v.toFixed(2),
    key: 'hemisphereStrength',
  },
  {
    id: 'dev-foliage-vertex-color',
    label: 'Vertex color (bark AO)',
    min: 0,
    max: 2,
    step: 0.01,
    defaultValue: FL.vertexColorMul,
    format: (v) => v.toFixed(2),
    key: 'vertexColorMul',
  },
  {
    id: 'dev-foliage-mul-leaves',
    label: 'Leaves / foliage mul',
    min: 0,
    max: 2,
    step: 0.01,
    defaultValue: FL.foliageMul,
    format: (v) => v.toFixed(2),
    key: 'foliageMul',
  },
  {
    id: 'dev-foliage-mul-bark',
    label: 'Bark mul',
    min: 0,
    max: 2,
    step: 0.01,
    defaultValue: FL.barkMul,
    format: (v) => v.toFixed(2),
    key: 'barkMul',
  },
  {
    id: 'dev-foliage-mul-default',
    label: 'Rock / default mul',
    min: 0,
    max: 2,
    step: 0.01,
    defaultValue: FL.defaultMul,
    format: (v) => v.toFixed(2),
    key: 'defaultMul',
  },
];

interface GroundContactSpec extends RangeSpec {
  key:
    | 'fadeHeightM'
    | 'darkenMax'
    | 'tintStrength'
    | 'barkStrength'
    | 'foliageStrength'
    | 'defaultStrength';
}

const GROUND_CONTACT_SPECS: GroundContactSpec[] = [
  {
    id: 'dev-ground-contact-fade',
    label: 'Fade height (m)',
    min: 0.05,
    max: 1.5,
    step: 0.05,
    defaultValue: GC.fadeHeightM,
    format: (v) => v.toFixed(2),
    key: 'fadeHeightM',
  },
  {
    id: 'dev-ground-contact-darken',
    label: 'Darken max',
    min: 0,
    max: 0.85,
    step: 0.02,
    defaultValue: GC.darkenMax,
    format: (v) => v.toFixed(2),
    key: 'darkenMax',
  },
  {
    id: 'dev-ground-contact-tint',
    label: 'Ground tint strength',
    min: 0,
    max: 0.6,
    step: 0.02,
    defaultValue: GC.tintStrength,
    format: (v) => v.toFixed(2),
    key: 'tintStrength',
  },
  {
    id: 'dev-ground-contact-bark',
    label: 'Bark / trunk strength',
    min: 0,
    max: 1.5,
    step: 0.05,
    defaultValue: GC.barkStrength,
    format: (v) => v.toFixed(2),
    key: 'barkStrength',
  },
  {
    id: 'dev-ground-contact-foliage',
    label: 'Foliage strength',
    min: 0,
    max: 1.5,
    step: 0.05,
    defaultValue: GC.foliageStrength,
    format: (v) => v.toFixed(2),
    key: 'foliageStrength',
  },
  {
    id: 'dev-ground-contact-default',
    label: 'Rock / default strength',
    min: 0,
    max: 1.5,
    step: 0.05,
    defaultValue: GC.defaultStrength,
    format: (v) => v.toFixed(2),
    key: 'defaultStrength',
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

function readFoliageUniform(key: FoliageSpec['key']): number {
  const map = {
    wrapStrength: propShadowUniforms.uWrapStrength,
    hemisphereStrength: propShadowUniforms.uHemisphereStrength,
    vertexColorMul: propShadowUniforms.uVertexColorMul,
    foliageMul: propShadowUniforms.uFoliageMul,
    barkMul: propShadowUniforms.uBarkMul,
    defaultMul: propShadowUniforms.uDefaultMul,
  } as const;
  return Number(map[key].value);
}

function readGroundContactUniform(key: GroundContactSpec['key']): number {
  const map = {
    fadeHeightM: propShadowUniforms.uFadeHeightM,
    darkenMax: propShadowUniforms.uDarkenMax,
    tintStrength: propShadowUniforms.uTintStrength,
    barkStrength: propShadowUniforms.uBarkContactStrength,
    foliageStrength: propShadowUniforms.uFoliageContactStrength,
    defaultStrength: propShadowUniforms.uDefaultContactStrength,
  } as const;
  return Number(map[key].value);
}

function resetFoliageLightingUniforms(): void {
  propShadowUniforms.uWrapStrength.value = FL.wrapStrength;
  propShadowUniforms.uHemisphereStrength.value = FL.hemisphereStrength;
  propShadowUniforms.uVertexColorMul.value = FL.vertexColorMul;
  propShadowUniforms.uFoliageMul.value = FL.foliageMul;
  propShadowUniforms.uBarkMul.value = FL.barkMul;
  propShadowUniforms.uDefaultMul.value = FL.defaultMul;
}

function resetPropShadingUniforms(): void {
  resetFoliageLightingUniforms();
  syncPropGroundContactFromVisual();
}

function syncUi(panel: HTMLDivElement, ctx: DevPanelShadowContext): void {
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
  for (const s of FOLIAGE_SPECS) {
    syncSlider(panel, s.id, `${s.id}-out`, readFoliageUniform(s.key), s.format);
  }
  for (const s of GROUND_CONTACT_SPECS) {
    syncSlider(panel, s.id, `${s.id}-out`, readGroundContactUniform(s.key), s.format);
  }
  const groundEnabled = panel.querySelector(
    '#dev-ground-contact-enabled',
  ) as HTMLInputElement | null;
  if (groundEnabled) {
    groundEnabled.checked = Number(propShadowUniforms.uGroundContactEnabled.value) > 0.5;
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
  resetPropShadingUniforms();
  syncPropLeafAlphaTest();
  const debugView = ctx.terrainMaterial?.terrainUniforms.uDebugShadowView;
  if (debugView) debugView.value = 0;
}

export function initDevPanelShadows(panel: HTMLDivElement, ctx: DevPanelShadowContext): () => void {
  const hasDebugView = ctx.terrainMaterial?.terrainUniforms.uDebugShadowView != null;

  const body = mountSection(panel, {
    hostId: 'dev-section-shadows',
    title: 'Shadows',
    open: false,
    body: `
      <p class="dev-hint">Sun shadow map + receive floors. PCF radius widens Vogel-disk filtering (texels). Multiply receivers: 0 ≈ black in full shadow; terrain floor dims <strong>sun terms only</strong> (ambient stays lit). Disable all contribution via Debug → Disable shadows.</p>
      <details class="dev-subsection">
        <summary>Shadow map (cast)</summary>
        <div class="dev-section-body">
          <label class="dev-row">
            <span>Map resolution</span>
            <select id="dev-shadow-map-size">
              ${SHADOW_MAP_SIZE_OPTIONS.map((n) => `<option value="${n}">${n}×${n}</option>`).join(
                '',
              )}
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
      <details class="dev-subsection">
        <summary>Foliage lighting</summary>
        <p class="dev-hint">Wrap + hemisphere shape trees and plants. Category muls scale those effects per material (leaves / bark / rock). Grass fake SSS is under Grass → Sun lighting.</p>
        <div class="dev-section-body" id="dev-foliage-lighting-rows"></div>
      </details>
      <details class="dev-subsection">
        <summary>Ground contact</summary>
        <p class="dev-hint">Terrain-height darken/tint at prop bases. Uses macro height map (same as water shore depth).</p>
        <div class="dev-section-body">
          <label class="dev-row dev-row-check">
            <span>Ground contact enabled</span>
            <input type="checkbox" id="dev-ground-contact-enabled" />
          </label>
          <div id="dev-ground-contact-rows"></div>
        </div>
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
  injectRangeRows(body.querySelector('#dev-foliage-lighting-rows')!, FOLIAGE_SPECS);
  injectRangeRows(body.querySelector('#dev-ground-contact-rows')!, GROUND_CONTACT_SPECS);
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

  for (const s of FOLIAGE_SPECS) {
    disposers.push(
      bindRange(panel, s.id, `${s.id}-out`, s.format, (v) => {
        const uniform = {
          wrapStrength: propShadowUniforms.uWrapStrength,
          hemisphereStrength: propShadowUniforms.uHemisphereStrength,
          vertexColorMul: propShadowUniforms.uVertexColorMul,
          foliageMul: propShadowUniforms.uFoliageMul,
          barkMul: propShadowUniforms.uBarkMul,
          defaultMul: propShadowUniforms.uDefaultMul,
        }[s.key];
        uniform.value = v;
      }),
    );
  }

  for (const s of GROUND_CONTACT_SPECS) {
    disposers.push(
      bindRange(panel, s.id, `${s.id}-out`, s.format, (v) => {
        const uniform = {
          fadeHeightM: propShadowUniforms.uFadeHeightM,
          darkenMax: propShadowUniforms.uDarkenMax,
          tintStrength: propShadowUniforms.uTintStrength,
          barkStrength: propShadowUniforms.uBarkContactStrength,
          foliageStrength: propShadowUniforms.uFoliageContactStrength,
          defaultStrength: propShadowUniforms.uDefaultContactStrength,
        }[s.key];
        uniform.value = v;
      }),
    );
  }

  disposers.push(
    bindCheckbox(
      panel,
      'dev-ground-contact-enabled',
      () => Number(propShadowUniforms.uGroundContactEnabled.value) > 0.5,
      (on) => {
        propShadowUniforms.uGroundContactEnabled.value = on ? 1 : 0;
      },
    ),
  );

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
