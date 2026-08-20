// src/dev/panel/devPanelParticles.ts — Glow & bloom → Particles → Guide line / Player / Energy orb
import { VISUAL } from '../../config/visualTuning';
import {
  getLiveEnergyOrbParticleSettings,
  resetEnergyOrbParticleDevOverrides,
  setEnergyOrbParticleDevOverride,
} from '../../entities/energyOrbParticleDevState';
import {
  type GUIDE_LINE_PARTICLE_KEYS,
  getLiveGuideLineSettings,
  resetGuideLineParticleDevOverrides,
  setGuideLineDevOverride,
} from '../../entities/guideLine/guideLineDevState';
import {
  getLivePlayerParticleSettings,
  resetPlayerParticleDevOverrides,
  setPlayerParticleDevOverride,
} from '../../entities/playerParticleDevState';
import { bindCheckbox, bindRange, injectRangeRows, type RangeSpec, syncSpecs } from '../bindRange';

const G = VISUAL.guideLine;
const P = VISUAL.player.particles;
const O = VISUAL.energyOrb.particles;

interface GuideParticleSpec extends RangeSpec {
  key: (typeof GUIDE_LINE_PARTICLE_KEYS)[number];
}

interface PlayerParticleSpec extends RangeSpec {
  key: Exclude<
    keyof typeof P,
    'enabled' | 'count' | 'emissiveHex' | 'colorBHex' | 'colorCHex' | 'colorTravelM'
  >;
}

interface OrbParticleSpec extends RangeSpec {
  key: Exclude<
    keyof typeof O,
    | 'enabled'
    | 'idleCountPerOrb'
    | 'burstCount'
    | 'burstConcurrent'
    | 'emissiveHex'
    | 'colorBHex'
    | 'colorCHex'
    | 'colorTravelM'
  >;
}

const GUIDE_SPECS: GuideParticleSpec[] = [
  {
    id: 'dev-particles-guide-idle',
    label: 'Idle',
    min: 0,
    max: 1,
    step: 0.01,
    defaultValue: G.particleIdle,
    format: (v) => v.toFixed(2),
    key: 'particleIdle',
  },
  {
    id: 'dev-particles-guide-spread',
    label: 'Spread (m)',
    min: 0.05,
    max: 0.8,
    step: 0.01,
    defaultValue: G.particleSpreadM,
    format: (v) => v.toFixed(2),
    key: 'particleSpreadM',
  },
  {
    id: 'dev-particles-guide-size',
    label: 'Size (m)',
    min: 0.02,
    max: 0.2,
    step: 0.005,
    defaultValue: G.particleSizeM,
    format: (v) => v.toFixed(3),
    key: 'particleSizeM',
  },
  {
    id: 'dev-particles-guide-hdr',
    label: 'HDR',
    min: 0.2,
    max: 6,
    step: 0.05,
    defaultValue: G.particleHdr,
    format: (v) => v.toFixed(2),
    key: 'particleHdr',
  },
  {
    id: 'dev-particles-guide-spin',
    label: 'Spin',
    min: 0,
    max: 3,
    step: 0.05,
    defaultValue: G.particleSpin,
    format: (v) => v.toFixed(2),
    key: 'particleSpin',
  },
];

