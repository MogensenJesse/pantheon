// src/ui/dev/devPanelRenderDebug.ts
import { devSettings, type RenderDebugSettings } from '../../core/GameState';
import { syncValleyFogDebug } from '../../rendering/atmosphere/valleyFog';
import type { PostFXContext } from '../../rendering/PostFX';
import { bindCheckbox, mountSection } from './bindRange';

interface DebugCheckSpec {
  id: string;
  label: string;
  key: keyof RenderDebugSettings;
}

const DEBUG_CHECK_SPECS: DebugCheckSpec[] = [
  { id: 'dev-hide-terrain', label: 'Hide terrain', key: 'hideTerrain' },
  { id: 'dev-hide-water', label: 'Hide water', key: 'hideWater' },
  { id: 'dev-hide-map-props', label: 'Hide map props', key: 'hideMapProps' },
  { id: 'dev-hide-grass', label: 'Hide grass', key: 'hideGrass' },
  { id: 'dev-hide-sky', label: 'Hide sky', key: 'hideSky' },
  { id: 'dev-hide-clouds', label: 'Hide clouds', key: 'hideClouds' },
  { id: 'dev-disable-bloom', label: 'Disable bloom', key: 'disableBloom' },
  { id: 'dev-disable-shadows', label: 'Disable shadows', key: 'disableShadows' },
  { id: 'dev-disable-aa', label: 'Disable AA (FXAA/SMAA)', key: 'disableAa' },
  { id: 'dev-disable-god-rays', label: 'Disable god rays', key: 'disableGodRays' },
  { id: 'dev-disable-haze', label: 'Disable haze', key: 'disableHaze' },
  { id: 'dev-disable-shore-depth', label: 'Disable shore depth', key: 'disableShoreDepth' },
  { id: 'dev-disable-dof', label: 'Disable DoF', key: 'disableDof' },
  { id: 'dev-disable-grade', label: 'Disable grade', key: 'disableGrade' },
  { id: 'dev-disable-fsr', label: 'Disable FSR (bilinear upscale)', key: 'disableFsr' },
  { id: 'dev-log-gpu-periodic', label: 'Log GPU / 3s', key: 'logGpuPeriodic' },
];

export function initDevPanelRenderDebug(
  panel: HTMLDivElement,
  postFX: PostFXContext,
  onLogRenderDebug?: () => void,
): () => void {
  const checkRows = DEBUG_CHECK_SPECS.map(
    (s) => `
      <label class="dev-row dev-row-check">
        <span>${s.label}</span>
        <input type="checkbox" id="${s.id}" />
      </label>`,
  ).join('');

  const body = mountSection(panel, {
    hostId: 'dev-section-performance',
    title: 'Debug',
    open: true,
    body: `
      <p class="dev-hint">Toggle subsystems to find GPU bottlenecks.</p>
      ${checkRows}
      <div class="dev-actions">
        <button type="button" id="dev-gpu-info">Log GPU snapshot</button>
        <button type="button" id="dev-render-debug">Log render debug</button>
      </div>
    `,
  });
  if (!body) return () => {};

  const disposers: Array<() => void> = [];
  for (const spec of DEBUG_CHECK_SPECS) {
    disposers.push(
      bindCheckbox(
        panel,
        spec.id,
        () => devSettings.renderDebug[spec.key] as boolean,
        (v) => {
          (devSettings.renderDebug[spec.key] as boolean) = v;
          if (spec.key === 'disableHaze') syncValleyFogDebug();
        },
      ),
    );
  }

  const gpuBtn = panel.querySelector('#dev-gpu-info') as HTMLButtonElement | null;
  const onGpu = () => postFX.logGpuInfo();
  gpuBtn?.addEventListener('click', onGpu);

  const renderDebugBtn = panel.querySelector('#dev-render-debug') as HTMLButtonElement | null;
  const onRenderDebug = () => {
    onLogRenderDebug?.();
    console.info('[RenderDebug] manual log (see frame + sky entries above)');
  };
  renderDebugBtn?.addEventListener('click', onRenderDebug);

  return () => {
    for (const fn of disposers) fn();
    gpuBtn?.removeEventListener('click', onGpu);
    renderDebugBtn?.removeEventListener('click', onRenderDebug);
  };
}
