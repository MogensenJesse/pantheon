// src/ui/FpsCounter.ts — stats.js overlay (DEV only, toggled from DevPanel)
import type Stats from 'stats.js';
import { devSettings } from '../core/GameState';

let StatsCtor: typeof Stats | null = null;
let stats: Stats | null = null;
let statsLoad: Promise<typeof Stats> | null = null;

function positionDom(dom: HTMLElement): void {
  dom.id = 'fps-counter';
  dom.style.position = 'fixed';
  dom.style.top = '12px';
  dom.style.right = '12px';
  dom.style.left = 'auto';
  dom.style.zIndex = '200';
}

async function loadStatsCtor(): Promise<typeof Stats> {
  if (StatsCtor) return StatsCtor;
  if (!statsLoad) {
    statsLoad = import('stats.js').then((mod) => {
      StatsCtor = mod.default;
      return StatsCtor;
    });
  }
  return statsLoad;
}

async function ensureStats(): Promise<Stats> {
  if (!stats) {
    const Ctor = await loadStatsCtor();
    stats = new Ctor();
    stats.showPanel(0);
    positionDom(stats.dom);
    document.body.appendChild(stats.dom);
  }
  return stats;
}

export function setFpsCounterEnabled(enabled: boolean): void {
  if (!import.meta.env.DEV) return;

  devSettings.showFpsCounter = enabled;

  if (enabled) {
    void ensureStats().then((instance) => {
      instance.dom.style.display = 'block';
    });
  } else if (stats) {
    stats.dom.style.display = 'none';
  }
}

export function fpsCounterBegin(): void {
  if (!import.meta.env.DEV || !devSettings.showFpsCounter || !stats) return;
  stats.begin();
}

export function fpsCounterEnd(): void {
  if (!import.meta.env.DEV || !devSettings.showFpsCounter || !stats) return;
  stats.end();
}

export function disposeFpsCounter(): void {
  if (stats?.dom.parentElement) {
    stats.dom.parentElement.removeChild(stats.dom);
  }
  stats = null;
  StatsCtor = null;
  statsLoad = null;
}