const PLAYER_SPECS: PlayerParticleSpec[] = [
  {
    id: 'dev-particles-player-radius',
    label: 'Radius (m)',
    min: 0.12,
    max: 0.7,
    step: 0.01,
    defaultValue: P.radiusM,
    format: (v) => v.toFixed(2),
    key: 'radiusM',
  },
  {
    id: 'dev-particles-player-spread',
    label: 'Spread (m)',
    min: 0.02,
    max: 0.4,
    step: 0.01,
    defaultValue: P.spreadM,
    format: (v) => v.toFixed(2),
    key: 'spreadM',
  },
  {
    id: 'dev-particles-player-size',
    label: 'Size (m)',
    min: 0.02,
    max: 0.2,
    step: 0.005,
    defaultValue: P.particleSizeM,
    format: (v) => v.toFixed(3),
    key: 'particleSizeM',
  },
  {
    id: 'dev-particles-player-idle',
    label: 'Idle',
    min: 0,
    max: 1,
    step: 0.01,
    defaultValue: P.particleIdle,
    format: (v) => v.toFixed(2),
    key: 'particleIdle',
  },
  {
    id: 'dev-particles-player-hdr',
    label: 'HDR',
    min: 0.2,
    max: 6,
    step: 0.05,
    defaultValue: P.particleHdr,
    format: (v) => v.toFixed(2),
    key: 'particleHdr',
  },
  {
    id: 'dev-particles-player-spin',
    label: 'Spin',
    min: 0,
    max: 3,
    step: 0.05,
    defaultValue: P.particleSpin,
    format: (v) => v.toFixed(2),
    key: 'particleSpin',
  },
  {
    id: 'dev-particles-player-breath-amt',
    label: 'Breath',
    min: 0,
    max: 1,
    step: 0.01,
    defaultValue: P.breathAmount,
    format: (v) => v.toFixed(2),
    key: 'breathAmount',
  },
  {
    id: 'dev-particles-player-breath-speed',
    label: 'Breath speed',
    min: 0.05,
    max: 2.5,
    step: 0.05,
    defaultValue: P.breathSpeed,
    format: (v) => v.toFixed(2),
    key: 'breathSpeed',
  },
  {
    id: 'dev-particles-player-pulse-speed',
    label: 'Pulse speed',
    min: 0.05,
    max: 1.2,
    step: 0.01,
    defaultValue: P.pulseSpeed,
    format: (v) => v.toFixed(2),
    key: 'pulseSpeed',
  },
  {
    id: 'dev-particles-player-pulse-spacing',
    label: 'Pulse spacing',
    min: 0.2,
    max: 3,
    step: 0.05,
    defaultValue: P.pulseSpacingM,
    format: (v) => v.toFixed(2),
    key: 'pulseSpacingM',
  },
  {
    id: 'dev-particles-player-pulse-length',
    label: 'Pulse length',
    min: 0.05,
    max: 1.2,
    step: 0.01,
    defaultValue: P.pulseLengthM,
    format: (v) => v.toFixed(2),
    key: 'pulseLengthM',
  },
  {
    id: 'dev-particles-player-drag-lag',
    label: 'Drag lag (s)',
    min: 0,
    max: 0.6,
    step: 0.01,
    defaultValue: P.dragLagSec,
    format: (v) => v.toFixed(2),
    key: 'dragLagSec',
  },
  {
    id: 'dev-particles-player-drag-var',
    label: 'Drag variation',
    min: 0,
    max: 1,
    step: 0.01,
    defaultValue: P.dragVariation,
    format: (v) => v.toFixed(2),
    key: 'dragVariation',
  },
  {
    id: 'dev-particles-player-shake-amp',
    label: 'Shake amp (m)',
    min: 0,
    max: 0.4,
    step: 0.01,
    defaultValue: P.shakeAmpM,
    format: (v) => v.toFixed(2),
    key: 'shakeAmpM',
  },
  {
    id: 'dev-particles-player-shake-hz',
    label: 'Shake speed',
    min: 0.5,
    max: 20,
    step: 0.5,
    defaultValue: P.shakeHz,
    format: (v) => v.toFixed(1),
    key: 'shakeHz',
  },
  {
    id: 'dev-particles-player-shake-ref',
    label: 'Shake at (m/s)',
    min: 0.5,
    max: 12,
    step: 0.1,
    defaultValue: P.shakeSpeedRef,
    format: (v) => v.toFixed(1),
    key: 'shakeSpeedRef',
  },
];

