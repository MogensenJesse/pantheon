// src/ui/dev/sky/devPanelClouds.ts — procedural mesh-cluster cloud tunables (DEV)
import { VISUAL } from '../../../config/visualTuning';
import {
  CLOUD_PRESETS,
  type CloudPresetId,
  type CloudSettings,
  effectiveCloudCount,
  readCloudSettings,
} from '../../../rendering/clouds/cloudConfig';
import {
  getLiveCloudSettings,
  resetCloudDevOverrides,
  setCloudDevOverride,
} from '../../../rendering/clouds/cloudDevState';
import type { MeshCloudSystemContext } from '../../../rendering/clouds/MeshCloudSystem';
import {
  bindCheckbox,
  bindRange,
  bindRangeOnChange,
  injectRangeRows,
  mountSection,
  syncSpecs,
} from '../bindRange';
import {
  ALL_CLOUD_SPECS,
  CLOUD_LAYOUT_SPECS,
  CLOUD_LIGHTING_SPECS,
  CLOUD_REVEAL_SPECS,
  CLOUD_RUNTIME_SPECS,
  CLOUD_TERRAIN_SPECS,
  CLOUD_WISP_SPECS,
  type CloudSpec,
} from './devPanelCloudsSpecs';

function presetOptionsHtml(): string {
  return Object.values(CLOUD_PRESETS)
    .map((p) => `<option value="${p.id}">${p.label}</option>`)
    .join('');
}

function readSpecValue(spec: CloudSpec): number {
  const live = getLiveCloudSettings();
  const value = live[spec.key];
  return typeof value === 'number' ? value : 0;
}

function formatEffectiveSummary(): string {
  const live = getLiveCloudSettings();
  const clusters = effectiveCloudCount(live);
  const instances = clusters * live.particlesPerCloud;
  return `${clusters} clusters · ${instances} instances · preset ${CLOUD_PRESETS[live.preset].label}`;
}

