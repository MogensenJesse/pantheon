// src/dev/panel/devPanelWaves.ts — live knobs for the waves: the open-sea swell and the shore waves (DEV)
// Writes into `VISUAL.water.waves`; `syncWaterWaveUniforms` reads it every frame. The mesh rings (`waves.mesh`) are
// built once: edit them in config/visual/water.ts and reload.

import { VISUAL } from '../../config/visualTuning';
import { type ConfigGroup, type ConfigRow, mountConfigSection } from '../bindConfig';
import { bindCheckbox } from '../bindRange';

const W = VISUAL.water.waves;

const GROUPS: ConfigGroup[] = [
  {
    title: 'Swell',
    hint: 'The long waves that lift the sea; they always travel toward the nearest shore. Calm weather is the first height, a full storm the second; the wind boost sets where in between it is.',
    root: W.swell,
    rows: [
      ['calmHeightM', 'Height in calm weather (m)', 0, 3, 0.05],
      ['stormHeightM', 'Height in a full storm (m)', 0, 6, 0.05],
      ['fullEnergyBoost', 'Wind boost of a full storm', 1.05, 3, 0.05],
      ['openSea.gain', 'Open sea: taller than the coast by (×)', 0.5, 4, 0.05],
      ['openSea.fromM', 'Open sea: starts growing (m from land)', 0, 1000, 10, 0],
      ['openSea.toM', 'Open sea: fully grown (m from land)', 50, 2000, 10, 0],
      ['speedScale', 'Speed (× real waves)', 0.1, 2, 0.05],
      ['steepness', 'Sharp crests', 0, 1.5, 0.05],
      [
        'shoalDepthM',
        'Dies out in water shallower than (m, at least 2.5 swell heights)',
        1,
        25,
        0.5,
        1,
      ],
      ['fadeFromWavelengths', 'Starts to fade at (wavelengths)', 1, 10, 0.5, 1],
      ['fadeToWavelengths', 'Gone at (wavelengths)', 2, 14, 0.5, 1],
    ],
  },
  {
    title: 'Swell components',
    hint: 'Four waves added together: length and share of the height.',
    root: W.swell,
    rows: W.swell.components.flatMap((_, i): ConfigRow[] => [
      [`components.${i}.wavelengthM`, `Wave ${i + 1}: length (m)`, 4, 120, 1, 0],
      [`components.${i}.share`, `Wave ${i + 1}: share of the height`, 0, 1, 0.01],
    ]),
  },
  {
    title: 'Whitecaps',
    hint: 'Foam on the crests; none until the wind has built the sea up.',
    root: W.swell.whitecap,
    rows: [
      ['crestFrom', 'Foam starts at (share of the height)', 0, 1, 0.01],
      ['crestTo', 'Full foam at', 0.1, 1, 0.01],
      ['energyFrom', 'Wind needed (0..1)', 0, 0.95, 0.01],
      ['amount', 'Amount', 0, 1, 0.01],
    ],
  },
  {
    title: 'Shore waves',
    hint: 'Foam fronts rolling in from the break line, two at a time. A storm widens the breaker zone and the swash.',
    root: W.shore,
    colors: [['foamColor', 'Foam colour']],
    rows: [
      ['periodS', 'Seconds between fronts', 2, 20, 0.5, 1],
      ['breakDistM', 'Break line (m from the waterline)', 3, 50, 0.5, 1],
      ['trailM', 'Foam trail (m)', 0.2, 10, 0.1, 1],
      ['fringeM', 'Waterline fringe (m)', 0, 3, 0.05],
      ['alongShoreM', 'Bend size along the beach (m)', 4, 80, 1, 0],
      ['wobble', 'Bend (share of a cycle)', 0, 1, 0.01],
      ['calmShare', 'Foam strength in calm weather', 0, 1, 0.01],
      ['stormMul', 'Storm widening (×)', 1, 3, 0.05],
      ['shoreSlopeStepM', 'Slope step (m)', 0.5, 4, 0.1, 1],
      ['shoreMaxSlope', 'Max slope', 0.2, 8, 0.1, 1],
    ],
  },
  {
    title: 'Swash and wet sand',
    hint: 'The water’s edge itself moves: a front lifts the sea at the shore (the uprush), then it falls back (the backwash) and the edge retreats. On a flat beach the same height is a long way up the sand. The sand stays wet up to the highest recent swash and dries behind it.',
    root: W.shore,
    rows: [
      ['swashHeightM', 'Swash height (m above the mean level)', 0.02, 1, 0.01],
      ['riseShare', 'Uprush (share of a cycle)', 0.03, 0.5, 0.01],
      ['backwashShare', 'Backwash (share of a cycle)', 0.1, 0.8, 0.01],
      ['recedeShare', 'Retreat below the mean level (share of the swash)', 0, 1, 0.01],
      ['lobeM', 'Lobe size along the beach (m)', 3, 60, 1, 0],
      ['lobeShare', 'Lobe strength', 0, 1, 0.01],
      ['dampHeightM', 'Always damp up to (m above the mean level)', 0, 0.5, 0.01],
      ['dryShare', 'Drying time (share of a cycle)', 0.1, 1, 0.01],
      ['wetSandDarken', 'Darkening', 0, 0.6, 0.01],
      ['moistWidthM', 'Moist band width (m inland from the waterline)', 0, 80, 1, 0],
      ['moistHeightM', 'Moist band height cap (m above the mean level)', 0, 10, 0.1, 1],
      ['moistDarken', 'Moist band darkening', 0, 0.4, 0.01],
    ],
  },
  {
    title: 'Enclosed water (lakes)',
    hint: 'Water below the sea level that the sea cannot reach (found by a flood fill from the map border) is calmer. Each value is its share of the open sea: 1 = no difference, 0 = none. The whitecaps follow the swell.',
    root: W.lake,
    rows: [
      ['swellShare', 'Swell height (share)', 0, 1, 0.01],
      ['swashShare', 'Swash height and reach (share)', 0, 1, 0.01],
      ['foamShare', 'Shore foam (share)', 0, 1, 0.01],
      ['rippleShare', 'Fine ripples (share)', 0, 1, 0.01],
    ],
  },
  {
    title: 'Waterline edge',
    hint: 'How far (m) the water mesh rides above the exact surface over the shallows, so the visible waterline is the shader’s world-anchored edge and not the camera-following grid’s cut through the terrain. 0 = the old cut. Walk along the beach with 0 and with 0.05 to compare the wobble.',
    root: W.mesh,
    rows: [['edgeLiftM', 'Edge lift (m)', 0, 0.3, 0.005, 3]],
  },
];