const ORB_SPECS: OrbParticleSpec[] = [
  {
    id: 'dev-particles-orb-radius',
    label: 'Idle radius (m)',
    min: 0.12,
    max: 0.7,
    step: 0.01,
    defaultValue: O.idleRadiusM,
    format: (v) => v.toFixed(2),
    key: 'idleRadiusM',
  },
  {
    id: 'dev-particles-orb-spread',
    label: 'Idle spread (m)',
    min: 0.02,
    max: 0.4,
    step: 0.01,
    defaultValue: O.spreadM,
    format: (v) => v.toFixed(2),
    key: 'spreadM',
  },
  {
    id: 'dev-particles-orb-size',
    label: 'Idle size (m)',
    min: 0.02,
    max: 0.2,
    step: 0.005,
    defaultValue: O.particleSizeM,
    format: (v) => v.toFixed(3),
    key: 'particleSizeM',
  },
  {
    id: 'dev-particles-orb-idle',
    label: 'Idle density',
    min: 0,
    max: 1,
    step: 0.01,
    defaultValue: O.particleIdle,
    format: (v) => v.toFixed(2),
    key: 'particleIdle',
  },
  {
    id: 'dev-particles-orb-hdr',
    label: 'Idle HDR',
    min: 0.2,
    max: 6,
    step: 0.05,
    defaultValue: O.particleHdr,
    format: (v) => v.toFixed(2),
    key: 'particleHdr',
  },
  {
    id: 'dev-particles-orb-spin',
    label: 'Idle spin',
    min: 0,
    max: 3,
    step: 0.05,
    defaultValue: O.particleSpin,
    format: (v) => v.toFixed(2),
    key: 'particleSpin',
  },
  {
    id: 'dev-particles-orb-breath-amt',
    label: 'Breath',
    min: 0,
    max: 1,
    step: 0.01,
    defaultValue: O.breathAmount,
    format: (v) => v.toFixed(2),
    key: 'breathAmount',
  },
  {
    id: 'dev-particles-orb-breath-speed',
    label: 'Breath speed',
    min: 0.05,
    max: 2.5,
    step: 0.05,
    defaultValue: O.breathSpeed,
    format: (v) => v.toFixed(2),
    key: 'breathSpeed',
  },
  {
    id: 'dev-particles-orb-pulse-speed',
    label: 'Idle pulse speed',
    min: 0.05,
    max: 1.2,
    step: 0.01,
    defaultValue: O.pulseSpeed,
    format: (v) => v.toFixed(2),
    key: 'pulseSpeed',
  },
  {
    id: 'dev-particles-orb-pulse-spacing',
    label: 'Idle pulse spacing',
    min: 0.2,
    max: 3,
    step: 0.05,
    defaultValue: O.pulseSpacingM,
    format: (v) => v.toFixed(2),
    key: 'pulseSpacingM',
  },
  {
    id: 'dev-particles-orb-pulse-length',
    label: 'Idle pulse length',
    min: 0.05,
    max: 1.2,
    step: 0.01,
    defaultValue: O.pulseLengthM,
    format: (v) => v.toFixed(2),
    key: 'pulseLengthM',
  },
  {
    id: 'dev-particles-orb-burst-dur',
    label: 'Burst duration (s)',
    min: 0.2,
    max: 1.6,
    step: 0.02,
    defaultValue: O.burstDuration,
    format: (v) => v.toFixed(2),
    key: 'burstDuration',
  },
  {
    id: 'dev-particles-orb-burst-radius',
    label: 'Burst radius (m)',
    min: 0.4,
    max: 4,
    step: 0.05,
    defaultValue: O.burstRadiusM,
    format: (v) => v.toFixed(2),
    key: 'burstRadiusM',
  },
  {
    id: 'dev-particles-orb-burst-lift',
    label: 'Burst lift (m)',
    min: 0,
    max: 1.5,
    step: 0.02,
    defaultValue: O.burstLiftM,
    format: (v) => v.toFixed(2),
    key: 'burstLiftM',
  },
  {
    id: 'dev-particles-orb-burst-pop',
    label: 'Burst pop',
    min: 0.08,
    max: 0.7,
    step: 0.01,
    defaultValue: O.burstPop,
    format: (v) => v.toFixed(2),
    key: 'burstPop',
  },
  {
    id: 'dev-particles-orb-burst-stagger',
    label: 'Burst stagger',
    min: 0,
    max: 0.8,
    step: 0.01,
    defaultValue: O.burstStagger,
    format: (v) => v.toFixed(2),
    key: 'burstStagger',
  },
  {
    id: 'dev-particles-orb-burst-size',
    label: 'Burst size (m)',
    min: 0.02,
    max: 0.2,
    step: 0.005,
    defaultValue: O.burstSizeM,
    format: (v) => v.toFixed(3),
    key: 'burstSizeM',
  },
  {
    id: 'dev-particles-orb-burst-hdr',
    label: 'Burst HDR',
    min: 0.2,
    max: 8,
    step: 0.05,
    defaultValue: O.burstHdr,
    format: (v) => v.toFixed(2),
    key: 'burstHdr',
  },
  {
    id: 'dev-particles-orb-burst-spin',
    label: 'Burst spin',
    min: 0,
    max: 3,
    step: 0.05,
    defaultValue: O.burstSpin,
    format: (v) => v.toFixed(2),
    key: 'burstSpin',
  },
  {
    id: 'dev-particles-orb-burst-orbit',
    label: 'Burst orbit (m)',
    min: 0.4,
    max: 4,
    step: 0.05,
    defaultValue: O.burstOrbitM,
    format: (v) => v.toFixed(2),
    key: 'burstOrbitM',
  },
  {
    id: 'dev-particles-orb-burst-spread',
    label: 'Burst spread (m)',
    min: 0,
    max: 0.2,
    step: 0.005,
    defaultValue: O.burstSpreadM,
    format: (v) => v.toFixed(3),
    key: 'burstSpreadM',
  },
  {
    id: 'dev-particles-orb-burst-pulse-speed',
    label: 'Burst pulse speed',
    min: 0.05,
    max: 2,
    step: 0.01,
    defaultValue: O.burstPulseSpeed,
    format: (v) => v.toFixed(2),
    key: 'burstPulseSpeed',
  },
  {
    id: 'dev-particles-orb-burst-pulse-spacing',
    label: 'Burst pulse spacing',
    min: 0.2,
    max: 3,
    step: 0.05,
    defaultValue: O.burstPulseSpacingM,
    format: (v) => v.toFixed(2),
    key: 'burstPulseSpacingM',
  },
  {
    id: 'dev-particles-orb-burst-pulse-length',
    label: 'Burst pulse length',
    min: 0.05,
    max: 1.2,
    step: 0.01,
    defaultValue: O.burstPulseLengthM,
    format: (v) => v.toFixed(2),
    key: 'burstPulseLengthM',
  },
];

