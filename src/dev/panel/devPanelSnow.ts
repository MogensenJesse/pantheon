// src/dev/panel/devPanelSnow.ts — live knobs for the deep snow: the shell, its thickness and the orb's furrow (DEV)
// Writes into `VISUAL.snow`, which `world/snow/snowSystem.ts` reads every frame. The thickness is baked into the hull map,
// so its slider re-bakes when let go (about a second). The clipmap, the bake grid and the field window are built once: edit
// them in config/visual/snow.ts and reload.

import { VISUAL } from '../../config/visualTuning';
import { type ConfigGroup, mountConfigSection } from '../bindConfig';
import { bindCheckbox } from '../bindRange';

const S = VISUAL.snow;

/** The probe `main.ts` installs in DEV (`__pantheonSnow`). */
const snowProbe = () =>
  (window as unknown as { __pantheonSnow?: { rebake: () => number } }).__pantheonSnow;

const GROUPS: ConfigGroup[] = [
  {
    title: 'Look',
    open: true,
    colors: [['albedo', 'Snow colour']],
  },
  {
    title: 'Thickness',
    hint: 'Baked into the hull: let go of the slider to re-bake.',
    open: true,
    rows: [['thicknessM', 'Thickness where the snow is full (m)', 0.1, 2, 0.05]],
    commit: 'release',
    onChange: () => {
      snowProbe()?.rebake();
    },
  },
  {
    title: 'Grass under snow',
    hint: 'Grass thins out between these snow depths and is gone beyond. Baked into the grass density map: let go of the slider to re-fill it.',
    root: S.grassKill,
    rows: [
      ['startM', 'Starts to thin at (m of snow)', 0, 1, 0.01],
      ['endM', 'Gone at (m of snow)', 0.05, 1.5, 0.01],
    ],
    commit: 'release',
    onChange: () => {
      snowProbe()?.rebake();
    },
  },
  {
    title: 'Orb furrow',
    hint: 'What the orb leaves behind while the shell is on. Depth is capped by the snow there.',
    root: S.orb,
    rows: [
      ['halfA', 'Half length (m)', 0.1, 1, 0.01],
      ['halfB', 'Half width (m)', 0.1, 1, 0.01],
      ['depthM', 'Depth (m)', 0.05, 0.8, 0.01],
      ['bermM', 'Berm height (m)', 0, 0.3, 0.01],
      ['strideM', 'Stride between stamps (m)', 0.1, 1, 0.01],
    ],
  },
  {
    title: 'Orb wading',
    hint: 'In deep snow the orb slows down and rides lower, and the camera sinks with it. Speed falls to the first value once the snow is as deep as the second; the orb sits the share of the depth lower, up to the cap.',
    root: S.orb,
    rows: [
      ['slowMul', 'Speed in full-depth snow (×)', 0.1, 1, 0.01],
      ['slowDepthM', 'Snow depth that slows fully (m)', 0.1, 2, 0.05],
      ['sinkShare', 'Sinks this share of the depth', 0, 1, 0.01],
      ['sinkCapM', 'Sinks at most this deep (m)', 0.1, 2, 0.05],
    ],
  },
  {
    title: 'Villager tracks',
    hint: 'One print per stride, the feet this far apart. Half-extents and depth in metres; the snow there caps the depth.',
    root: S.brushes.villager,
    rows: [
      ['halfA', 'Half length (m)', 0.05, 0.5, 0.01],
      ['halfB', 'Half width (m)', 0.05, 0.5, 0.01],
      ['depthM', 'Depth (m)', 0.02, 0.6, 0.01],
      ['bermM', 'Berm height (m)', 0, 0.2, 0.01],
      ['strideM', 'Stride (m)', 0.2, 1.5, 0.01],
      ['trackM', 'Feet apart (m)', 0, 0.6, 0.01],
    ],
  },
  {
    title: 'Sheep tracks',
    root: S.brushes.sheep,
    rows: [
      ['halfA', 'Half length (m)', 0.05, 0.5, 0.01],
      ['halfB', 'Half width (m)', 0.05, 0.5, 0.01],
      ['depthM', 'Depth (m)', 0.02, 0.6, 0.01],
      ['bermM', 'Berm height (m)', 0, 0.2, 0.01],
      ['strideM', 'Stride (m)', 0.2, 1.5, 0.01],
      ['trackM', 'Hooves apart (m)', 0, 0.6, 0.01],
    ],
  },
  {
    title: 'Tracks reach',
    hint: 'Tracks shape the snow up to the first distance and fade out by the second (m from the orb). The tracks window is 64 m wide and re-centres 8 m off the orb, so keep the second under 24.',
    rows: [
      ['fieldNearM', 'Full up to (m)', 2, 24, 0.5, 1],
      ['fieldFarM', 'Gone by (m)', 4, 24, 0.5, 1],
    ],
  },
  {
    title: 'Refill',
    hint: 'How fast the snow fills the prints back in: the time constant (s) of the fade, about two thirds gone after one. Applied about once a second. While snow falls the fade runs faster (the last row).',
    root: S.refill,
    rows: [
      ['depressionTauS', 'Furrow (s)', 2, 3600, 1, 0],
      ['bermTauS', 'Berm (s)', 2, 3600, 1, 0],
      ['snowfallMul', 'Faster in full snowfall (+×)', 0, 20, 0.5, 1],
    ],
  },
];

export function initDevPanelSnow(panel: HTMLDivElement): () => void {
  return mountConfigSection(panel, {
    hostId: 'dev-section-snow',
    title: 'Snow',
    hint: 'Deep snow you wade through: a soft shell over the whole map where the terrain snows, with the orb ploughing a furrow. Off by default. The prints fill back in over minutes (Refill).',
    idPrefix: 'dev-snow',
    root: S,
    groups: GROUPS,
    extraHtml: `
      <label class="dev-row dev-row-check"><span>Deep snow on</span><input type="checkbox" id="dev-snow-on" /></label>
      <label class="dev-row dev-row-check"><span>Orb leaves a furrow</span><input type="checkbox" id="dev-snow-trail" /></label>
      <label class="dev-row dev-row-check"><span>Villagers and sheep leave tracks</span><input type="checkbox" id="dev-snow-walkers" /></label>
      <div class="dev-actions"><button type="button" id="dev-snow-rebake">Re-bake snow now</button></div>`,
    bindExtra: (body) => {
      const rebake = body.querySelector('#dev-snow-rebake') as HTMLButtonElement | null;
      const onRebake = () => {
        snowProbe()?.rebake();
      };
      rebake?.addEventListener('click', onRebake);
      const off = [
        bindCheckbox(
          panel,
          'dev-snow-on',
          () => S.enabled,
          (v) => {
            (S as { enabled: boolean }).enabled = v;
          },
        ),
        bindCheckbox(
          panel,
          'dev-snow-trail',
          () => S.autoTrail,
          (v) => {
            (S as { autoTrail: boolean }).autoTrail = v;
          },
        ),
        bindCheckbox(
          panel,
          'dev-snow-walkers',
          () => S.walkerTracks,
          (v) => {
            (S as { walkerTracks: boolean }).walkerTracks = v;
          },
        ),
      ];
      return () => {
        rebake?.removeEventListener('click', onRebake);
        for (const fn of off) fn();
      };
    },
  });
}
