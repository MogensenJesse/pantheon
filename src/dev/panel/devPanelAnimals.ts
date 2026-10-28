// src/dev/panel/devPanelAnimals.ts — DEV farm animals and birds: how fast they move, how many, how they react
import { VISUAL } from '../../config/visualTuning';
import { type ConfigGroup, mountConfigSection } from '../bindConfig';
import { bindCheckbox } from '../bindRange';
import { lifeHook } from './lifeHook';

const GROUPS: readonly ConfigGroup[] = [
  {
    title: 'Sheep',
    rows: [
      ['ANIMALS.SHEEP.WALK_MPS', 'Walk (m/s)', 0.1, 3, 0.01],
      ['ANIMALS.SHEEP.REST_S.1', 'Graze at most (s)', 0, 60, 0.5, 1],
    ],
  },
  {
    title: 'Hens',
    rows: [
      ['ANIMALS.CHICKEN.WALK_MPS', 'Walk (m/s)', 0.1, 3, 0.01],
      ['ANIMALS.CHICKEN.RUN_MPS', 'Run (m/s)', 0.5, 8, 0.05],
      ['ANIMALS.CHICKEN.SCARE_RADIUS_M', 'Scatter from the orb within (m)', 0, 15, 0.5, 1],
      ['ANIMALS.CHICKEN.REST_S.1', 'Rest at most (s)', 0, 30, 0.5, 1],
    ],
  },
  {
    title: 'Numbers',
    hint: 'Looked at again every review. Animals never leave, so lowering a count does nothing. The most is the room made at the start: it can only go down.',
    rows: [
      ['ANIMALS.SHEEP.PER_VILLAGERS', 'Villagers per sheep', 1, 20, 1, 0],
      ['ANIMALS.SHEEP.MAX', 'Sheep, at most', 1, 8, 1, 0],
      ['ANIMALS.CHICKEN.PER_VILLAGERS', 'Villagers per hen', 1, 20, 1, 0],
      ['ANIMALS.CHICKEN.MAX', 'Hens, at most', 1, 12, 1, 0],
      ['ANIMALS.ARRIVE_S', 'Grow into view (s)', 0.1, 10, 0.1, 1],
    ],
  },
  {
    title: 'Birds',
    hint: 'Flock sizes and the number of flocks need a reload.',
    rows: [
      ['BIRDS.AMBIENT.SPEED_MPS', 'Circling speed (m/s)', 1, 20, 0.5, 1],
      ['BIRDS.AMBIENT.FLEE_MPS', 'Fleeing speed (m/s)', 1, 40, 0.5, 1],
      ['BIRDS.AMBIENT.SCARE_M', 'Scared of the orb within (m)', 1, 60, 1, 0],
      ['BIRDS.AMBIENT.CIRCLE_S.1', 'Circle a wood at most (s)', 10, 400, 5, 0],
      ['BIRDS.AMBIENT.NIGHT_MAX', 'Out only below night', 0, 1, 0.01],
      ['BIRDS.AMBIENT.RAIN_MAX', 'Out only below rain', 0, 1, 0.01],
    ],
  },
];

export function initDevPanelAnimals(panel: HTMLDivElement): () => void {
  return mountConfigSection(panel, {
    hostId: 'dev-section-animals',
    title: 'Animals & birds',
    idPrefix: 'dev-animals',
    root: VISUAL.life,
    hint: 'Live edits to the config numbers; they reset on reload. The village has farm animals once it is converted, or tick the box.',
    groups: GROUPS,
    extraHtml: `
      <label class="dev-row dev-row-check">
        <span>Farm animals now</span>
        <input type="checkbox" id="dev-animals-farm" />
      </label>`,
    bindExtra: () =>
      bindCheckbox(
        panel,
        'dev-animals-farm',
        () => false,
        (on) => lifeHook()?.farm(on),
      ),
  });
}
