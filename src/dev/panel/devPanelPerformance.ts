// src/dev/panel/devPanelPerformance.ts — standalone Perf panel (overlay, HUD, isolation)
import { devSettings } from '../../core/GameState';
import { syncValleyFogDebug } from '../../rendering/atmosphere/valleyFog';
import type { PostFXContext } from '../../rendering/PostFX';
import { bindCheckbox } from '../bindRange';
import { registerDevPanelLateTick } from '../panelTickHooks';
import {
  exportPerformanceSnapshot,
  getPerfHud,
  logGpuDevice,
  setPerformanceOverlayEnabled,
  setThreeInspectorVisible,
} from '../profiling';

interface DebugCheckSpec {
  id: string;
  label: string;
  key: keyof typeof devSettings.renderDebug;
}

const DEBUG_CHECK_SPECS: DebugCheckSpec[] = [
  { id: 'dev-hide-terrain', label: 'Hide terrain', key: 'hideTerrain' },
  { id: 'dev-hide-water', label: 'Hide water', key: 'hideWater' },
  { id: 'dev-hide-map-props', label: 'Hide map props', key: 'hideMapProps' },
  { id: 'dev-hide-grass', label: 'Hide grass', key: 'hideGrass' },
  { id: 'dev-hide-grass-lod0', label: 'Hide grass LOD0 (near)', key: 'hideGrassLod0' },
  { id: 'dev-hide-grass-lod1', label: 'Hide grass LOD1 (mid)', key: 'hideGrassLod1' },
  { id: 'dev-hide-grass-lod2', label: 'Hide grass LOD2 (far)', key: 'hideGrassLod2' },
  { id: 'dev-hide-grass-flowers', label: 'Hide flowers', key: 'hideGrassFlowers' },
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

function fmt(n: number, digits = 1): string {
  return n.toFixed(digits);
}

function fmtCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 10_000) return `${Math.round(n / 1000)}k`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