export function initDevPanelWaves(panel: HTMLDivElement): () => void {
  return mountConfigSection(panel, {
    hostId: 'dev-section-waves',
    title: 'Waves',
    hint: 'Open-sea swell (Gerstner waves on a disc that follows the camera, growing with the wind) and shore waves (foam fronts and wet sand). Turn the wind up with the weather hooks to see the storm sea. The mesh rings are built once: edit waves.mesh in config/visual/water.ts and reload.',
    idPrefix: 'dev-waves',
    root: W,
    groups: GROUPS,
    extraHtml: `
      <label class="dev-row dev-row-check"><span>Swell enabled</span><input type="checkbox" id="dev-waves-swell-on" /></label>
      <label class="dev-row dev-row-check"><span>Shore waves enabled</span><input type="checkbox" id="dev-waves-shore-on" /></label>`,
    bindExtra: () => {
      const off = [
        bindCheckbox(
          panel,
          'dev-waves-swell-on',
          () => W.swell.enabled,
          (v) => {
            (W.swell as { enabled: boolean }).enabled = v;
          },
        ),
        bindCheckbox(
          panel,
          'dev-waves-shore-on',
          () => W.shore.enabled,
          (v) => {
            (W.shore as { enabled: boolean }).enabled = v;
          },
        ),
      ];
      return () => {
        for (const fn of off) fn();
      };
    },
  });
}