type MissingPlayerSlider = Exclude<
  Exclude<
    keyof typeof P,
    'enabled' | 'count' | 'emissiveHex' | 'colorBHex' | 'colorCHex' | 'colorTravelM'
  >,
  (typeof PLAYER_SPECS)[number]['key']
>;
const _allPlayerSlidersWired: [MissingPlayerSlider] extends [never] ? true : MissingPlayerSlider =
  true;
void _allPlayerSlidersWired;

type MissingOrbSlider = Exclude<
  Exclude<
    keyof typeof O,
    | 'enabled'
    | 'idleCountPerOrb'
    | 'burstCount'
    | 'burstConcurrent'
    | 'emissiveHex'
    | 'colorBHex'
    | 'colorCHex'
    | 'colorTravelM'
  >,
  (typeof ORB_SPECS)[number]['key']
>;
const _allOrbSlidersWired: [MissingOrbSlider] extends [never] ? true : MissingOrbSlider = true;
void _allOrbSlidersWired;

export function syncDevPanelParticles(panel: HTMLDivElement): void {
  const guide = getLiveGuideLineSettings();
  syncSpecs(panel, GUIDE_SPECS, (s) => guide[s.key] as number);
  const player = getLivePlayerParticleSettings();
  syncSpecs(panel, PLAYER_SPECS, (s) => player[s.key] as number);
  const enabled = panel.querySelector('#dev-particles-player-enabled') as HTMLInputElement | null;
  if (enabled) enabled.checked = player.enabled;
  const orb = getLiveEnergyOrbParticleSettings();
  syncSpecs(panel, ORB_SPECS, (s) => orb[s.key] as number);
  const orbEnabled = panel.querySelector('#dev-particles-orb-enabled') as HTMLInputElement | null;
  if (orbEnabled) orbEnabled.checked = orb.enabled;
}

