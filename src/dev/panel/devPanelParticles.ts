// src/dev/panel/devPanelParticles.ts — Glow & bloom → Particles → Guide line / Player
import { VISUAL } from '../../config/visualTuning';
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

interface GuideParticleSpec extends RangeSpec {
  key: (typeof GUIDE_LINE_PARTICLE_KEYS)[number];
}

interface PlayerParticleSpec extends RangeSpec {
  key: Exclude<keyof typeof P, 'enabled' | 'count' | 'emissiveHex' | 'colorBHex' | 'colorCHex'>;
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
];

export function syncDevPanelParticles(panel: HTMLDivElement): void {
  const guide = getLiveGuideLineSettings();
  syncSpecs(panel, GUIDE_SPECS, (s) => guide[s.key] as number);
  const player = getLivePlayerParticleSettings();
  syncSpecs(panel, PLAYER_SPECS, (s) => player[s.key] as number);
  const enabled = panel.querySelector('#dev-particles-player-enabled') as HTMLInputElement | null;
  if (enabled) enabled.checked = player.enabled;
}

export function initDevPanelParticles(panel: HTMLDivElement): () => void {
  const guideHost = panel.querySelector('#dev-bloom-particles-guide-rows');
  const playerHost = panel.querySelector('#dev-bloom-particles-player-rows');
  if (!guideHost || !playerHost) return () => {};

  injectRangeRows(guideHost, GUIDE_SPECS);
  injectRangeRows(playerHost, PLAYER_SPECS);
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

  const guideReset = panel.querySelector('#dev-particles-guide-reset') as HTMLButtonElement | null;
  const playerReset = panel.querySelector(
    '#dev-particles-player-reset',
  ) as HTMLButtonElement | null;
  const onGuideReset = () => {
    resetGuideLineParticleDevOverrides();
    syncDevPanelParticles(panel);
  };
  const onPlayerReset = () => {
    resetPlayerParticleDevOverrides();
    syncDevPanelParticles(panel);
  };
  guideReset?.addEventListener('click', onGuideReset);
  playerReset?.addEventListener('click', onPlayerReset);

  return () => {
    for (const fn of disposers) fn();
    guideReset?.removeEventListener('click', onGuideReset);
    playerReset?.removeEventListener('click', onPlayerReset);
  };
}
