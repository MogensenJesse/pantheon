// src/ui/kit/settingsModel.ts — what the interface settings are and how stored values are validated
// (pure: no DOM, node-runnable)

export interface UiSettings {
  /** Interface size: scales the root font size, so everything sized in rem follows. */
  scale: number;
  /** Zero-length fades. */
  reduceMotion: boolean;
  /** Stronger text, borders and panels. */
  highContrast: boolean;
}

export const UI_SCALE = { min: 0.8, max: 1.5, step: 0.05, default: 1 } as const;

/** Per-device (not part of a save): the same player on another screen may want another size. */
export const SETTINGS_KEY = 'pantheon.ui.settings.v1';

export function clampScale(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return UI_SCALE.default;
  const clamped = Math.max(UI_SCALE.min, Math.min(UI_SCALE.max, value));
  return Number((Math.round(clamped / UI_SCALE.step) * UI_SCALE.step).toFixed(2));
}

/** Keeps every valid stored field and falls back to `defaults` for anything missing or garbled. */
export function normaliseSettings(raw: unknown, defaults: UiSettings): UiSettings {
  if (typeof raw !== 'object' || raw === null) return { ...defaults };
  const r = raw as Record<string, unknown>;
  return {
    scale: 'scale' in r ? clampScale(r.scale) : defaults.scale,
    reduceMotion: typeof r.reduceMotion === 'boolean' ? r.reduceMotion : defaults.reduceMotion,
    highContrast: typeof r.highContrast === 'boolean' ? r.highContrast : defaults.highContrast,
  };
}
