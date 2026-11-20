// src/dev/panel/devPanelWater.ts — live knobs for the water's surface and the shore depth (DEV)
// Writes into `VISUAL.water`; `syncPantheonWater` and `syncWaterShoreUniforms` read it every frame. The per-stop look
// (colour, distortion, shallow tint) lives under Time of day.

import { VISUAL } from '../../config/visualTuning';
import { type ConfigGroup, mountConfigSection } from '../bindConfig';
import { bindCheckbox } from '../bindRange';

const W = VISUAL.water;

const GROUPS: ConfigGroup[] = [
  {
    title: 'Surface',
    open: true,
    rows: [
      ['size', 'Ripple scale', 0.5, 12, 0.1, 1],
      ['alpha', 'Opacity', 0.4, 1, 0.01],
      ['reflectionPlaneOffsetM', 'Reflection plane offset (m)', -2, 2, 0.05],
      ['resolutionScale', 'Reflection scale (max)', 0.15, 0.75, 0.01],
    ],
  },
  {
    title: 'Shore depth',
    hint: 'Absorption = opacity/murk (deep water + refract darkening). Refraction depth = where screen refraction runs. Shore fog bypass keeps shallow water visible through night haze.',
    root: W.shoreDepth,
    rows: [
      ['absorption', 'Depth absorption', 0.05, 1, 0.01],
      ['coastFadeM', 'Waterline edge softness (m)', 0.1, 8, 0.1, 1],
      ['shallowDepthM', 'Shallow tint depth (m)', 0.5, 20, 0.5, 1],
      ['refractionDepthM', 'Refraction depth (m)', 0.5, 20, 0.5, 1],
      ['shallowOverRefract', 'Shallow tint (over seabed)', 0, 1, 0.01],
      ['shadowOpacityBoost', 'Shadow opacity boost', 0, 1.5, 0.05],
      ['refractionStrength', 'Refraction strength', 0, 1, 0.01],
      ['refractionOffset', 'Refraction UV offset', 0, 5, 0.1, 1],
      ['refractionOpacity', 'Refraction opacity lock', 0, 1, 0.02],
      ['fogBypassStrength', 'Shore fog bypass', 0, 1, 0.02],
      ['mapBoundsFadeM', 'Map edge ocean fade (m)', 10, 200, 5, 0],
      ['openOceanDepthM', 'Open ocean depth (m)', 8, 80, 1, 0],
    ],
  },
];

export function initDevPanelWater(panel: HTMLDivElement): () => void {
  return mountConfigSection(panel, {
    hostId: 'dev-section-water',
    title: 'Water',
    hint: 'Reflective ocean — reflection scale lowers RT resolution inland / when looking down; mix stays full. Perf panel → Hide water drops the reflector pass. Per-stop look (color / distortion / shallow) lives under <strong>Time of day</strong>; the waves have their own section.',
    idPrefix: 'dev-water',
    root: W,
    groups: GROUPS,
    extraHtml: `
      <label class="dev-row dev-row-check"><span>Shore depth enabled</span><input type="checkbox" id="dev-shore-enabled" /></label>`,
    bindExtra: () =>
      bindCheckbox(
        panel,
        'dev-shore-enabled',
        () => W.shoreDepth.enabled,
        (v) => {
          (W.shoreDepth as { enabled: boolean }).enabled = v;
        },
      ),
  });
}