export function initDevPanelParticles(panel: HTMLDivElement): () => void {
  const guideHost = panel.querySelector('#dev-bloom-particles-guide-rows');
  const playerHost = panel.querySelector('#dev-bloom-particles-player-rows');
  const orbHost = panel.querySelector('#dev-bloom-particles-orb-rows');
  if (!guideHost || !playerHost || !orbHost) return () => {};

  injectRangeRows(guideHost, GUIDE_SPECS);
  injectRangeRows(playerHost, PLAYER_SPECS);
  injectRangeRows(orbHost, ORB_SPECS);
  syncDevPanelParticles(panel);

  const disposers: Array<() => void> = [];
  for (const spec of GUIDE_SPECS) {
    disposers.push(
      bindRange(panel, spec.id, `${spec.id}-out`, spec.format, (v) => {
        setGuideLineDevOverride(spec.key, v);
      }),
    );
  }
  disposers.push(
    bindCheckbox(
      panel,
      'dev-particles-player-enabled',
      () => getLivePlayerParticleSettings().enabled,
      (v) => setPlayerParticleDevOverride('enabled', v),
    ),
  );
  for (const spec of PLAYER_SPECS) {
    disposers.push(
      bindRange(panel, spec.id, `${spec.id}-out`, spec.format, (v) => {
        setPlayerParticleDevOverride(spec.key, v);
      }),
    );
  }
  disposers.push(
    bindCheckbox(
      panel,
      'dev-particles-orb-enabled',
      () => getLiveEnergyOrbParticleSettings().enabled,
      (v) => setEnergyOrbParticleDevOverride('enabled', v),
    ),
  );
  for (const spec of ORB_SPECS) {
    disposers.push(
      bindRange(panel, spec.id, `${spec.id}-out`, spec.format, (v) => {
        setEnergyOrbParticleDevOverride(spec.key, v);
      }),
    );
  }

  const guideReset = panel.querySelector('#dev-particles-guide-reset') as HTMLButtonElement | null;
  const playerReset = panel.querySelector(
    '#dev-particles-player-reset',
  ) as HTMLButtonElement | null;
  const orbReset = panel.querySelector('#dev-particles-orb-reset') as HTMLButtonElement | null;
  const onGuideReset = () => {
    resetGuideLineParticleDevOverrides();
    syncDevPanelParticles(panel);
  };
  const onPlayerReset = () => {
    resetPlayerParticleDevOverrides();
    syncDevPanelParticles(panel);
  };
  const onOrbReset = () => {
    resetEnergyOrbParticleDevOverrides();
    syncDevPanelParticles(panel);
  };
  guideReset?.addEventListener('click', onGuideReset);
  playerReset?.addEventListener('click', onPlayerReset);
  orbReset?.addEventListener('click', onOrbReset);

  return () => {
    for (const fn of disposers) fn();
    guideReset?.removeEventListener('click', onGuideReset);
    playerReset?.removeEventListener('click', onPlayerReset);
    orbReset?.removeEventListener('click', onOrbReset);
  };
}
