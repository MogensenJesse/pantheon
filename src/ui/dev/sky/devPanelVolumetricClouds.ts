// src/ui/dev/sky/devPanelVolumetricClouds.ts — DEV volumetric cloud raymarch tunables (Phase 2.2)
import type { PostFXContext } from '../../../rendering/PostFX';
import {
  getLiveVolumetricCloudParams,
  resetVolumetricCloudParams,
  setVolumetricCloudParams,
  type VolumetricCloudParams,
} from '../../../rendering/clouds/volumetric/volumetricCloudDevState';
import {
  bindCheckbox,
  bindRange,
  bindRangeOnChange,
  injectRangeRows,
  mountSection,
  syncSpecs,
} from '../bindRange';
import {
  ALL_VOLUMETRIC_CLOUD_SPECS,
  VOLUMETRIC_DENSITY_SPECS,
  VOLUMETRIC_FIELD_SPECS,
  VOLUMETRIC_QUALITY_SPECS,
  VOLUMETRIC_RAYMARCH_SPECS,
  VOLUMETRIC_SLAB_SPECS,
  type VolumetricCloudSpec,
} from './devPanelVolumetricCloudsSpecs';
import { VISUAL } from '../../../config/visualTuning';

function readSpecValue(spec: VolumetricCloudSpec): number {
  const value = getLiveVolumetricCloudParams()[spec.key];
  return typeof value === 'number' ? value : 0;
}

function applySpec(spec: VolumetricCloudSpec, value: number, postFX: PostFXContext): void {
  const rounded = spec.step >= 1 ? Math.round(value) : value;
  setVolumetricCloudParams({ [spec.key]: rounded } as Partial<VolumetricCloudParams>);
  if (spec.shaderRebuild) {
    postFX.rebuildPostPipeline?.();
  }
}

export function initDevPanelVolumetricClouds(
  panel: HTMLDivElement,
  postFX: PostFXContext,
): () => void {
  const body = mountSection(panel, {
    hostId: 'dev-section-volumetric-clouds',
    title: 'Volumetric clouds',
    open: false,
    body: `
      <p class="dev-hint"><code>VISUAL.clouds.volumetric</code> — production toggle hides mesh clouds. Quarter-res pass + jitter reduce banding. <strong>Pass scale / steps / octaves</strong> rebuild the post shader.</p>
      <label class="dev-row">
        <span>Enabled (production)</span>
        <input type="checkbox" id="dev-vol-enabled" ${VISUAL.clouds.volumetric.enabled ? 'checked' : ''} />
      </label>
      <details class="dev-subsection">
        <summary>Pass quality</summary>
        <div class="dev-section-body" id="dev-vol-quality-rows"></div>
      </details>
      <details class="dev-subsection">
        <summary>Slab bounds</summary>
        <div class="dev-section-body" id="dev-vol-slab-rows"></div>
      </details>
      <details class="dev-subsection">
        <summary>Field radius</summary>
        <div class="dev-section-body" id="dev-vol-field-rows"></div>
      </details>
      <details class="dev-subsection">
        <summary>Density / noise</summary>
        <div class="dev-section-body" id="dev-vol-density-rows"></div>
      </details>
      <details class="dev-subsection">
        <summary>Raymarch</summary>
        <div class="dev-section-body" id="dev-vol-raymarch-rows"></div>
      </details>
      <div class="dev-actions">
        <button type="button" id="dev-vol-reset">Reset volumetric</button>
      </div>
    `,
  });
  if (!body) return () => {};

  injectRangeRows(body.querySelector('#dev-vol-quality-rows')!, VOLUMETRIC_QUALITY_SPECS);
  injectRangeRows(body.querySelector('#dev-vol-slab-rows')!, VOLUMETRIC_SLAB_SPECS);
  injectRangeRows(body.querySelector('#dev-vol-field-rows')!, VOLUMETRIC_FIELD_SPECS);
  injectRangeRows(body.querySelector('#dev-vol-density-rows')!, VOLUMETRIC_DENSITY_SPECS);
  injectRangeRows(body.querySelector('#dev-vol-raymarch-rows')!, VOLUMETRIC_RAYMARCH_SPECS);
  syncUi(panel);

  const disposers: Array<() => void> = [];

  disposers.push(
    bindCheckbox(
      panel,
      'dev-vol-enabled',
      () => getLiveVolumetricCloudParams().enabled,
      (enabled) => {
        setVolumetricCloudParams({ enabled });
        postFX.rebuildPostPipeline?.();
        syncUi(panel);
      },
    ),
  );

  for (const spec of ALL_VOLUMETRIC_CLOUD_SPECS) {
    const bind = spec.shaderRebuild ? bindRangeOnChange : bindRange;
    disposers.push(
      bind(panel, spec.id, `${spec.id}-out`, spec.format, (v) => {
        applySpec(spec, v, postFX);
        syncUi(panel);
      }),
    );
  }

  const resetBtn = panel.querySelector('#dev-vol-reset') as HTMLButtonElement | null;
  const onReset = () => {
    resetVolumetricCloudParams();
    postFX.rebuildPostPipeline?.();
    syncUi(panel);
  };
  resetBtn?.addEventListener('click', onReset);

  return () => {
    for (const fn of disposers) fn();
    resetBtn?.removeEventListener('click', onReset);
  };
}

function syncUi(panel: HTMLDivElement): void {
  syncSpecs(panel, ALL_VOLUMETRIC_CLOUD_SPECS, readSpecValue);
  const enabled = panel.querySelector('#dev-vol-enabled') as HTMLInputElement | null;
  if (enabled) enabled.checked = getLiveVolumetricCloudParams().enabled;
}
