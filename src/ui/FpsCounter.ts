// src/ui/FpsCounter.ts — stats.js overlay (DEV only, toggled from DevPanel)
import Stats from 'stats.js';
import { devSettings } from '../core/GameState';

let stats: Stats | null = null;

function positionDom(dom: HTMLElement): void {
  dom.id = 'fps-counter';
  dom.style.position = 'fixed';
  dom.style.top = '12px';
  dom.style.right = '12px';
  dom.style.left = 'auto';
  dom.style.zIndex = '200';
}

function ensureStats(): Stats {
  if (!stats) {
    stats = new Stats();
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
    ensureStats().dom.style.display = 'block';
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
}
