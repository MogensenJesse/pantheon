// src/dev/panel/devPanelTreeSway.ts — how far trees give to the wind (DEV)
import { VISUAL } from '../../config/visualTuning';
import { propSwayUniforms as u } from '../../world/mapProps/config/propSwayUniforms';
import { bindRange, injectRangeRows, mountSection, type RangeSpec, syncSlider } from '../bindRange';

const S = VISUAL.props.sway;
const TAU = Math.PI * 2;

const pct = (v: number) => `${(v * 100).toFixed(1)} %`;
const num = (digits: number) => (v: number) => v.toFixed(digits);

interface SwaySpec extends RangeSpec {
  apply: (v: number) => void;
}

const SPECS: readonly SwaySpec[] = [
  {
    id: 'dev-sway-base',
    label: 'Steady lean (share of height)',
    min: 0,
    max: 0.06,
    step: 0.001,
    defaultValue: S.baseLean,
    format: pct,
    apply: (v) => {
      u.uBaseLean.value = v;
    },
  },
  {
    id: 'dev-sway-gust',
    label: 'Gust lean (share of height)',
    min: 0,
    max: 0.12,
    step: 0.001,
    defaultValue: S.gustLean,
    format: pct,
    apply: (v) => {
      u.uGustLean.value = v;
    },
  },
  {
    id: 'dev-sway-side',
    label: 'Sideways wobble (share of gust)',
    min: 0,
    max: 1,
    step: 0.01,
    defaultValue: S.sideShare,
    format: num(2),
    apply: (v) => {
      u.uSideShare.value = v;
    },
  },
  {
    id: 'dev-sway-power',
    label: 'Stiff trunk (height power)',
    min: 0.5,
    max: 5,
    step: 0.05,
    defaultValue: S.heightPower,
    format: num(2),
    apply: (v) => {
      u.uHeightPower.value = v;
    },
  },
  {
    id: 'dev-sway-wave',
    label: 'Gust wavelength (m)',
    min: 20,
    max: 300,
    step: 1,
    defaultValue: S.waveLengthM,
    format: (v) => `${v.toFixed(0)} m`,
    apply: (v) => {
      u.uWaveK.value = TAU / v;
    },
  },
  {
    id: 'dev-sway-period',
    label: 'Gust period (s)',
    min: 1,
    max: 30,
    step: 0.5,
    defaultValue: S.periodS,
    format: (v) => `${v.toFixed(1)} s`,
    apply: (v) => {
      u.uWaveOmega.value = TAU / v;
    },
  },
  {
    id: 'dev-sway-flutter',
    label: 'Leaf flutter (m, near trees)',
    min: 0,
    max: 0.3,
    step: 0.005,
    defaultValue: S.flutterM,
    format: (v) => `${v.toFixed(3)} m`,
    apply: (v) => {
      u.uFlutterM.value = v;
    },
  },
  {
    id: 'dev-sway-flutter-hz',
    label: 'Flutter rate (Hz)',
    min: 0.2,
    max: 4,
    step: 0.05,
    defaultValue: S.flutterHz,
    format: (v) => `${v.toFixed(2)} Hz`,
    apply: (v) => {
      u.uFlutterOmega.value = TAU * v;
    },
  },
  {
    id: 'dev-sway-orb-radius',
    label: 'Orb rustle radius (m)',
    min: 1,
    max: 20,
    step: 0.5,
    defaultValue: S.orbRadiusM,
    format: (v) => `${v.toFixed(1)} m`,
    apply: (v) => {
      u.uOrbRadius.value = v;
    },
  },
  {
    id: 'dev-sway-orb-gain',
    label: 'Orb rustle gain',
    min: 0,
    max: 8,
    step: 0.1,
    defaultValue: S.orbGain,
    format: num(1),
    apply: (v) => {
      u.uOrbGain.value = v;
    },
  },
];

export function initDevPanelTreeSway(panel: HTMLDivElement): () => void {
  const body = mountSection(panel, {
    hostId: 'dev-section-tree-sway',
    title: 'Tree sway',
    open: false,
    body: `
      <p class="dev-hint">Trees lean along the wind in a gust wave that travels with it; the trunk stays stiff and the crown moves. The wind itself (direction, storm boost) is shared with the grass and the clouds. Leaf flutter and the orb rustle are for near trees (lod0) only. Tree shadows stay at rest.</p>
      <div id="dev-sway-rows"></div>
      <button type="button" class="dev-btn" id="dev-sway-reset">Reset tree sway</button>
    `,
  });
  if (!body) return () => {};

  const host = body.querySelector('#dev-sway-rows');
  if (host) injectRangeRows(host, SPECS);

  const disposers: Array<() => void> = [];
  for (const s of SPECS) {
    disposers.push(bindRange(panel, s.id, `${s.id}-out`, s.format, s.apply));
  }

  const resetBtn = panel.querySelector('#dev-sway-reset') as HTMLButtonElement | null;
  const onReset = () => {
    for (const s of SPECS) {
      s.apply(s.defaultValue);
      syncSlider(panel, s.id, `${s.id}-out`, s.defaultValue, s.format);
    }
  };
  resetBtn?.addEventListener('click', onReset);
  disposers.push(() => resetBtn?.removeEventListener('click', onReset));

  return () => {
    for (const d of disposers) d();
  };
}
