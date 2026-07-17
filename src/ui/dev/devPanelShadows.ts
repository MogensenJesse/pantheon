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
import { bindCheckbox, bindRange, injectRangeRows, mountSection, syncSlider } from './bindRange';
import {
  CAST_SPECS,
  FLOOR_SPECS,
  FOLIAGE_SPECS,
  type FoliageSpec,
  GROUND_CONTACT_SPECS,
  type GroundContactSpec,
  PROP_SPECS,
  type PropSpec,
} from './devPanelShadowsSpecs';

const L = VISUAL.shadows.lighting;
const R = VISUAL.shadows.receivers;
const FL = VISUAL.props.foliageLighting;

const SHADOW_MAP_SIZE_OPTIONS = [512, 1024, 2048, 4096, 8192] as const;

const PROP_UNIFORM_MAP = {
  shadowStrength: propShadowUniforms.uShadowStrength,
  shadowSmoothMin: propShadowUniforms.uShadowSmoothMin,
  shadowSmoothMax: propShadowUniforms.uShadowSmoothMax,
  alphaTest: propShadowUniforms.uAlphaTest,
  alphaCutoffSharpness: propShadowUniforms.uAlphaCutoffSharpness,
  hashedAlphaStrength: propShadowUniforms.uHashedAlphaStrength,
} as const;

const FOLIAGE_UNIFORM_MAP = {
  wrapStrength: propShadowUniforms.uWrapStrength,
  hemisphereStrength: propShadowUniforms.uHemisphereStrength,
  vertexColorMul: propShadowUniforms.uVertexColorMul,
  foliageMul: propShadowUniforms.uFoliageMul,
  barkMul: propShadowUniforms.uBarkMul,
  defaultMul: propShadowUniforms.uDefaultMul,
} as const;

const GROUND_CONTACT_UNIFORM_MAP = {
  fadeHeightM: propShadowUniforms.uFadeHeightM,
  darkenMax: propShadowUniforms.uDarkenMax,
  tintStrength: propShadowUniforms.uTintStrength,
  barkStrength: propShadowUniforms.uBarkContactStrength,
  foliageStrength: propShadowUniforms.uFoliageContactStrength,
  defaultStrength: propShadowUniforms.uDefaultContactStrength,
} as const;

export interface DevPanelShadowContext {
  sun: DirectionalLight;
  sunShadowDebugTargets: SunShadowDebugTargets;
  terrainMaterial?: TerrainSplatMaterial;
}

function readFloor(targets: SunShadowDebugTargets, profile: SunShadowReceiverProfile): number {
  const v = targets[profile]?.value;
  return typeof v === 'number' ? v : shadowFloorForProfile(profile);
}

function readPropUniform(key: PropSpec['key']): number {
  return Number(PROP_UNIFORM_MAP[key].value);
}

function readFoliageUniform(key: FoliageSpec['key']): number {
  return Number(FOLIAGE_UNIFORM_MAP[key].value);
}

function readGroundContactUniform(key: GroundContactSpec['key']): number {
  return Number(GROUND_CONTACT_UNIFORM_MAP[key].value);
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
  propShadowUniforms.uHashedAlphaStrength.value = VISUAL.props.hashedAlphaStrength;
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
      <p class="dev-hint">Sun shadow map + receive floors. Contact-hardening PCSS: <strong>softness min</strong> = contact blur floor, <strong>softness max</strong> = elevated/cloud blur cap, <strong>penumbra scale</strong> = depth gap→radius. A fixed blocker search keeps max from changing contact detection; deterministic Vogel taps avoid motion-dependent pattern rotation. Toggle <code>VISUAL.shadows.lighting.usePcss</code> needs a full reload. Multiply receivers: 0 ≈ black in full shadow; terrain floor dims <strong>sun terms only</strong> (ambient stays lit). Disable all contribution via Debug → Disable shadows.</p>
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
      <details class="dev-subsection">
        <summary>Receiver floors</summary>
        <div class="dev-section-body" id="dev-shadow-floor-rows"></div>
      </details>
      <details class="dev-subsection">
        <summary>Props shading</summary>
        <p class="dev-hint">Alpha sliders affect tree leaf cutout only (petals/flowers stay at 0.2). Hashed alpha dithers needle/leaf edges to reduce shimmer (0 = off).</p>
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
        PROP_UNIFORM_MAP[s.key].value = v;
        if (s.key === 'alphaTest') syncPropLeafAlphaTest();
      }),
    );
  }

  for (const s of FOLIAGE_SPECS) {
    disposers.push(
      bindRange(panel, s.id, `${s.id}-out`, s.format, (v) => {
        FOLIAGE_UNIFORM_MAP[s.key].value = v;
      }),
    );
  }

  for (const s of GROUND_CONTACT_SPECS) {
    disposers.push(
      bindRange(panel, s.id, `${s.id}-out`, s.format, (v) => {
        GROUND_CONTACT_UNIFORM_MAP[s.key].value = v;
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
