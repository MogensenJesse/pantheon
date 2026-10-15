// src/ui/kit/settings.ts — interface settings: size, reduced motion, high contrast
//
// Stored per device in localStorage (never part of a save). The first run follows the system's
// reduced-motion and more-contrast preferences. Applying sets --ui-scale and the data-ui-motion and
// data-ui-contrast attributes that tokens.css reads.

import { normaliseSettings, SETTINGS_KEY, UI_SCALE, type UiSettings } from './settingsModel';

export type { UiSettings } from './settingsModel';
export { UI_SCALE } from './settingsModel';

type Listener = (settings: UiSettings) => void;

let current: UiSettings | null = null;
const listeners = new Set<Listener>();

function systemDefaults(): UiSettings {
  const matches = (query: string) => typeof matchMedia === 'function' && matchMedia(query).matches;
  return {
    scale: UI_SCALE.default,
    reduceMotion: matches('(prefers-reduced-motion: reduce)'),
    highContrast: matches('(prefers-contrast: more)'),
  };
}

function read(): UiSettings {
  const defaults = systemDefaults();
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? normaliseSettings(JSON.parse(raw), defaults) : defaults;
  } catch {
    return defaults;
  }
}

function write(settings: UiSettings | null): void {
  try {
    if (settings) localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    else localStorage.removeItem(SETTINGS_KEY);
  } catch {
    // Storage blocked (private window, site data off): the setting still holds for this session.
  }
}

export function getUiSettings(): UiSettings {
  current ??= read();
  return current;
}

export function applyUiSettings(): void {
  const settings = getUiSettings();
  const root = document.documentElement;
  root.style.setProperty('--ui-scale', String(settings.scale));
  root.dataset.uiMotion = settings.reduceMotion ? 'reduced' : 'full';
  root.dataset.uiContrast = settings.highContrast ? 'high' : 'normal';
}

function commit(next: UiSettings, store: boolean): UiSettings {
  current = next;
  write(store ? next : null);
  applyUiSettings();
  for (const listener of listeners) listener(next);
  return next;
}

export function updateUiSettings(patch: Partial<UiSettings>): UiSettings {
  const now = getUiSettings();
  return commit(normaliseSettings({ ...now, ...patch }, now), true);
}

/** Back to the defaults (and to following the system preferences). */
export function resetUiSettings(): UiSettings {
  return commit(systemDefaults(), false);
}

export function subscribeUiSettings(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
