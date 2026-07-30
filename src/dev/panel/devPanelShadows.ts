// src/dev/panel/devPanelShadows.ts — live near-cascade sun shadow + per-receiver floor tuning (DEV)
import type { DirectionalLight } from 'three';
import { VISUAL } from '../../config/visualTuning';
import {
  getNearCascadeShadowLight,
  readSunShadowMapSize,
  type SunShadowDebugTargets,
  type SunShadowReceiverProfile,
  setShadowFloor,
  setSunShadowMapSize,
  shadowFloorForProfile,
} from '../../rendering/sunShadow';
import { propShadowUniforms } from '../../world/mapProps/config/mapPropShadowUniforms';
import { syncPropGroundContactFromVisual } from '../../world/mapProps/config/propGroundContactUniforms';
import {
  readTerrainAoBakeOverride,
  resetTerrainAoBakeOverrides,
  setTerrainAoBakeOverride,
} from '../../world/mapProps/data/propContactAoDevState';
import { syncPropLeafAlphaTest } from '../../world/mapProps/material/mapPropMaterial';
import type { TerrainSplatMaterial } from '../../world/terrain';
import { terrainPropAoLiveUniforms } from '../../world/terrain/material/biomeSplatUniforms';
import { bindCheckbox, bindRange, injectRangeRows, mountSection, syncSlider } from '../bindRange';
import {
  CAST_SPECS,
  FLOOR_SPECS,
  FOLIAGE_SPECS,
  type FoliageSpec,
  GROUND_CONTACT_SPECS,
  type GroundContactSpec,
  PROP_SPECS,
  type PropSpec,
  TERRAIN_AO_SHAPE_SPECS,
} from './devPanelShadowsSpecs';

const L = VISUAL.shadows.lighting;
const R = VISUAL.shadows.receivers;
const FL = VISUAL.props.foliageLighting;

const SHADOW_MAP_SIZE_OPTIONS = [512, 1024, 2048, 4096, 8192] as const;

const PROP_UNIFORM_MAP = {
  shadowStrength: propShadowUniforms.uShadowStrength,
  alphaTest: propShadowUniforms.uAlphaTest,
  alphaCutoffSharpness: propShadowUniforms.uAlphaCutoffSharpness,
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
  terrainAoStrength: terrainPropAoLiveUniforms.uPropAoStrength,
  terrainAoSunStrength: terrainPropAoLiveUniforms.uPropAoSunStrength,
} as const;

export interface DevPanelShadowContext {
  sun: DirectionalLight;
  sunShadowDebugTargets: SunShadowDebugTargets;
  terrainMaterial?: TerrainSplatMaterial;
}

function requireNearLight(): DirectionalLight {
  const near = getNearCascadeShadowLight();
  if (!near) {
    throw new Error('DEV Shadows: near cascade light missing');
  }
  return near;
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
  const ao = VISUAL.props.groundContact.terrainAo;
  terrainPropAoLiveUniforms.uPropAoEnabled.value = ao.enabled ? 1 : 0;
  terrainPropAoLiveUniforms.uPropAoStrength.value = ao.strength;
  terrainPropAoLiveUniforms.uPropAoSunStrength.value = ao.sunStrength;
}

