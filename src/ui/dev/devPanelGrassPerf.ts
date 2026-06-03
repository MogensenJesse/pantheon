// src/ui/dev/devPanelGrassPerf.ts — Tier 0 grass profiling toggles (DEV)
import { devSettings } from '../../core/GameState';
import type { GrassSystem } from '../../world/grass/GrassSystem';
import { logGrassPerfSnapshot, resetGrassPerfStats } from '../../world/grass/grassPerfStats';
import { logGrassRingTrace } from '../../world/grass/grassRingTrace';
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
    <p class="dev-hint"><strong>Profiling (Tier 0)</strong> — overlay appears top-left in the view when enabled.</p>
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
      <span>GPU compaction (Tier 3A)</span>
      <input type="checkbox" id="dev-grass-enable-compaction" />
    </label>
    <p class="dev-hint">Compaction: draw only visible blades. Rebuilds field when toggled.</p>
    <label class="dev-row dev-row-check">
      <span>Ring color viz</span>
      <input type="checkbox" id="dev-grass-ring-color-debug" />
    </label>
    <p class="dev-hint">Ring viz: LOD0 green, LOD1 blue, LOD2 amber (rebuilds materials).</p>
    <div class="dev-actions">
      <button type="button" id="dev-grass-perf-snapshot">Log perf snapshot</button>
      <button type="button" id="dev-grass-perf-reset">Reset perf stats</button>
      <button type="button" id="dev-grass-ring-trace">Log ring trace</button>
      <button type="button" id="dev-grass-compact-trace">Log compact trace</button>
    </div>
  `;
  grassSectionBody.appendChild(mount);

  const p = devSettings.grassPerf;

  const disposers: Array<() => void> = [
    bindCheckbox(panel, 'dev-grass-skip-compute', () => p.skipCompute, (v) => {
      p.skipCompute = v;
    }),
    bindCheckbox(panel, 'dev-grass-perf-hud', () => p.showPerfHud, (v) => {
      p.showPerfHud = v;
    }),
    bindCheckbox(panel, 'dev-grass-log-perf', () => p.logPerfPeriodic, (v) => {
      p.logPerfPeriodic = v;
    }),
    bindCheckbox(panel, 'dev-grass-enable-compaction', () => p.enableCompaction, (v) => {
      p.enableCompaction = v;
      void grass.rebuildField();
    }),
    bindCheckbox(panel, 'dev-grass-ring-color-debug', () => p.debugRingColors, (v) => {
      p.debugRingColors = v;
      void grass.rebuildField();
    }),
  ];

  const onSnapshot = () => {
    const stats = grass.getRingDrawStats();
    logGrassPerfSnapshot(stats, 'manual');
  };
  const onReset = () => resetGrassPerfStats();
  const onRingTrace = () => logGrassRingTrace('manual');
  const onCompactTrace = () => {
    void grass.logCompactTrace();
  };

  panel.querySelector('#dev-grass-perf-snapshot')?.addEventListener('click', onSnapshot);
  panel.querySelector('#dev-grass-perf-reset')?.addEventListener('click', onReset);
  panel.querySelector('#dev-grass-ring-trace')?.addEventListener('click', onRingTrace);
  panel.querySelector('#dev-grass-compact-trace')?.addEventListener('click', onCompactTrace);

  return () => {
    panel.querySelector('#dev-grass-perf-snapshot')?.removeEventListener('click', onSnapshot);
    panel.querySelector('#dev-grass-perf-reset')?.removeEventListener('click', onReset);
    panel.querySelector('#dev-grass-ring-trace')?.removeEventListener('click', onRingTrace);
    panel.querySelector('#dev-grass-compact-trace')?.removeEventListener('click', onCompactTrace);
    for (const fn of disposers) fn();
    mount.remove();
  };
}
