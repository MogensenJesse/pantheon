// src/ui/GrassPerfHud.ts — DEV overlay for grass compute profiling (Tier 0)
import { devSettings } from '../core/GameState';
import { formatGrassRingSummary, syncAllGrassRingsDerived } from '../world/grass/grassFieldMetrics';
import type { GrassSystem } from '../world/grass/GrassSystem';

let dom: HTMLDivElement | null = null;

function ensureDom(): HTMLDivElement {
  if (dom) return dom;
  dom = document.createElement('div');
  dom.id = 'grass-perf-hud';
  dom.style.cssText = [
    'position:fixed',
    'left:8px',
    'top:56px',
    'z-index:201',
    'font:11px/1.35 monospace',
    'color:#c8f0c0',
    'background:rgba(8,16,8,0.82)',
    'padding:6px 8px',
    'border-radius:4px',
    'pointer-events:none',
    'white-space:pre',
    'display:none',
  ].join(';');
  document.body.appendChild(dom);
  return dom;
}

export function updateGrassPerfHud(grass: GrassSystem | undefined): void {
  if (!import.meta.env.DEV) return;
  const el = ensureDom();
  if (!devSettings.grassPerf.showPerfHud || !grass) {
    el.style.display = 'none';
    return;
  }

  const s = grass.getPerfSnapshot();
  const ringStats = grass.getRingDrawStats();
  const g = devSettings.grass;
  const layout = syncAllGrassRingsDerived(g.rings, g.maxInstancesPerRing);
  const rd = devSettings.renderDebug;
  const meshHidden = rd.hideGrass || !g.enabled;

  const ringLines = layout.rings.map((ring, i) => formatGrassRingSummary(ring, i));

  el.style.display = 'block';
  el.textContent = [
    'grass perf',
    `draw ${s.instanceCount.toLocaleString()} / ${s.allocatedInstanceCount.toLocaleString()} allocated`,
    ...ringLines,
    ...ringStats.map(
      (r) =>
        `draw LOD${r.ringIndex}: ${r.drawInstances.toLocaleString()} / ${r.allocatedInstances.toLocaleString()} (${r.segments} seg) R ${r.innerRadius.toFixed(0)}–${r.outerRadius.toFixed(0)}m`,
    ),
    `compute last ${s.lastComputeMs.toFixed(2)} ms  compact ${s.lastCompactMs.toFixed(2)}  avg ${s.avgComputeMs.toFixed(2)}  max ${s.maxComputeMs.toFixed(2)}`,
    `passes ${s.totalComputePasses}  last ${s.lastPass}  skipFrames ${s.skippedComputeFrames}`,
    `queue inFlight ${s.computeInFlight}  pending ${s.computePending}`,
    `mesh ${meshHidden ? 'HIDDEN' : grass.mesh.visible ? 'draw' : 'off'}  compute ${devSettings.grassPerf.skipCompute ? 'SKIP' : 'on'}  compact ${devSettings.grassPerf.enableCompaction ? 'on' : 'off'}`,
    'Debug: Hide grass = draw off | Skip compute = stale SSBO',
  ].join('\n');
}

export function disposeGrassPerfHud(): void {
  dom?.remove();
  dom = null;
}