function syncUi(panel: HTMLDivElement, ctx: DevPanelShadowContext): void {
  const near = requireNearLight();
  for (const s of CAST_SPECS) {
    syncSlider(panel, s.id, `${s.id}-out`, s.read(near), s.format);
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
  for (const s of TERRAIN_AO_SHAPE_SPECS) {
    syncSlider(panel, s.id, `${s.id}-out`, readTerrainAoBakeOverride(s.key), s.format);
  }
  const groundEnabled = panel.querySelector(
    '#dev-ground-contact-enabled',
  ) as HTMLInputElement | null;
  if (groundEnabled) {
    groundEnabled.checked = Number(propShadowUniforms.uGroundContactEnabled.value) > 0.5;
  }
  const terrainAoEnabled = panel.querySelector(
    '#dev-terrain-ao-enabled',
  ) as HTMLInputElement | null;
  if (terrainAoEnabled) {
    terrainAoEnabled.checked = Number(terrainPropAoLiveUniforms.uPropAoEnabled.value) > 0.5;
  }
  const mapSizeSelect = panel.querySelector('#dev-shadow-map-size') as HTMLSelectElement | null;
  if (mapSizeSelect) {
    mapSizeSelect.value = String(readSunShadowMapSize(near));
  }
  const debugView = ctx.terrainMaterial?.terrainUniforms.uDebugShadowView;
  const el = panel.querySelector('#dev-shadow-debug-view') as HTMLInputElement | null;
  if (el && debugView) {
    el.checked = Number(debugView.value) > 0.5;
  }
}

function resetShadows(ctx: DevPanelShadowContext): void {
  const near = requireNearLight();
  setSunShadowMapSize(near, L.near.mapSize);
  for (const s of CAST_SPECS) {
    s.apply(near, s.defaultValue);
  }
  for (const s of FLOOR_SPECS) {
    setShadowFloor(ctx.sunShadowDebugTargets, s.profile, shadowFloorForProfile(s.profile));
  }
  propShadowUniforms.uShadowStrength.value = R.props.shadowStrength;
  propShadowUniforms.uAlphaTest.value = VISUAL.props.alphaTest;
  propShadowUniforms.uAlphaCutoffSharpness.value = VISUAL.props.alphaCutoffSharpness;
  resetPropShadingUniforms();
  resetTerrainAoBakeOverrides();
  syncPropLeafAlphaTest();
  const debugView = ctx.terrainMaterial?.terrainUniforms.uDebugShadowView;
  if (debugView) debugView.value = 0;
}

export function initDevPanelShadows(panel: HTMLDivElement, ctx: DevPanelShadowContext): () => void {
  const hasDebugView = ctx.terrainMaterial?.terrainUniforms.uDebugShadowView != null;
  const nearHalf = L.near.halfExtentM;

  const body = mountSection(panel, {
    hostId: 'dev-section-shadows',
    title: 'Shadows',
    open: false,
    body: `
      <p class="dev-hint">Near PCSS (±${nearHalf} m) owns ground receive (terrain/props/grass/water). Soft cloud-cast mins on top. Main/far map is godrays + cloud receive only (config <code>lighting.mapSize</code>). Softness / bias apply to the near cascade. Log via <code>window.__logShadowDebug()</code>.</p>
      <details class="dev-subsection">
        <summary>Shadow map (cast)</summary>
        <div class="dev-section-body">
          <label class="dev-row">
            <span>Near map resolution</span>
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
        <p class="dev-hint">Prop-side darken/tint uses the macro height map. Terrain AO: full strength on core height (vertical m), fades shape-wise to 0% at the base-height silhouette + radius soft tail. Core / base / radius re-bake live (short debounce); strength sliders are instant.</p>
        <div class="dev-section-body">
          <label class="dev-row dev-row-check">
            <span>Ground contact enabled</span>
            <input type="checkbox" id="dev-ground-contact-enabled" />
          </label>
          <label class="dev-row dev-row-check">
            <span>Terrain contact AO</span>
            <input type="checkbox" id="dev-terrain-ao-enabled" />
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
  injectRangeRows(body.querySelector('#dev-ground-contact-rows')!, [
    ...GROUND_CONTACT_SPECS,
    ...TERRAIN_AO_SHAPE_SPECS,
  ]);
  syncUi(panel, ctx);

  const disposers: Array<() => void> = [];

  const mapSizeSelect = panel.querySelector('#dev-shadow-map-size') as HTMLSelectElement | null;
  const onMapSizeChange = () => {
    if (!mapSizeSelect) return;
    const applied = setSunShadowMapSize(requireNearLight(), Number(mapSizeSelect.value));
    mapSizeSelect.value = String(applied);
  };
  mapSizeSelect?.addEventListener('change', onMapSizeChange);

  for (const s of CAST_SPECS) {
    disposers.push(
      bindRange(panel, s.id, `${s.id}-out`, s.format, (v) => {
        s.apply(requireNearLight(), v);
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

  for (const s of TERRAIN_AO_SHAPE_SPECS) {
    disposers.push(
      bindRange(panel, s.id, `${s.id}-out`, s.format, (v) => {
        setTerrainAoBakeOverride(s.key, v);
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

  disposers.push(
    bindCheckbox(
      panel,
      'dev-terrain-ao-enabled',
      () => Number(terrainPropAoLiveUniforms.uPropAoEnabled.value) > 0.5,
      (on) => {
        terrainPropAoLiveUniforms.uPropAoEnabled.value = on ? 1 : 0;
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