export function initDevPanelClouds(
  panel: HTMLDivElement,
  cloudSystem: MeshCloudSystemContext | null | undefined,
): () => void {
  if (!cloudSystem) return () => {};

  const shipped = readCloudSettings();
  const body = mountSection(panel, {
    hostId: 'dev-section-clouds',
    title: 'Procedural clouds',
    open: false,
    body: `
      <p class="dev-hint">All <code>VISUAL.clouds</code> tunables. Layout sliders rebuild the field; runtime sliders apply live.</p>
      <label class="dev-row">
        <span>Enabled</span>
        <input type="checkbox" id="dev-cloud-enabled" ${shipped.enabled ? 'checked' : ''} />
      </label>
      <label class="dev-row">
        <span>Preset</span>
        <select id="dev-cloud-preset">${presetOptionsHtml()}</select>
      </label>
      <p class="dev-hint" id="dev-cloud-effective">${formatEffectiveSummary()}</p>
      <details class="dev-subsection">
        <summary>Layout (rebuild)</summary>
        <div class="dev-section-body" id="dev-cloud-layout-rows"></div>
      </details>
      <details class="dev-subsection">
        <summary>Runtime</summary>
        <div class="dev-section-body" id="dev-cloud-runtime-rows"></div>
      </details>
      <details class="dev-subsection">
        <summary>Wisps / soft</summary>
        <div class="dev-section-body" id="dev-cloud-wisp-rows"></div>
      </details>
      <details class="dev-subsection">
        <summary>Terrain hug</summary>
        <label class="dev-row">
          <span>Terrain interaction</span>
          <input type="checkbox" id="dev-cloud-terrain-enabled" ${shipped.terrainInteractionEnabled ? 'checked' : ''} />
        </label>
        <div class="dev-section-body" id="dev-cloud-terrain-rows"></div>
      </details>
      <details class="dev-subsection">
        <summary>Lighting / haze</summary>
        <label class="dev-row">
          <span>Cast shadows</span>
          <input type="checkbox" id="dev-cloud-cast-shadows" ${shipped.castShadows ? 'checked' : ''} />
        </label>
        <label class="dev-row">
          <span>Receive shadows</span>
          <input type="checkbox" id="dev-cloud-receive-shadows" ${shipped.receiveShadows ? 'checked' : ''} />
        </label>
        <p class="dev-hint">Cast uses opaque sphere silhouettes (terrain-safe). Soft edges come from contact-hardening PCSS (<strong>Shadows → Softness min/max</strong>). Instances sort back-to-front for cleaner soft overlaps. Particle count / sphere segments need field rebuild or full reload.</p>
        <div class="dev-section-body" id="dev-cloud-lighting-rows"></div>
      </details>
      <details class="dev-subsection">
        <summary>Reveal ramp</summary>
        <p class="dev-hint">Opacity only (energy/atmosphere). Night clouds stay visible.</p>
        <div class="dev-section-body" id="dev-cloud-reveal-rows"></div>
      </details>
      <div class="dev-actions">
        <button type="button" id="dev-cloud-reset">Reset clouds</button>
      </div>
    `,
  });
  if (!body) return () => {};

  injectRangeRows(body.querySelector('#dev-cloud-layout-rows')!, CLOUD_LAYOUT_SPECS);
  injectRangeRows(body.querySelector('#dev-cloud-runtime-rows')!, CLOUD_RUNTIME_SPECS);
  injectRangeRows(body.querySelector('#dev-cloud-wisp-rows')!, CLOUD_WISP_SPECS);
  injectRangeRows(body.querySelector('#dev-cloud-terrain-rows')!, CLOUD_TERRAIN_SPECS);
  injectRangeRows(body.querySelector('#dev-cloud-lighting-rows')!, CLOUD_LIGHTING_SPECS);
  injectRangeRows(body.querySelector('#dev-cloud-reveal-rows')!, CLOUD_REVEAL_SPECS);
  syncUi(panel, cloudSystem);

  const disposers: Array<() => void> = [];

  disposers.push(
    bindCheckbox(
      panel,
      'dev-cloud-enabled',
      () => getLiveCloudSettings().enabled,
      (enabled) => {
        setCloudDevOverride('enabled', enabled);
        cloudSystem.setEnabled(enabled);
      },
    ),
  );

  disposers.push(
    bindCheckbox(
      panel,
      'dev-cloud-terrain-enabled',
      () => getLiveCloudSettings().terrainInteractionEnabled,
      (enabled) => {
        setCloudDevOverride('terrainInteractionEnabled', enabled);
      },
    ),
  );

  disposers.push(
    bindCheckbox(
      panel,
      'dev-cloud-cast-shadows',
      () => getLiveCloudSettings().castShadows,
      (enabled) => {
        setCloudDevOverride('castShadows', enabled);
      },
    ),
  );

  disposers.push(
    bindCheckbox(
      panel,
      'dev-cloud-receive-shadows',
      () => getLiveCloudSettings().receiveShadows,
      (enabled) => {
        setCloudDevOverride('receiveShadows', enabled);
      },
    ),
  );

  const presetSelect = panel.querySelector('#dev-cloud-preset') as HTMLSelectElement | null;
  const onPresetChange = () => {
    if (!presetSelect) return;
    setCloudDevOverride('preset', presetSelect.value as CloudPresetId);
    cloudSystem.rebuild();
    syncUi(panel, cloudSystem);
  };
  presetSelect?.addEventListener('change', onPresetChange);
  disposers.push(() => presetSelect?.removeEventListener('change', onPresetChange));

  for (const spec of CLOUD_LAYOUT_SPECS) {
    disposers.push(
      bindRangeOnChange(panel, spec.id, `${spec.id}-out`, spec.format, (v) => {
        setCloudDevOverride(spec.key, Math.round(v) as CloudSettings[typeof spec.key]);
        cloudSystem.rebuild();
        syncUi(panel, cloudSystem);
      }),
    );
  }

  for (const spec of CLOUD_RUNTIME_SPECS) {
    disposers.push(
      bindRange(panel, spec.id, `${spec.id}-out`, spec.format, (v) => {
        setCloudDevOverride(spec.key, v);
      }),
    );
  }

  for (const spec of CLOUD_WISP_SPECS) {
    disposers.push(
      bindRange(panel, spec.id, `${spec.id}-out`, spec.format, (v) => {
        setCloudDevOverride(spec.key, v);
      }),
    );
  }

  for (const spec of CLOUD_TERRAIN_SPECS) {
    disposers.push(
      bindRange(panel, spec.id, `${spec.id}-out`, spec.format, (v) => {
        setCloudDevOverride(spec.key, v);
      }),
    );
  }

  for (const spec of CLOUD_LIGHTING_SPECS) {
    disposers.push(
      bindRange(panel, spec.id, `${spec.id}-out`, spec.format, (v) => {
        setCloudDevOverride(spec.key, v);
      }),
    );
  }

  for (const spec of CLOUD_REVEAL_SPECS) {
    disposers.push(
      bindRange(panel, spec.id, `${spec.id}-out`, spec.format, (v) => {
        setCloudDevOverride(spec.key, v);
      }),
    );
  }

  const resetBtn = panel.querySelector('#dev-cloud-reset') as HTMLButtonElement | null;
  const onReset = () => {
    resetCloudDevOverrides();
    cloudSystem.rebuild();
    syncUi(panel, cloudSystem);
  };
  resetBtn?.addEventListener('click', onReset);

  return () => {
    for (const fn of disposers) fn();
    resetBtn?.removeEventListener('click', onReset);
  };
}

function syncUi(panel: HTMLDivElement, cloudSystem: MeshCloudSystemContext): void {
  syncSpecs(panel, ALL_CLOUD_SPECS, readSpecValue);
  const live = getLiveCloudSettings();
  const enabled = panel.querySelector('#dev-cloud-enabled') as HTMLInputElement | null;
  const terrainEnabled = panel.querySelector(
    '#dev-cloud-terrain-enabled',
  ) as HTMLInputElement | null;
  const castShadows = panel.querySelector('#dev-cloud-cast-shadows') as HTMLInputElement | null;
  const receiveShadows = panel.querySelector(
    '#dev-cloud-receive-shadows',
  ) as HTMLInputElement | null;
  const preset = panel.querySelector('#dev-cloud-preset') as HTMLSelectElement | null;
  const summary = panel.querySelector('#dev-cloud-effective');
  if (enabled) enabled.checked = live.enabled;
  if (terrainEnabled) terrainEnabled.checked = live.terrainInteractionEnabled;
  if (castShadows) castShadows.checked = live.castShadows;
  if (receiveShadows) receiveShadows.checked = live.receiveShadows;
  if (preset) preset.value = live.preset;
  if (summary) summary.textContent = formatEffectiveSummary();
  cloudSystem.setEnabled(live.enabled);
}

export function cloudPresetLabel(id: CloudPresetId = VISUAL.clouds.preset): string {
  return CLOUD_PRESETS[id].label;
}
