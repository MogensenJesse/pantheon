// src/rendering/clouds/cumulusDeckSliders.ts — shared deck slider ranges
// The map editor and the cloud designer both render these. Sun is preview-only.

import type { CumulusDeckConfig } from './cumulusDeck';

export type CumulusDeckSliderKey =
  | keyof Omit<CumulusDeckConfig, 'greenSize' | 'redSize' | 'seed'>
  | 'sunPhase';

export interface CumulusDeckSliderSpec {
  key: CumulusDeckSliderKey;
  label: string;
  min: number;
  max: number;
  step: number;
  /** time = designer sun scrub. deck = field. wind = drift speed. */
  group: 'time' | 'deck' | 'wind';
  /** Map-editor heading. Deck sliders split across banks, height, and extent. */
  section: 'time' | 'banks' | 'height' | 'extent' | 'wind';
  hint?: string;
}

export const CUMULUS_DECK_SLIDERS: readonly CumulusDeckSliderSpec[] = [
  {
    key: 'coverage',
    label: 'Coverage',
    min: 0,
    max: 1,
    step: 0.01,
    group: 'deck',
    section: 'banks',
    hint: 'How much of the noise field places clouds. Density still sets the requested count.',
  },
  {
    key: 'bankScaleM',
    label: 'Bank scale (m)',
    min: 64,
    max: 512,
    step: 8,
    group: 'deck',
    section: 'banks',
    hint: 'Size of the weather pattern. Larger cells make bigger banks.',
  },
  {
    key: 'bankSoftness',
    label: 'Bank softness',
    min: 0.02,
    max: 0.6,
    step: 0.01,
    group: 'deck',
    section: 'banks',
    hint: 'How sharp the edge of a bank is. Low cuts a hard boundary.',
  },
  {
    key: 'density',
    label: 'Density',
    min: 0,
    max: 1,
    step: 0.001,
    group: 'deck',
    section: 'banks',
  },
  {
    key: 'supercluster',
    label: 'Supercluster',
    min: 0,
    max: 1,
    step: 0.01,
    group: 'deck',
    section: 'banks',
    hint: '0 is even weight and 1× size. 1 uses the wide yellow band, tight red spacing, and 0.5×–6× size.',
  },
  {
    key: 'deckMinY',
    label: 'Min height (m)',
    min: 0,
    max: 800,
    step: 1,
    group: 'deck',
    section: 'height',
  },
  {
    key: 'deckMaxY',
    label: 'Max height (m)',
    min: 0,
    max: 800,
    step: 1,
    group: 'deck',
    section: 'height',
  },
  {
    key: 'deckYBiasM',
    label: 'Deck Y bias (m)',
    min: -40,
    max: 80,
    step: 0.5,
    group: 'deck',
    section: 'height',
    hint: 'One meter offset on the shared base. Not multiplied by height scale.',
  },
  {
    key: 'spread',
    label: 'Spread (m)',
    min: 160,
    max: 1600,
    step: 10,
    group: 'deck',
    section: 'extent',
  },
  {
    key: 'edgeFadeM',
    label: 'Edge fade (m)',
    min: 0,
    max: 800,
    step: 1,
    group: 'deck',
    section: 'extent',
  },
  {
    key: 'windSpeed',
    label: 'Wind speed',
    min: 0,
    max: 100,
    step: 0.1,
    group: 'wind',
    section: 'wind',
    hint: 'Shared deck speed. Animate gates the preview clock. Play wind keeps running.',
  },
  {
    key: 'sunPhase',
    label: 'Sun',
    min: 0,
    max: 1,
    step: 0.001,
    group: 'time',
    section: 'time',
  },
];

export function cumulusDeckSlider(key: CumulusDeckSliderKey): CumulusDeckSliderSpec {
  const spec = CUMULUS_DECK_SLIDERS.find((entry) => entry.key === key);
  if (!spec) throw new Error(`Missing cumulus deck slider ${key}`);
  return spec;
}

export function clampCumulusDeckSlider(key: CumulusDeckSliderKey, value: number): number {
  const spec = cumulusDeckSlider(key);
  return Math.min(spec.max, Math.max(spec.min, value));
}