export function initPerformancePanel(
  panel: HTMLDivElement,
  postFX: PostFXContext,
  onLogRenderDebug?: () => void,
): () => void {
  const host = panel.querySelector('#perf-section-root');
  if (!host) return () => {};

  const checkRows = DEBUG_CHECK_SPECS.map(
    (s) => `
      <label class="dev-row dev-row-check">
        <span>${s.label}</span>
        <input type="checkbox" id="${s.id}" />
      </label>`,
  ).join('');

  host.innerHTML = `
      <p class="dev-hint">Overlay: stats.js FPS/MS/MB plus stats-gl GPU/compute/draw/triangle graphs. Inspector: per-pass GPU, memory, command timeline, TSL graph. Chrome Performance shows <code>pantheon/*</code> User Timing. Console: <code>window.__pantheonPerf</code>. Spector.js is WebGL-only — skip it.</p>
      <label class="dev-row dev-row-check">
        <span>Performance overlay</span>
        <input type="checkbox" id="dev-show-fps" />
      </label>
      <label class="dev-row dev-row-check">
        <span>Three.js Inspector</span>
        <input type="checkbox" id="dev-show-inspector" />
      </label>
      <p class="dev-hint">Inspector Settings → TSL Graph for node inspection. Do not enable Force WebGL (it persists and breaks this WebGPU project). Enable Inspector, wait a second, then Export snapshot (or <code>window.__pantheonPerf.inspectorReport()</code>) for a per-pass GPU table.</p>
      <dl class="dev-lod-stats" id="dev-perf-hud">
        <div class="dev-lod-stats-row"><dt>FPS avg / p95</dt><dd id="dev-perf-fps">—</dd></div>
        <div class="dev-lod-stats-row"><dt>CPU / GPU / CPT ms</dt><dd id="dev-perf-times">—</dd></div>
        <div class="dev-lod-stats-row"><dt>Draws / tris</dt><dd id="dev-perf-draw">—</dd></div>
        <div class="dev-lod-stats-row"><dt>Grass alloc / compact</dt><dd id="dev-perf-grass">—</dd></div>
        <div class="dev-lod-stats-row"><dt>Geo / tex / GPU MB</dt><dd id="dev-perf-mem">—</dd></div>
        <div class="dev-lod-stats-row"><dt>Hitches (5s)</dt><dd id="dev-perf-hitch">—</dd></div>
        <div class="dev-lod-stats-row"><dt>timestamp-query</dt><dd id="dev-perf-tsq">—</dd></div>
        <div class="dev-lod-stats-row"><dt>Backend</dt><dd id="dev-perf-backend">—</dd></div>
        <div class="dev-lod-stats-row dev-lod-stats-total"><dt>Adapter</dt><dd id="dev-perf-adapter">—</dd></div>
      </dl>
      <p class="dev-hint" id="dev-perf-sections"></p>
      <details class="dev-section" open>
        <summary>Isolate</summary>
        <div class="dev-section-body">
          <p class="dev-hint">Toggle subsystems to isolate GPU cost. LOD/flower hides skip that ring's compact as well as draw. Master Hide grass is draw-only (compact still runs). Overlay triangles count allocated capacity, not compacted instances.</p>
          ${checkRows}
        </div>
      </details>
      <div class="dev-actions">
        <button type="button" id="dev-gpu-info">Log GPU snapshot</button>
        <button type="button" id="dev-render-debug">Log render debug</button>
        <button type="button" id="dev-perf-device">Log GPU device</button>
        <button type="button" id="dev-perf-export">Export snapshot</button>
      </div>
    `;

  const disposers: Array<() => void> = [];
  disposers.push(
    bindCheckbox(
      panel,
      'dev-show-fps',
      () => devSettings.showFpsCounter,
      (v) => {
        setPerformanceOverlayEnabled(v);
      },
    ),
  );
  disposers.push(
    bindCheckbox(
      panel,
      'dev-show-inspector',
      () => devSettings.showThreeInspector,
      (v) => {
        setThreeInspectorVisible(v);
      },
    ),
  );
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

  const fpsEl = panel.querySelector('#dev-perf-fps');
  const timesEl = panel.querySelector('#dev-perf-times');
  const drawEl = panel.querySelector('#dev-perf-draw');
  const grassEl = panel.querySelector('#dev-perf-grass');
  const memEl = panel.querySelector('#dev-perf-mem');
  const hitchEl = panel.querySelector('#dev-perf-hitch');
  const tsqEl = panel.querySelector('#dev-perf-tsq');
  const backendEl = panel.querySelector('#dev-perf-backend');
  const adapterEl = panel.querySelector('#dev-perf-adapter');
  const sectionsEl = panel.querySelector('#dev-perf-sections');

  disposers.push(
    registerDevPanelLateTick(() => {
      const hud = getPerfHud();
      if (fpsEl) fpsEl.textContent = `${fmt(hud.fpsAvg, 0)} / ${fmt(hud.fpsP95, 0)}`;
      if (timesEl) {
        timesEl.textContent = `${fmt(hud.cpuMs)} / ${fmt(hud.gpuRenderMs)} / ${fmt(hud.gpuComputeMs)}`;
      }
      if (drawEl) {
        drawEl.textContent = `${hud.drawCalls} / ${(hud.triangles / 1000).toFixed(1)}k`;
      }
      if (grassEl) {
        const d = devSettings.renderDebug;
        const ringHidden = [d.hideGrassLod0, d.hideGrassLod1, d.hideGrassLod2];
        const compactShown =
          hud.grassCompactedPerRing.length > 0
            ? hud.grassCompactedPerRing.reduce((sum, n, i) => sum + (ringHidden[i] ? 0 : n), 0)
            : hud.grassCompacted;
        const rings = hud.grassCompactedPerRing
          .map((n, i) => (ringHidden[i] ? 'hid' : fmtCount(n)))
          .join(' / ');
        grassEl.textContent = rings
          ? `${fmtCount(hud.grassAllocated)} / ${fmtCount(compactShown)} · ${rings}`
          : '—';
      }
      if (memEl) {
        const gpu = hud.gpuMemoryMb != null ? fmt(hud.gpuMemoryMb, 0) : '—';
        memEl.textContent = `${hud.geometries} / ${hud.textures} / ${gpu}`;
      }
      if (hitchEl) hitchEl.textContent = String(hud.hitchCount);
      if (tsqEl) tsqEl.textContent = hud.timestampQuery ? 'yes' : 'no';
      if (backendEl) backendEl.textContent = hud.backend;
      if (adapterEl) adapterEl.textContent = hud.adapter;
      if (sectionsEl) {
        const top = hud.sections
          .slice(0, 6)
          .map((s) => `${s.name} ${fmt(s.ms, 2)}`)
          .join(' · ');
        sectionsEl.textContent = top ? `CPU ${top}` : '';
      }
    }),
  );

  const gpuBtn = panel.querySelector('#dev-gpu-info') as HTMLButtonElement | null;
  const onGpu = () => postFX.logGpuInfo();
  gpuBtn?.addEventListener('click', onGpu);

  const renderDebugBtn = panel.querySelector('#dev-render-debug') as HTMLButtonElement | null;
  const onRenderDebug = () => {
    onLogRenderDebug?.();
    console.info('[RenderDebug] manual log (see frame + sky entries above)');
  };
  renderDebugBtn?.addEventListener('click', onRenderDebug);

  const deviceBtn = panel.querySelector('#dev-perf-device') as HTMLButtonElement | null;
  const onDevice = () => logGpuDevice();
  deviceBtn?.addEventListener('click', onDevice);

  const exportBtn = panel.querySelector('#dev-perf-export') as HTMLButtonElement | null;
  const onExport = () => {
    void exportPerformanceSnapshot();
  };
  exportBtn?.addEventListener('click', onExport);

  return () => {
    for (const fn of disposers) fn();
    gpuBtn?.removeEventListener('click', onGpu);
    renderDebugBtn?.removeEventListener('click', onRenderDebug);
    deviceBtn?.removeEventListener('click', onDevice);
    exportBtn?.removeEventListener('click', onExport);
  };
}
