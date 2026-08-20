// src/dev/panel/devPanelOrganicOrb.ts — DEV sliders for the shared player/residue orb volume
import type { OrganicOrbSettings } from '../../config/visual/organicOrb';
import { VISUAL } from '../../config/visualTuning';
import {
  getLiveOrganicOrbSettings,
  resetOrganicOrbDevOverrides,
  setOrganicOrbDevOverride,
} from '../../entities/organicOrb/organicOrbDevState';
import { bindRange, injectRangeRows, mountSection, type RangeSpec, syncSpecs } from '../bindRange';

const O = VISUAL.organicOrb;

type OrbSliderKey = keyof OrganicOrbSettings;

const SPECS: Array<RangeSpec & { key: OrbSliderKey }> = [
  {
    id: 'dev-orb-fill-opacity',
    key: 'fillOpacity',
    label: 'Fill opacity',
    min: 0,
    max: 1,
    step: 0.01,
    defaultValue: O.fillOpacity,
    format: (v) => v.toFixed(2),
  },
  {
    id: 'dev-orb-fill-white',
    key: 'fillWhite',
    label: 'Fill white',
    min: 0,
    max: 1,
    step: 0.01,
    defaultValue: O.fillWhite,
    format: (v) => v.toFixed(2),
  },
  {
    id: 'dev-orb-refract',
    key: 'refractionStrength',
    label: 'Refraction',
    min: 0,
    max: 0.12,
    step: 0.001,
    defaultValue: O.refractionStrength,
    format: (v) => v.toFixed(3),
  },
  {
    id: 'dev-orb-refract-scale',
    key: 'refractionScale',
    label: 'Refract scale',
    min: 0.1,
    max: 16,
    step: 0.1,
    defaultValue: O.refractionScale,
    format: (v) => v.toFixed(1),
  },
  {
    id: 'dev-orb-nebula',
    key: 'nebula',
    label: 'Nebula',
    min: 0,
    max: 1,
    step: 0.01,
    defaultValue: O.nebula,
    format: (v) => v.toFixed(2),
  },
  {
    id: 'dev-orb-core-power',
    key: 'corePower',
    label: 'Core power',
    min: 0.5,
    max: 8,
    step: 0.05,
    defaultValue: O.corePower,
    format: (v) => v.toFixed(2),
  },
  {
    id: 'dev-orb-core-amount',
    key: 'coreAmount',
    label: 'Core amount',
    min: 0,
    max: 1,
    step: 0.01,
    defaultValue: O.coreAmount,
    format: (v) => v.toFixed(2),
  },
  {
    id: 'dev-orb-rim-power',
    key: 'rimPower',
    label: 'Rim power',
    min: 0.4,
    max: 12,
    step: 0.05,
    defaultValue: O.rimPower,
    format: (v) => v.toFixed(2),
  },
  {
    id: 'dev-orb-rim-hdr',
    key: 'rimHdr',
    label: 'Rim HDR',
    min: 0.05,
    max: 12,
    step: 0.05,
    defaultValue: O.rimHdr,
    format: (v) => v.toFixed(2),
  },
  {
    id: 'dev-orb-morph-amp',
    key: 'morphAmp',
    label: 'Morph (m)',
    min: 0,
    max: 0.2,
    step: 0.001,
    defaultValue: O.morphAmp,
    format: (v) => v.toFixed(3),
  },
  {
    id: 'dev-orb-morph-speed',
    key: 'morphSpeed',
    label: 'Morph speed',
    min: 0,
    max: 2,
    step: 0.02,
    defaultValue: O.morphSpeed,
    format: (v) => v.toFixed(2),
  },
  {
    id: 'dev-orb-morph-scale',
    key: 'morphScale',
    label: 'Morph scale',
    min: 0.05,
    max: 16,
    step: 0.1,
    defaultValue: O.morphScale,
    format: (v) => v.toFixed(1),
  },
  {
    id: 'dev-orb-stretch',
    key: 'stretchAmt',
    label: 'Move stretch',
    min: 0,
    max: 1,
    step: 0.01,
    defaultValue: O.stretchAmt,
    format: (v) => v.toFixed(2),
  },
  {
    id: 'dev-orb-stretch-trail',
    key: 'stretchTrail',
    label: 'Move trail (m)',
    min: 0,
    max: 1,
    step: 0.005,
    defaultValue: O.stretchTrail,
    format: (v) => v.toFixed(3),
  },
  {
    id: 'dev-orb-stretch-ref',
    key: 'stretchSpeedRef',
    label: 'Stretch at (m/s)',
    min: 0.5,
    max: 12,
    step: 0.1,
    defaultValue: O.stretchSpeedRef,
    format: (v) => v.toFixed(1),
  },
  {
    id: 'dev-orb-stretch-turn',
    key: 'stretchTurnSmooth',
    label: 'Reverse ease',
    min: 0.5,
    max: 16,
    step: 0.1,
    defaultValue: O.stretchTurnSmooth,
    format: (v) => v.toFixed(1),
  },
  {
    id: 'dev-orb-pulse-speed',
    key: 'pulseSpeed',
    label: 'Pulse speed',
    min: 0,
    max: 1.5,
    step: 0.01,
    defaultValue: O.pulseSpeed,
    format: (v) => v.toFixed(2),
  },
  {
    id: 'dev-orb-pulse-spacing',
    key: 'pulseSpacingM',
    label: 'Pulse spacing (m)',
    min: 0.3,
    max: 4,
    step: 0.05,
    defaultValue: O.pulseSpacingM,
    format: (v) => v.toFixed(2),
  },
  {
    id: 'dev-orb-pulse-length',
    key: 'pulseLengthM',
    label: 'Pulse length (m)',
    min: 0.08,
    max: 2,
    step: 0.02,
    defaultValue: O.pulseLengthM,
    format: (v) => v.toFixed(2),
  },
  {
    id: 'dev-orb-pulse-idle',
    key: 'pulseIdle',
    label: 'Idle rim',
    min: 0,
    max: 1,
    step: 0.01,
    defaultValue: O.pulseIdle,
    format: (v) => v.toFixed(2),
  },
  {
    id: 'dev-orb-pulse-amp',
    key: 'pulseAmplitude',
    label: 'Pulse amp',
    min: 0,
    max: 1,
    step: 0.01,
    defaultValue: O.pulseAmplitude,
    format: (v) => v.toFixed(2),
  },
];

