// src/dev/panel/devPanelGuideLine.ts — DEV sliders for the orb path-guide ribbon
import { VISUAL } from '../../config/visualTuning';
import {
  getLiveGuideLineSettings,
  resetGuideLineDevOverrides,
  setGuideLineDevOverride,
} from '../../entities/guideLine/guideLineDevState';
import {
  bindCheckbox,
  bindRange,
  injectRangeRows,
  mountSection,
  type RangeSpec,
  syncSpecs,
} from '../bindRange';

const G = VISUAL.guideLine;

const SPECS: RangeSpec[] = [
  {
    id: 'dev-guide-hdr',
    label: 'HDR intensity',
    min: 0.02,
    max: 8,
    step: 0.01,
    defaultValue: G.hdrIntensity,
    format: (v) => v.toFixed(2),
  },
  {
    id: 'dev-guide-width',
    label: 'Width (m)',
    min: 0.02,
    max: 0.25,
    step: 0.005,
    defaultValue: G.width,
    format: (v) => v.toFixed(3),
  },
  {
    id: 'dev-guide-softness',
    label: 'Softness',
    min: 0,
    max: 2,
    step: 0.01,
    defaultValue: G.softness,
    format: (v) => v.toFixed(2),
  },
  {
    id: 'dev-guide-lift',
    label: 'Lift (m)',
    min: 0.15,
    max: 2,
    step: 0.02,
    defaultValue: G.lift,
    format: (v) => v.toFixed(2),
  },
  {
    id: 'dev-guide-float-amp',
    label: 'Float (m)',
    min: 0,
    max: 0.4,
    step: 0.01,
    defaultValue: G.floatAmp,
    format: (v) => v.toFixed(2),
  },
  {
    id: 'dev-guide-float-speed',
    label: 'Float speed',
    min: 0.2,
    max: 4,
    step: 0.05,
    defaultValue: G.floatSpeed,
    format: (v) => v.toFixed(2),
  },
  {
    id: 'dev-guide-near-fade',
    label: 'Player gap (m)',
    min: 2,
    max: 12,
    step: 0.1,
    defaultValue: G.playerNearFadeEndM,
    format: (v) => v.toFixed(1),
  },
  {
    id: 'dev-guide-pulse-speed',
    label: 'Pulse speed',
    min: 0.05,
    max: 1.2,
    step: 0.01,
    defaultValue: G.pulseSpeed,
    format: (v) => v.toFixed(2),
  },
  {
    id: 'dev-guide-pulse-amp',
    label: 'Pulse amp',
    min: 0,
    max: 1,
    step: 0.01,
    defaultValue: G.pulseAmplitude,
    format: (v) => v.toFixed(2),
  },
  {
    id: 'dev-guide-pulse-idle',
    label: 'Idle brightness',
    min: 0,
    max: 0.4,
    step: 0.001,
    defaultValue: G.pulseIdle,
    format: (v) => v.toFixed(3),
  },
  {
    id: 'dev-guide-pulse-length',
    label: 'Pulse length (m)',
    min: 0.4,
    max: 12,
    step: 0.1,
    defaultValue: G.pulseLengthM,
    format: (v) => v.toFixed(1),
  },
  {
    id: 'dev-guide-pulse-sharp',
    label: 'Pulse sharpness',
    min: 1,
    max: 12,
    step: 0.1,
    defaultValue: G.pulseSharpness,
    format: (v) => v.toFixed(1),
  },
  {
    id: 'dev-guide-noise-amp',
    label: 'Noise amp (m)',
    min: 0,
    max: 0.5,
    step: 0.01,
    defaultValue: G.noiseAmp,
    format: (v) => v.toFixed(2),
  },
  {
    id: 'dev-guide-tip-glow',
    label: 'Tip glow',
    min: 0,
    max: 2.5,
    step: 0.05,
    defaultValue: G.tipGlowBoost,
    format: (v) => v.toFixed(2),
  },
  {
    id: 'dev-guide-breath-amt',
    label: 'Breath amount',
    min: 0,
    max: 1,
    step: 0.01,
    defaultValue: G.breathAmount,
    format: (v) => v.toFixed(2),
  },
  {
    id: 'dev-guide-breath-speed',
    label: 'Breath speed',
    min: 0.05,
    max: 2.5,
    step: 0.05,
    defaultValue: G.breathSpeed,
    format: (v) => v.toFixed(2),
  },
  {
    id: 'dev-guide-terrain-int',
    label: 'Terrain glow',
    min: 0,
    max: 1.5,
    step: 0.02,
    defaultValue: G.terrainGlowIntensity,
    format: (v) => v.toFixed(2),
  },
  {
    id: 'dev-guide-part-idle',
    label: 'Particle idle',
    min: 0,
    max: 0.6,
    step: 0.01,
    defaultValue: G.particleIdle,
    format: (v) => v.toFixed(2),
  },
  {
    id: 'dev-guide-part-spread',
    label: 'Particle spread (m)',
    min: 0.05,
    max: 0.8,
    step: 0.01,
    defaultValue: G.particleSpreadM,
    format: (v) => v.toFixed(2),
  },
  {
    id: 'dev-guide-part-size',
    label: 'Particle size (m)',
    min: 0.02,
    max: 0.2,
    step: 0.005,
    defaultValue: G.particleSizeM,
    format: (v) => v.toFixed(3),
  },
];

