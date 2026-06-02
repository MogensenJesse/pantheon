// src/ui/dev/devPanelGrass.ts — GPU grass tuning (DEV)
import { VISUAL } from '../../config/visualTuning';
import { devSettings } from '../../core/GameState';
import type { GrassSystem } from '../../world/grass/GrassSystem';
import { applyGrassDevUniforms, resetGrassDevSettings } from '../../world/grass/applyGrassDevUniforms';
import {
  bindCheckbox,
  bindRange,
  injectRangeRows,
  mountSection,
  type RangeSpec,
  syncSlider,
} from './bindRange';

const GRASS_CONFIG_SPECS: RangeSpec[] = [
  {
    id: 'dev-grass-segments',
    label: 'Segments',
    min: 1,
    max: 8,
    step: 1,
    defaultValue: VISUAL.grass.segments,
    format: (v) => String(Math.round(v)),
  },
  {
    id: 'dev-grass-blade-width',
    label: 'Blade width',
    min: 0.02,
    max: 0.2,
    step: 0.005,
    defaultValue: VISUAL.grass.bladeWidth,
    format: (v) => v.toFixed(3),
  },
  {
    id: 'dev-grass-blade-height',
    label: 'Blade height',
    min: 0.4,
    max: 3,
    step: 0.05,
    defaultValue: VISUAL.grass.bladeHeight,
    format: (v) => v.toFixed(2),
  },
  {
    id: 'dev-grass-tile-size',
    label: 'Tile size (m)',
    min: 32,
    max: 128,
    step: 4,
    defaultValue: VISUAL.grass.tileSize,
    format: (v) => v.toFixed(0),
  },
  {
    id: 'dev-grass-blades-side',
    label: 'Blades / side',
    min: 128,
    max: 480,
    step: 32,
    defaultValue: VISUAL.grass.bladesPerSide,
    format: (v) => String(Math.round(v)),
  },
];

const GRASS_TUNING_SPECS: RangeSpec[] = [
  {
    id: 'dev-grass-wind-strength',
    label: 'Wind strength',
    min: 0,
    max: 1.5,
    step: 0.01,
    defaultValue: VISUAL.grass.windStrength,
    format: (v) => v.toFixed(2),
  },
  {
    id: 'dev-grass-wind-speed',
    label: 'Wind speed',
    min: 0,
    max: 1,
    step: 0.01,
    defaultValue: VISUAL.grass.windSpeed,
    format: (v) => v.toFixed(2),
  },
  {
    id: 'dev-grass-thin-r0',
    label: 'Thin inner (m)',
    min: 0,
    max: 80,
    step: 0.5,
    defaultValue: VISUAL.grass.thinningR0,
    format: (v) => v.toFixed(1),
  },
  {
    id: 'dev-grass-thin-r1',
    label: 'Thin outer (m)',
    min: 0,
    max: 120,
    step: 0.5,
    defaultValue: VISUAL.grass.thinningR1,
    format: (v) => v.toFixed(1),
  },
  {
    id: 'dev-grass-thin-pmin',
    label: 'Thin p min',
    min: 0,
    max: 1,
    step: 0.01,
    defaultValue: VISUAL.grass.thinningPMin,
    format: (v) => v.toFixed(2),
  },
  {
    id: 'dev-grass-scale-min',
    label: 'Scale min',
    min: 0.2,
    max: 2,
    step: 0.01,
    defaultValue: VISUAL.grass.bladeMinScale,
    format: (v) => v.toFixed(2),
  },
  {
    id: 'dev-grass-scale-max',
    label: 'Scale max',
    min: 0.2,
    max: 3,
    step: 0.01,
    defaultValue: VISUAL.grass.bladeMaxScale,
    format: (v) => v.toFixed(2),
  },
];