type MissingSlider = Exclude<OrbSliderKey, (typeof SPECS)[number]['key']>;
const _allSlidersWired: [MissingSlider] extends [never] ? true : MissingSlider = true;
void _allSlidersWired;

export function initDevPanelOrganicOrb(panel: HTMLDivElement): () => void {
  const body = mountSection(panel, {
    hostId: 'dev-section-orb',
    title: 'Orb',
    open: false,
    body: `
      <p class="dev-hint">Player volume (white rim). Morph is local-space so it does not swim while moving; Move stretch / trail elongate along velocity (sparkle-lag teardrop). Fill white slider is the 100% energy cap; 0% uses <code>player.orbFillWhiteMin</code> (reload). Residue orbs use <code>visual/energyOrb.ts</code> look overrides (rim / fill white) and a smaller radius — they do not stretch. Sparkles: Glow &amp; bloom → Particles. Full page reload after shader graph changes.</p>
      <div id="dev-orb-rows"></div>
      <div class="dev-actions">
        <button type="button" id="dev-orb-reset">Reset orb</button>
      </div>
    `,
  });
  if (!body) return () => {};

  injectRangeRows(body.querySelector('#dev-orb-rows')!, SPECS);
  const live = getLiveOrganicOrbSettings();
  syncSpecs(panel, SPECS, (s) => live[s.key]);

  const disposers: Array<() => void> = [];
  for (const spec of SPECS) {
    disposers.push(
      bindRange(panel, spec.id, `${spec.id}-out`, spec.format, (v) => {
        setOrganicOrbDevOverride(spec.key, v);
      }),
    );
  }

  const resetBtn = panel.querySelector('#dev-orb-reset') as HTMLButtonElement | null;
  const onReset = () => {
    resetOrganicOrbDevOverrides();
    const d = getLiveOrganicOrbSettings();
    syncSpecs(panel, SPECS, (s) => d[s.key]);
  };
  resetBtn?.addEventListener('click', onReset);

  return () => {
    for (const fn of disposers) fn();
    resetBtn?.removeEventListener('click', onReset);
  };
}
