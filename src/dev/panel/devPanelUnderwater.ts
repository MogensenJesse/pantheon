// src/dev/panel/devPanelUnderwater.ts — live knobs for the water volume (DEV)
// Writes into `VISUAL.underwater`; `syncUnderwater` pushes it to the GPU every frame. The sea floor groups (kelp, motes)
// write into `VISUAL.underwater.seabed` like the Life section does: the motes read it every frame, the kelp numbers are
// pushed to the grass uniforms and the kelp patches re-bake the grass data map.

import { VISUAL } from '../../config/visualTuning';
import { applyGrassKelpUniforms } from '../../world/grass/config/grassUniforms';
import type { GrassSystem } from '../../world/grass/core/GrassSystem';
import { type ConfigGroup, mountConfigSection } from '../bindConfig';
import { bindCheckbox } from '../bindRange';

const U = VISUAL.underwater;

/** The volume's own numbers: fog, caustics, shafts, the surface from below, the screen wobble, the fog colours. */
const VOLUME_GROUPS: ConfigGroup[] = [
  {
    title: 'Fog',
    open: true,
    rows: [
      ['density', 'Fog density (1/m)', 0.01, 0.4, 0.005, 3],
      ['deepM', 'Depth to deep colour (m)', 1, 30, 0.5, 1],
      ['orbTint', 'Orb tint under water', 0, 1, 0.05],
    ],
  },
  {
    title: 'Caustics',
    root: U.caustics,
    rows: [
      ['strength', 'Strength', 0, 6, 0.05],
      ['scaleM', 'Feature size (m)', 0.5, 8, 0.1, 1],
      ['speed', 'Speed', 0, 2, 0.05],
      ['width', 'Line width', 0, 1, 0.01],
      ['fadeM', 'Fade with depth (m)', 1, 40, 0.5, 1],
    ],
  },
  { title: 'Light shafts', root: U.shafts, rows: [['strength', 'Brightness', 0, 3, 0.05]] },
  {
    title: 'Surface from below',
    root: U.window,
    rows: [
      ['glow', 'Window brightness', 0, 3, 0.05],
      ['edgeCos', 'Window size (cos)', 0.3, 0.95, 0.01],
      ['edgeSoft', 'Window rim softness', 0.01, 0.4, 0.01],
      ['ripple', 'Surface ripple bends the view', 0, 2, 0.05],
    ],
  },
  {
    title: 'Underwater wobble',
    root: U.ripple,
    rows: [
      ['amplitude', 'Wobble strength (UV)', 0, 0.02, 0.0005, 4],
      ['wavelength', 'Wobble wavelength (UV)', 0.03, 0.5, 0.01],
      ['speed', 'Wobble speed', 0, 4, 0.05],
    ],
  },
  {
    title: 'Colours',
    colors: [
      ['stops.night.shallow', 'Night: shallow'],
      ['stops.night.deep', 'Night: deep'],
      ['stops.goldenHour.shallow', 'Golden hour: shallow'],
      ['stops.goldenHour.deep', 'Golden hour: deep'],
      ['stops.noon.shallow', 'Noon: shallow'],
      ['stops.noon.deep', 'Noon: deep'],
    ],
  },
];

const SEABED = VISUAL.underwater.seabed;

/** The sea floor's numbers. The kelp is grass (`world/grass`), so its edits reach the grass system; `grass` is null in a scene without one. */
function seabedGroups(grass: GrassSystem | null): ConfigGroup[] {
  return [
    {
      title: 'Kelp',
      hint: 'Grass blades on the sea floor. Length and density change as the blades regrow (a few seconds).',
      root: SEABED.kelp,
      colors: [
        ['colorA', 'Root colour'],
        ['colorB', 'Tip colour'],
      ],
      rows: [
        ['density', 'Density (share of the grass blades)', 0, 0.4, 0.005, 3],
        ['heightM.0', 'Shortest blade (m)', 0.3, 2.25, 0.05],
        ['heightM.1', 'Longest blade (m)', 0.3, 2.25, 0.05],
        ['widthMul', 'Width (× the grass blade)', 0.5, 6, 0.1, 1],
        ['swayM', 'Sway (m)', 0, 2, 0.05],
        ['swayHz', 'Sway rate (Hz)', 0, 1, 0.01],
      ],
      onChange: () => {
        applyGrassKelpUniforms();
        grass?.requestCompactPass();
      },
    },
    {
      title: 'Kelp patches',
      hint: 'Where it grows. Baked into the grass data map: applied when you let go of a slider, then the whole map is baked again (a moment).',
      root: SEABED.kelp,
      rows: [
        ['depthM.0', 'Shallowest (m of water)', 0, 6, 0.1, 1],
        ['depthM.1', 'Deepest (m of water)', 4, 25, 0.5, 1],
        ['patchM', 'Patch size (m)', 4, 60, 1, 0],
        ['patchShare', 'Share of the sea floor', 0.05, 1, 0.01],
      ],
      commit: 'release',
      onChange: () => {
        grass?.refreshGrassDataMap();
        grass?.requestCompactPass();
      },
    },
    {
      title: 'Motes',
      hint: 'Specks adrift in the water. Their count and shape are built once: reload. Rocks are placed at load as map props: edit `seabed.rocks` in config/visual/underwater.ts and reload.',
      root: SEABED.motes,
      colors: [
        ['colorA', 'Colour A'],
        ['colorB', 'Colour B'],
      ],
      rows: [
        ['alpha', 'Opacity', 0, 1, 0.01],
        ['sizeM.0', 'Smallest (m)', 0.005, 0.15, 0.005, 3],
        ['sizeM.1', 'Largest (m)', 0.005, 0.2, 0.005, 3],
        ['nightMul', 'Brightness at night', 0, 1, 0.01],
        ['boxM', 'Box (m)', 8, 60, 1, 0],
        ['heightM', 'Height of the box (m)', 2, 30, 0.5, 1],
        ['windMps', 'Carried (m/s)', 0, 1, 0.01],
        ['fallMps', 'Fall (m/s)', 0, 0.5, 0.005, 3],
        ['wobbleM', 'Wobble (m)', 0, 2, 0.05],
        ['wobbleHz', 'Wobble rate (Hz)', 0, 1, 0.01],
      ],
    },
  ];
}

export function initDevPanelUnderwater(
  panel: HTMLDivElement,
  grass: GrassSystem | null = null,
): () => void {
  return mountConfigSection(panel, {
    hostId: 'dev-section-underwater',
    title: 'Underwater',
    hint: 'The water volume: fog along the part of a view ray under the surface (tints the sea floor you see through the surface, and everything when the camera is under), caustics on sunlit ground under water, the surface seen from below as a refracted window onto the world above plus a water-coloured ceiling, and a screen wobble while the camera is under. Move the orb into the sea to see it; Water → Shore depth sets how far down the surface lets the floor show.',
    idPrefix: 'dev-uw',
    root: U,
    groups: [...VOLUME_GROUPS, ...seabedGroups(grass)],
    extraHtml: `
      <label class="dev-row dev-row-check"><span>Underwater enabled</span><input type="checkbox" id="dev-uw-enabled" /></label>`,
    bindExtra: () =>
      bindCheckbox(
        panel,
        'dev-uw-enabled',
        () => U.enabled,
        (v) => {
          (U as { enabled: boolean }).enabled = v;
        },
      ),
  });
}
