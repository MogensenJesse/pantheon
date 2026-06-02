// src/ui/dev/devPanelGrassPerf.ts — Tier 0 grass profiling toggles (DEV)
import { devSettings } from '../../core/GameState';
import type { GrassSystem } from '../../world/grass/GrassSystem';
import { logGrassPerfSnapshot, resetGrassPerfStats } from '../../world/grass/grassPerfStats';
import { logGrassLodTrace } from '../../world/grass/grassLodTrace';
import { bindCheckbox } from './bindRange';

/** Mount into the Grass `<details>` body (no separate layout host). */
export function initDevPanelGrassPerf(
  grassSectionBody: HTMLElement,
  panel: HTMLDivElement,
  grass: GrassSystem,
): () => void {
  const mount = document.createElement('div');
  mount.id = 'dev-grass-perf-mount';
  mount.innerHTML = `
    <p class="dev-hint"><strong>Profiling (Tier 0)</strong> — overlay appears top-left in the game view when enabled.</p>
    <p class="dev-hint">A: Debug → Hide grass. B: Skip compute = draw only (stale field).</p>
    <label class="dev-row dev-row-check">
      <span>Show perf HUD</span>
      <input type="checkbox" id="dev-grass-perf-hud" />
    </label>
    <label class="dev-row dev-row-check">
      <span>Skip grass compute</span>
      <input type="checkbox" id="dev-grass-skip-compute" />
    </label>
    <label class="dev-row dev-row-check">
      <span>Log perf / 3s</span>
      <input type="checkbox" id="dev-grass-log-perf" />
    </label>
    <label class="dev-row dev-row-check">
      <span>LOD dual draw</span>
      <input type="checkbox" id="dev-grass-lod-dual" checked />
    </label>
    <label class="dev-row dev-row-check">
      <span>LOD ring viz (LOD0 / LOD1)</span>
      <input type="checkbox" id="dev-grass-lod-ring-debug" />
    </label>
    <label class="dev-row dev-row-check">
      <span>LOD slot heatmap</span>
      <input type="checkbox" id="dev-grass-lod-slot-debug" />
    </label>
    <p class="dev-hint">Ring viz: green disk = LOD0 (near, 4 seg), blue outer = LOD1 (far, 2 seg). Yellow = dual draw off (all LOD0). Heatmap = SSBO remap check (rainbow bands).</p>
    <div class="dev-actions">
      <button type="button" id="dev-grass-perf-snapshot">Log perf snapshot</button>
      <button type="button" id="dev-grass-perf-reset">Reset perf stats</button>
      <button type="button" id="dev-grass-lod-trace">Log LOD trace</button>
    </div>
  `;
  grassSectionBody.appendChild(mount);

  const p = devSettings.grassPerf;
  const g = devSettings.grass;
  const dualInput = panel.querySelector('#dev-grass-lod-dual') as HTMLInputElement | null;
  if (dualInput) dualInput.checked = g.lodDualDraw;

  const disposers: Array<() => void> = [
    bindCheckbox(panel, 'dev-grass-lod-dual', () => g.lodDualDraw, (v) => {
      g.lodDualDraw = v;
      void grass.rebuildField();
    }),
    bindCheckbox(panel, 'dev-grass-skip-compute', () => p.skipCompute, (v) => {
      p.skipCompute = v;
    }),
    bindCheckbox(panel, 'dev-grass-perf-hud', () => p.showPerfHud, (v) => {
      p.showPerfHud = v;
    }),
    bindCheckbox(panel, 'dev-grass-log-perf', () => p.logPerfPeriodic, (v) => {
      p.logPerfPeriodic = v;
    }),
    bindCheckbox(panel, 'dev-grass-lod-ring-debug', () => p.debugLodRings, (v) => {
      p.debugLodRings = v;
      if (v) p.debugLodSlots = false;
      void grass.rebuildField();
    }),
    bindCheckbox(panel, 'dev-grass-lod-slot-debug', () => p.debugLodSlots, (v) => {
      p.debugLodSlots = v;
      if (v) p.debugLodRings = false;
      void grass.rebuildField();
    }),
  ];

  const snapshotBtn = panel.querySelector('#dev-grass-perf-snapshot');
  const resetBtn = panel.querySelector('#dev-grass-perf-reset');
  const lodTraceBtn = panel.querySelector('#dev-grass-lod-trace');
  const onSnapshot = () => {
    const s = grass.getPerfSnapshot();
    logGrassPerfSnapshot(s.bladesPerSide, 'manual');
    const lod = grass.getLodDrawStats();
    console.info('[grass/lod] draw', lod);
  };
  const onReset = () => resetGrassPerfStats();
  const onLodTrace = () => logGrassLodTrace('manual');
  snapshotBtn?.addEventListener('click', onSnapshot);
  resetBtn?.addEventListener('click', onReset);
  lodTraceBtn?.addEventListener('click', onLodTrace);

  return () => {
    snapshotBtn?.removeEventListener('click', onSnapshot);
    resetBtn?.removeEventListener('click', onReset);
    lodTraceBtn?.removeEventListener('click', onLodTrace);
    for (const fn of disposers) fn();
    mount.remove();
  };
}
