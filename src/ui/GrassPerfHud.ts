// src/ui/GrassPerfHud.ts — DEV overlay for grass compute profiling (Tier 0)
import { devSettings } from '../core/GameState';
import { deriveGrassFieldLayout, formatGrassFieldSummary } from '../world/grass/grassFieldMetrics';
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
  const lod = grass.getLodDrawStats();
  const g = devSettings.grass;
  const layout = deriveGrassFieldLayout({
    fieldRadius: g.fieldRadius,
    lod0Radius: g.lod0Radius,
    densityPerM2: g.densityPerM2,
    maxInstances: g.maxInstances,
  });
  const rd = devSettings.renderDebug;
  const meshHidden = rd.hideGrass || !g.enabled;

  el.style.display = 'block';
  el.textContent = [
    'grass perf',
    formatGrassFieldSummary(layout),
    `grid ${s.bladesPerSide}/side · R=${g.fieldRadius}m LOD0=${g.lod0Radius}m ρ=${g.densityPerM2}/m²`,
    `LOD ${lod.dualDraw ? 'dual' : 'single'} near ${lod.nearInstances.toLocaleString()} (${lod.nearSegments}seg) far ${lod.farInstances.toLocaleString()} (${lod.farSegments}seg)`,
    `compute last ${s.lastComputeMs.toFixed(2)} ms  avg ${s.avgComputeMs.toFixed(2)}  max ${s.maxComputeMs.toFixed(2)}`,
    `passes ${s.totalComputePasses}  last ${s.lastPass}  skipFrames ${s.skippedComputeFrames}`,
    `queue inFlight ${s.computeInFlight}  pending ${s.computePending}`,
    `mesh ${meshHidden ? 'HIDDEN' : grass.mesh.visible ? 'draw' : 'off'}  compute ${devSettings.grassPerf.skipCompute ? 'SKIP' : 'on'}`,
    'Debug: Hide grass = draw off | Skip compute = stale SSBO',
  ].join('\n');
}

export function disposeGrassPerfHud(): void {
  dom?.remove();
  dom = null;
}