const GRASS_LOOK_SPECS: RangeSpec[] = [
  {
    id: 'dev-grass-color-mix',
    label: 'Base→tip mix',
    min: 0,
    max: 1,
    step: 0.01,
    defaultValue: VISUAL.grass.colorMixFactor,
    format: (v) => v.toFixed(2),
  },
  {
    id: 'dev-grass-color-var',
    label: 'Color variation',
    min: 0,
    max: 4,
    step: 0.1,
    defaultValue: VISUAL.grass.colorVariationStrength,
    format: (v) => v.toFixed(1),
  },
  {
    id: 'dev-grass-ao-scale',
    label: 'AO strength',
    min: 0,
    max: 1,
    step: 0.05,
    defaultValue: VISUAL.grass.aoScale,
    format: (v) => v.toFixed(2),
  },
  {
    id: 'dev-grass-ao-rim',
    label: 'AO rim',
    min: 0,
    max: 10,
    step: 0.5,
    defaultValue: VISUAL.grass.aoRimSmoothness,
    format: (v) => v.toFixed(1),
  },
  {
    id: 'dev-grass-ao-radius',
    label: 'AO radius (m)',
    min: 0,
    max: 60,
    step: 1,
    defaultValue: VISUAL.grass.aoRadius,
    format: (v) => v.toFixed(0),
  },
  {
    id: 'dev-grass-wind-shade',
    label: 'Wind shade',
    min: 0,
    max: 1,
    step: 0.05,
    defaultValue: VISUAL.grass.baseWindShade,
    format: (v) => v.toFixed(2),
  },
  {
    id: 'dev-grass-shade-height',
    label: 'Shade height',
    min: 0,
    max: 1,
    step: 0.05,
    defaultValue: VISUAL.grass.baseShadeHeight,
    format: (v) => v.toFixed(2),
  },
  {
    id: 'dev-grass-bending',
    label: 'Bending',
    min: 0,
    max: 4,
    step: 0.1,
    defaultValue: VISUAL.grass.baseBending,
    format: (v) => v.toFixed(1),
  },
  {
    id: 'dev-grass-glow-mul',
    label: 'Player glow',
    min: 0,
    max: 1.5,
    step: 0.05,
    defaultValue: VISUAL.grass.playerGlowMul,
    format: (v) => v.toFixed(2),
  },
];

const GRASS_BIOME_SPECS: RangeSpec[] = [
  {
    id: 'dev-grass-biome-threshold',
    label: 'Biome threshold',
    min: 0,
    max: 0.5,
    step: 0.01,
    defaultValue: VISUAL.grass.biomeGrassThreshold,
    format: (v) => v.toFixed(2),
  },
];

const GRASS_TRAIL_SPECS: RangeSpec[] = [
  {
    id: 'dev-grass-trail-growth',
    label: 'Regrow rate',
    min: 0,
    max: 0.2,
    step: 0.01,
    defaultValue: VISUAL.grass.trailGrowthRate,
    format: (v) => v.toFixed(2),
  },
  {
    id: 'dev-grass-trail-min',
    label: 'Crush scale',
    min: 0,
    max: 1,
    step: 0.05,
    defaultValue: VISUAL.grass.trailMinScale,
    format: (v) => v.toFixed(2),
  },
  {
    id: 'dev-grass-trail-radius',
    label: 'Foot radius (m)',
    min: 0.2,
    max: 3,
    step: 0.1,
    defaultValue: VISUAL.grass.trailRadius,
    format: (v) => v.toFixed(1),
  },
  {
    id: 'dev-grass-trail-kdown',
    label: 'Crush speed',
    min: 0,
    max: 1,
    step: 0.05,
    defaultValue: VISUAL.grass.trailKDown,
    format: (v) => v.toFixed(2),
  },
];

type GrassSliderKey =
  | 'segments'
  | 'bladeWidth'
  | 'bladeHeight'
  | 'tileSize'
  | 'bladesPerSide'
  | 'windStrength'
  | 'windSpeed'
  | 'thinningR0'
  | 'thinningR1'
  | 'thinningPMin'
  | 'bladeMinScale'
  | 'bladeMaxScale'
  | 'colorMixFactor'
  | 'colorVariationStrength'
  | 'aoScale'
  | 'aoRimSmoothness'
  | 'aoRadius'
  | 'baseWindShade'
  | 'baseShadeHeight'
  | 'baseBending'
  | 'playerGlowMul'
  | 'biomeGrassThreshold'
  | 'trailGrowthRate'
  | 'trailMinScale'
  | 'trailRadius'
  | 'trailKDown';

