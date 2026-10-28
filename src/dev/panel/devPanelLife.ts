// src/dev/panel/devPanelLife.ts — DEV the specks that drift and gather: fireflies, leaves, pollen, and how much of them the places of power show
//
// Writes into `VISUAL.life`. The specks read it every frame: the share rules on the CPU (life/driftRules.ts) and the
// look through uniforms (life/particles/liveLook.ts). The clouds at the places of power draw with their field's look,
// so there is nothing separate to tune for them. `count`, `shape` and the habitat grid are built once: reload.
import { VISUAL } from '../../config/visualTuning';
import { LIFE_KINDS } from '../../life/places/lifeRules';
import { type ConfigGroup, mountConfigSection } from '../bindConfig';
import { bindRange, type RangeSpec, rangeRowHtml } from '../bindRange';
import { lifeHook } from './lifeHook';

const GROUPS: readonly ConfigGroup[] = [
  {
    title: 'Fireflies',
    open: true,
    hint: 'Out at night: pick Night in <strong>Time of day</strong>. The orb draws them in once the world is alive.',
    colors: [
      ['FIREFLIES.colorA', 'Colour A'],
      ['FIREFLIES.colorB', 'Colour B'],
    ],
    rows: [
      ['FIREFLIES.hdr', 'Glow (× bloom scale)', 0, 2, 0.01],
      ['FIREFLIES.blinkHz', 'Blink (Hz)', 0.05, 2, 0.01],
      ['FIREFLIES.orbPullM', 'Orb pull radius (m)', 0.5, 40, 0.5, 1],
      ['FIREFLIES.sizeM.1', 'Size (m)', 0.01, 0.4, 0.005, 3],
      ['FIREFLIES.OPEN_SHARE', 'Share on open ground', 0, 1, 0.01],
      ['FIREFLIES.GOLDEN_SHARE', 'Share at dusk and dawn', 0, 1, 0.01],
      ['FIREFLIES.RAIN_KEEP', 'Share kept in rain', 0, 1, 0.01],
    ],
  },
  {
    title: 'Leaves',
    colors: [
      ['LEAVES.colorA', 'Colour A'],
      ['LEAVES.colorB', 'Colour B'],
      ['LEAVES.altColor', 'Birch colour'],
    ],
    rows: [
      ['LEAVES.spin', 'Tumble', 0, 12, 0.1, 1],
      ['LEAVES.windMps', 'Wind carries (m/s)', 0, 10, 0.05],
      ['LEAVES.fallMps', 'Fall (m/s)', 0, 3, 0.01],
      ['LEAVES.sizeM.1', 'Size (m)', 0.01, 0.4, 0.005, 3],
      ['LEAVES.CALM_SHARE', 'Share in calm weather', 0, 1, 0.01],
      ['LEAVES.RAIN_KEEP', 'Share kept in rain', 0, 1, 0.01],
    ],
  },
  {
    title: 'Pollen',
    colors: [['POLLEN.colorA', 'Colour']],
    rows: [
      ['POLLEN.windMps', 'Wind carries (m/s)', 0, 6, 0.05],
      ['POLLEN.sizeM.1', 'Size (m)', 0.01, 0.4, 0.005, 3],
      ['POLLEN.GONE_BOOST', 'Gone at wind boost', 1.1, 4, 0.05],
      ['POLLEN.RAIN_GONE_AT', 'Gone at rain', 0.05, 1, 0.01],
    ],
  },
  {
    title: 'Orb notice',
    hint: 'How specks near the orb gather. The reach is each look\'s "Orb pull radius".',
    rows: [
      ['ORB_NOTICE.KEEP', 'Distance kept when tight', 0, 1, 0.01],
      ['ORB_NOTICE.PULL_SMOOTH_S', 'Pull builds over (s)', 0.1, 10, 0.1, 1],
    ],
  },
  {
    title: 'Places',
    hint: "The places of power keep fireflies, dust and leaves that look like the fields above. This is the share of a field's specks a restored place shows; a place that has only woken, or kept a trace, shows a fraction of it.",
    rows: [['PLACES.AMOUNT', 'Place amount (× the field)', 0, 1, 0.01]],
  },
];

const HOLD_SPEC: RangeSpec = {
  id: 'dev-life-hold',
  label: 'Hold level',
  min: 0,
  max: 1,
  step: 0.05,
  defaultValue: 1,
  format: (v) => v.toFixed(2),
};

export function initDevPanelLife(panel: HTMLDivElement): () => void {
  let holdLevel = HOLD_SPEC.defaultValue;
  const hold = (level: number | null) => {
    const hook = lifeHook();
    if (hook) for (const kind of LIFE_KINDS) hook.setPlaceLevel(kind, level);
  };
  const on = (id: string, fn: () => void) => {
    const el = panel.querySelector(`#${id}`) as HTMLButtonElement | null;
    el?.addEventListener('click', fn);
    return () => el?.removeEventListener('click', fn);
  };

  return mountConfigSection(panel, {
    hostId: 'dev-section-life',
    title: 'Life',
    idPrefix: 'dev-life',
    root: VISUAL.life,
    hint: 'Live edits to the config numbers; they reset on reload. Counts and shapes are built once.',
    groups: GROUPS,
    extraHtml: `
      <p class="dev-hint">Places of power (no shipped map has them placed): put them round the orb to look at their clouds, or hold every place at a level.</p>
      <div class="dev-actions">
        <button type="button" id="dev-life-fake">Stand the places round me</button>
        <button type="button" id="dev-life-clear">Take them away</button>
      </div>
      ${rangeRowHtml(HOLD_SPEC)}
      <div class="dev-actions">
        <button type="button" id="dev-life-hold-on">Hold all places</button>
        <button type="button" id="dev-life-hold-off">Release them</button>
      </div>`,
    bindExtra: () => {
      const disposers = [
        bindRange(panel, HOLD_SPEC.id, `${HOLD_SPEC.id}-out`, HOLD_SPEC.format, (v) => {
          holdLevel = v;
        }),
        on('dev-life-fake', () => lifeHook()?.fakePlaces()),
        on('dev-life-clear', () => lifeHook()?.clearFakes()),
        on('dev-life-hold-on', () => hold(holdLevel)),
        on('dev-life-hold-off', () => hold(null)),
      ];
      return () => {
        for (const fn of disposers) fn();
      };
    },
  });
}
