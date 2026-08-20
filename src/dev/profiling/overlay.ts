// src/dev/profiling/overlay.ts — stats.js (FPS/MS/MB) + stats-gl (GPU/compute/draws)
import type StatsJs from 'stats.js';
import type StatsGl from 'stats-gl';
import type { WebGPURenderer } from 'three/webgpu';
import type { RendererCounterSample } from './rendererCounters';

type StatsGlCtor = typeof StatsGl;
type StatsGlInstance = InstanceType<StatsGlCtor>;
type StatsGlPanel = ReturnType<StatsGlInstance['addPanel']>;

const JS_PANEL_W = 80;
const GL_PANEL_W = 90;
const PANEL_H = 48;

let host: HTMLDivElement | null = null;
let jsStats: StatsJs | null = null;
let glStats: StatsGlInstance | null = null;
let statsLoad: Promise<void> | null = null;
let drawPanel: StatsGlPanel | null = null;
let triPanel: StatsGlPanel | null = null;
let maxDraws = 1;
let maxTris = 1;

function layoutHost(el: HTMLDivElement, visible: boolean): void {
  el.style.cssText = [
    'position:fixed',
    'top:12px',
    'right:12px',
    'left:auto',
    'z-index:200',
    visible ? 'display:flex' : 'display:none',
    'flex-direction:column',
    'align-items:flex-end',
    'gap:4px',
    `width:${GL_PANEL_W}px`,
    'pointer-events:auto',
  ].join(';');
}

function layoutStatsJs(dom: HTMLElement): void {
  const canvases = [...dom.querySelectorAll('canvas')];
  dom.style.cssText = [
    'position:relative',
    'display:flex',
    'flex-direction:column',
    `width:${JS_PANEL_W}px`,
    'opacity:0.9',
  ].join(';');
  for (const canvas of canvases) {
    canvas.style.display = 'block';
    canvas.style.position = 'relative';
    canvas.style.left = 'auto';
    canvas.style.top = 'auto';
    canvas.style.width = `${JS_PANEL_W}px`;
    canvas.style.height = `${PANEL_H}px`;
  }
}

function layoutStatsGl(dom: HTMLElement): void {
  const canvases = [...dom.querySelectorAll('canvas')];
  dom.style.cssText = [
    'position:relative',
    `width:${GL_PANEL_W}px`,
    `height:${Math.max(canvases.length, 1) * PANEL_H}px`,
    'opacity:0.9',
  ].join(';');
  canvases.forEach((canvas, i) => {
    canvas.style.position = 'absolute';
    canvas.style.left = '0';
    canvas.style.top = `${i * PANEL_H}px`;
    canvas.style.width = `${GL_PANEL_W}px`;
    canvas.style.height = `${PANEL_H}px`;
    canvas.style.display = 'block';
  });
}

function layoutOverlay(visible: boolean): void {
  if (!host) return;
  layoutHost(host, visible);
  if (jsStats) layoutStatsJs(jsStats.dom);
  if (glStats) layoutStatsGl(glStats.dom);
}

function ensureHost(): HTMLDivElement {
  if (host) return host;
  host = document.createElement('div');
  host.id = 'perf-overlay';
  layoutHost(host, false);
  document.body.appendChild(host);
  return host;
}

async function ensureStats(renderer: WebGPURenderer): Promise<void> {
  if (glStats && jsStats) {
    layoutOverlay(true);
    return;
  }
  if (!statsLoad) {
    statsLoad = (async () => {
      const root = ensureHost();
      const [jsMod, glMod] = await Promise.all([import('stats.js'), import('stats-gl')]);
      const JsCtor = jsMod.default;
      jsStats = new JsCtor();
      jsStats.dom.addEventListener(
        'click',
        (event) => {
          event.stopImmediatePropagation();
        },
        true,
      );
      root.appendChild(jsStats.dom);

      const GlCtor = glMod.default;
      const instance = new GlCtor({
        trackGPU: true,
        trackCPT: true,
        trackHz: true,
        trackFPS: false,
        logsPerSecond: 4,
        graphsPerSecond: 30,
        samplesLog: 40,
        samplesGraph: 10,
        precision: 2,
        horizontal: false,
        minimal: false,
      });
      await instance.init(renderer);
      root.appendChild(instance.dom);
      drawPanel = instance.addPanel(new GlCtor.Panel('DRAW', '#f8f', '#212'));
      triPanel = instance.addPanel(new GlCtor.Panel('TRI', '#8f8', '#121'));
      glStats = instance;
      layoutOverlay(true);
    })();
  }
  await statsLoad;
  layoutOverlay(true);
}

export async function setOverlayVisible(renderer: WebGPURenderer, visible: boolean): Promise<void> {
  if (!import.meta.env.DEV) return;
  if (visible) {
    await ensureStats(renderer);
    layoutOverlay(true);
  } else if (host) {
    layoutHost(host, false);
  }
}

export function isOverlayMounted(): boolean {
  return glStats != null;
}

export function overlayBeginFrame(): void {
  jsStats?.begin();
}

export function overlayEndFrame(): void {
  jsStats?.end();
}

export function updateOverlay(counters: RendererCounterSample): void {
  if (!host || host.style.display === 'none') return;
  glStats?.update();
  if (glStats) layoutStatsGl(glStats.dom);
  maxDraws = Math.max(maxDraws, counters.drawCalls, 1);
  maxTris = Math.max(maxTris, counters.triangles, 1);
  drawPanel?.update(counters.drawCalls, maxDraws, 0);
  drawPanel?.updateGraph(counters.drawCalls, maxDraws);
  const triK = counters.triangles / 1000;
  const maxTriK = maxTris / 1000;
  triPanel?.update(triK, maxTriK, 1);
  triPanel?.updateGraph(triK, maxTriK);
}

export function disposeOverlay(): void {
  jsStats?.dom.parentElement?.removeChild(jsStats.dom);
  jsStats = null;
  if (glStats?.dom.parentElement) {
    glStats.dom.parentElement.removeChild(glStats.dom);
  }
  glStats?.dispose();
  glStats = null;
  host?.parentElement?.removeChild(host);
  host = null;
  statsLoad = null;
  drawPanel = null;
  triPanel = null;
}