const KEY_MAP: Record<string, GrassSliderKey> = {
  'dev-grass-segments': 'segments',
  'dev-grass-blade-width': 'bladeWidth',
  'dev-grass-blade-height': 'bladeHeight',
  'dev-grass-tile-size': 'tileSize',
  'dev-grass-blades-side': 'bladesPerSide',
  'dev-grass-wind-strength': 'windStrength',
  'dev-grass-wind-speed': 'windSpeed',
  'dev-grass-thin-r0': 'thinningR0',
  'dev-grass-thin-r1': 'thinningR1',
  'dev-grass-thin-pmin': 'thinningPMin',
  'dev-grass-scale-min': 'bladeMinScale',
  'dev-grass-scale-max': 'bladeMaxScale',
  'dev-grass-color-mix': 'colorMixFactor',
  'dev-grass-color-var': 'colorVariationStrength',
  'dev-grass-ao-scale': 'aoScale',
  'dev-grass-ao-rim': 'aoRimSmoothness',
  'dev-grass-ao-radius': 'aoRadius',
  'dev-grass-wind-shade': 'baseWindShade',
  'dev-grass-shade-height': 'baseShadeHeight',
  'dev-grass-bending': 'baseBending',
  'dev-grass-glow-mul': 'playerGlowMul',
  'dev-grass-biome-threshold': 'biomeGrassThreshold',
  'dev-grass-trail-growth': 'trailGrowthRate',
  'dev-grass-trail-min': 'trailMinScale',
  'dev-grass-trail-radius': 'trailRadius',
  'dev-grass-trail-kdown': 'trailKDown',
};

const ALL_SPECS = [
  ...GRASS_CONFIG_SPECS,
  ...GRASS_TUNING_SPECS,
  ...GRASS_LOOK_SPECS,
  ...GRASS_BIOME_SPECS,
  ...GRASS_TRAIL_SPECS,
];

const SCALE_REINIT_KEYS = new Set<GrassSliderKey>(['bladeMinScale', 'bladeMaxScale']);

const REBUILD_FIELD_KEYS = new Set<GrassSliderKey>([
  'segments',
  'bladeWidth',
  'bladeHeight',
  'tileSize',
  'bladesPerSide',
]);

function writeGrassValue(key: GrassSliderKey, v: number): void {
  const g = devSettings.grass;
  if (key === 'segments' || key === 'bladesPerSide') {
    g[key] = Math.round(v);
    return;
  }
  if (key === 'tileSize') {
    g[key] = Math.round(v / 4) * 4;
    return;
  }
  g[key] = v;
}

function onGrassSliderChange(key: GrassSliderKey, grass: GrassSystem): void {
  applyGrassDevUniforms();
  if (SCALE_REINIT_KEYS.has(key)) {
    void grass.reinitInstances();
    return;
  }
  if (REBUILD_FIELD_KEYS.has(key)) {
    void grass.rebuildField();
  }
}

function syncUi(panel: HTMLDivElement): void {
  const g = devSettings.grass;
  for (const s of ALL_SPECS) {
    syncSlider(panel, s.id, `${s.id}-out`, g[KEY_MAP[s.id]], s.format);
  }
}