const SPEC_KEYS = [
  'hdrIntensity',
  'width',
  'softness',
  'lift',
  'floatAmp',
  'floatSpeed',
  'playerNearFadeEndM',
  'pulseSpeed',
  'pulseAmplitude',
  'pulseIdle',
  'pulseLengthM',
  'pulseSharpness',
  'noiseAmp',
  'tipGlowBoost',
  'breathAmount',
  'breathSpeed',
  'terrainGlowIntensity',
  'particleIdle',
  'particleSpreadM',
  'particleSizeM',
] as const satisfies readonly (keyof typeof G)[];

export function initDevPanelGuideLine(panel: HTMLDivElement): () => void {
  const body = mountSection(panel, {
    hostId: 'dev-section-guide-line',
    title: 'Guide line',
    open: false,
    body: `
      <p class="dev-hint">Path-bound HDR ribbon with sparkles that densify at traveling pulses. Full page reload after <code>visual/guideLine.ts</code> changes.</p>
      <label class="dev-row">
        <span>Enabled</span>
        <input type="checkbox" id="dev-guide-enabled" />
      </label>
      <div id="dev-guide-rows"></div>
      <div class="dev-actions">
        <button type="button" id="dev-guide-reset">Reset guide line</button>
      </div>
    `,
  });
  if (!body) return () => {};

  injectRangeRows(body.querySelector('#dev-guide-rows')!, SPECS);
  const live = getLiveGuideLineSettings();
  syncSpecs(panel, SPECS, (s) => {
    const i = SPECS.indexOf(s);
    const key = SPEC_KEYS[i]!;
    return live[key] as number;
  });

  const disposers: Array<() => void> = [];
  disposers.push(
    bindCheckbox(
      panel,
      'dev-guide-enabled',
      () => getLiveGuideLineSettings().enabled,
      (v) => setGuideLineDevOverride('enabled', v),
    ),
  );
  for (let i = 0; i < SPECS.length; i++) {
    const spec = SPECS[i]!;
    const key = SPEC_KEYS[i]!;
    disposers.push(
      bindRange(panel, spec.id, `${spec.id}-out`, spec.format, (v) => {
        setGuideLineDevOverride(key, v);
      }),
    );
  }

  const resetBtn = panel.querySelector('#dev-guide-reset') as HTMLButtonElement | null;
  const onReset = () => {
    resetGuideLineDevOverrides();
    const d = getLiveGuideLineSettings();
    const enabled = panel.querySelector('#dev-guide-enabled') as HTMLInputElement | null;
    if (enabled) enabled.checked = d.enabled;
    syncSpecs(panel, SPECS, (s) => {
      const i = SPECS.indexOf(s);
      const key = SPEC_KEYS[i]!;
      return d[key] as number;
    });
  };
  resetBtn?.addEventListener('click', onReset);

  return () => {
    for (const fn of disposers) fn();
    resetBtn?.removeEventListener('click', onReset);
  };
}