export function initDevPanelGrass(panel: HTMLDivElement, grass: GrassSystem): () => void {
  const body = mountSection(panel, {
    hostId: 'dev-section-grass',
    title: 'Grass',
    open: true,
    body: `
      <p class="dev-hint">Biome-driven GPU field (Forest/Hills/Shore). Full reload after map sculpt.</p>
      <label class="dev-row dev-row-check">
        <span>Enabled</span>
        <input type="checkbox" id="dev-grass-enabled" checked />
      </label>
      <p class="dev-hint">Mesh &amp; field (raising blades/side allocates a new InstancedMesh)</p>
      <div id="dev-grass-config-rows"></div>
      <p class="dev-hint">Wind &amp; density</p>
      <div id="dev-grass-tuning-rows"></div>
      <p class="dev-hint">Color</p>
      <label class="dev-row">
        <span>Base</span>
        <input type="color" id="dev-grass-base-color" value="${VISUAL.grass.baseColor}" />
      </label>
      <label class="dev-row">
        <span>Tip</span>
        <input type="color" id="dev-grass-tip-color" value="${VISUAL.grass.tipColor}" />
      </label>
      <div id="dev-grass-look-rows"></div>
      <p class="dev-hint">Biome</p>
      <div id="dev-grass-biome-rows"></div>
      <p class="dev-hint">Trail (foot crush)</p>
      <div id="dev-grass-trail-rows"></div>
      <label class="dev-row dev-row-check">
        <span>Debug mask</span>
        <input type="checkbox" id="dev-grass-debug-mask" />
      </label>
      <div class="dev-actions">
        <button type="button" id="dev-grass-reset">Reset grass</button>
      </div>
    `,
  });

  const configHost = body?.querySelector('#dev-grass-config-rows');
  const tuningHost = body?.querySelector('#dev-grass-tuning-rows');
  const lookHost = body?.querySelector('#dev-grass-look-rows');
  const biomeHost = body?.querySelector('#dev-grass-biome-rows');
  const trailHost = body?.querySelector('#dev-grass-trail-rows');
  if (configHost) injectRangeRows(configHost, GRASS_CONFIG_SPECS);
  if (tuningHost) injectRangeRows(tuningHost, GRASS_TUNING_SPECS);
  if (lookHost) injectRangeRows(lookHost, GRASS_LOOK_SPECS);
  if (biomeHost) injectRangeRows(biomeHost, GRASS_BIOME_SPECS);
  if (trailHost) injectRangeRows(trailHost, GRASS_TRAIL_SPECS);

  const g = devSettings.grass;
  const disposers: Array<() => void> = [];
  for (const s of ALL_SPECS) {
    const key = KEY_MAP[s.id];
    disposers.push(
      bindRange(panel, s.id, `${s.id}-out`, s.format, (v) => {
        writeGrassValue(key, v);
        onGrassSliderChange(key, grass);
      }),
    );
  }

  disposers.push(
    bindCheckbox(
      panel,
      'dev-grass-enabled',
      () => g.enabled,
      (checked) => {
        g.enabled = checked;
        grass.mesh.visible = checked;
      },
    ),
    bindCheckbox(
      panel,
      'dev-grass-debug-mask',
      () => g.debugMaskViz,
      (checked) => {
        g.debugMaskViz = checked;
        applyGrassDevUniforms();
      },
    ),
  );

  const baseColorInput = panel.querySelector('#dev-grass-base-color') as HTMLInputElement | null;
  const tipColorInput = panel.querySelector('#dev-grass-tip-color') as HTMLInputElement | null;
  const onBaseColor = () => {
    if (!baseColorInput) return;
    g.baseColor = baseColorInput.value;
    applyGrassDevUniforms();
  };
  const onTipColor = () => {
    if (!tipColorInput) return;
    g.tipColor = tipColorInput.value;
    applyGrassDevUniforms();
  };
  baseColorInput?.addEventListener('input', onBaseColor);
  tipColorInput?.addEventListener('input', onTipColor);

  const resetBtn = panel.querySelector('#dev-grass-reset');
  const onReset = () => {
    resetGrassDevSettings();
    syncUi(panel);
    if (baseColorInput) baseColorInput.value = g.baseColor;
    if (tipColorInput) tipColorInput.value = g.tipColor;
    grass.mesh.visible = g.enabled;
    void grass.rebuildField();
  };
  resetBtn?.addEventListener('click', onReset);

  applyGrassDevUniforms();
  if (baseColorInput) baseColorInput.value = g.baseColor;
  if (tipColorInput) tipColorInput.value = g.tipColor;
  syncUi(panel);

  return () => {
    resetBtn?.removeEventListener('click', onReset);
    baseColorInput?.removeEventListener('input', onBaseColor);
    tipColorInput?.removeEventListener('input', onTipColor);
    for (const fn of disposers) fn();
    body?.closest('details')?.remove();
  };
}
