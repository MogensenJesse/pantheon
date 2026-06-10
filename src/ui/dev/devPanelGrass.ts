// src/ui/dev/devPanelGrass.ts — GPU grass tuning (DEV) — 3 LOD rings
import { VISUAL } from '../../config/visualTuning';
import { devSettings } from '../../core/GameState';
import {
  applyGrassDevUniforms,
  resetGrassDevSettings,
} from '../../world/grass/config/applyGrassDevUniforms';
import {
  formatGrassRingsSummary,
  syncAllGrassRingsDerived,
} from '../../world/grass/config/grassFieldMetrics';
import type { GrassSystem } from '../../world/grass/core/GrassSystem';
import {
  bindCheckbox,
  bindRange,
  injectRangeRows,
  mountSection,
  type RangeSpec,
  syncSlider,
} from './bindRange';

const RING_LABELS = ['LOD0 (near)', 'LOD1 (mid)', 'LOD2 (far)'] as const;

function ringSpecs(ringIndex: number): RangeSpec[] {
  const ring = VISUAL.grass.rings[ringIndex]!;
  const prefix = `dev-grass-ring${ringIndex}`;
  return [
    {
      id: `${prefix}-radius`,
      label: 'Ring radius (m)',
      min: 1,
      max: 80,
      step: 0.5,
      defaultValue: ring.radius,
      format: (v) => v.toFixed(1),
    },
    {
      id: `${prefix}-density`,
      label: 'Density (blades/m²)',
      min: 0.1,
      max: 1000,
      step: 1,
      defaultValue: ring.densityPerM2,
      format: (v) => (v >= 10 ? v.toFixed(0) : v.toFixed(2)),
    },
    {
      id: `${prefix}-width`,
      label: 'Blade width',
      min: 0.01,
      max: 0.12,
      step: 0.002,
      defaultValue: ring.bladeWidth,
      format: (v) => v.toFixed(3),
    },
    {
      id: `${prefix}-segments`,
      label: 'Segments',
      min: 1,
      max: 8,
      step: 1,
      defaultValue: ring.segments,
      format: (v) => String(Math.round(v)),
    },
  ];
}

const SHARED_SPECS: RangeSpec[] = [
  {
    id: 'dev-grass-blade-height',
    label: 'Blade height',
    min: 0.4,
    max: 3,
    step: 0.05,
    defaultValue: VISUAL.grass.bladeHeight,
    format: (v) => v.toFixed(2),
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
  {
    id: 'dev-grass-fade-width',
    label: 'Transition width',
    min: 0.05,
    max: 0.8,
    step: 0.01,
    defaultValue: VISUAL.grass.biomeGrassFadeWidth,
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

const FLOWER_SHARED_SPECS: RangeSpec[] = [
  {
    id: 'dev-flower-density',
    label: 'Flowers per side',
    min: 8,
    max: 64,
    step: 1,
    defaultValue: VISUAL.grass.flowers.flowersPerSide,
    format: (v) => String(Math.round(v)),
  },
  {
    id: 'dev-flower-height',
    label: 'Height (m)',
    min: -0.05,
    max: 1,
    step: 0.005,
    defaultValue: VISUAL.grass.flowers.heightOffset,
    format: (v) => v.toFixed(3),
  },
  {
    id: 'dev-flower-scale-min',
    label: 'Scale min',
    min: 0.05,
    max: 0.5,
    step: 0.005,
    defaultValue: VISUAL.grass.flowers.minScale,
    format: (v) => v.toFixed(3),
  },
  {
    id: 'dev-flower-scale-max',
    label: 'Scale max',
    min: 0.05,
    max: 0.5,
    step: 0.005,
    defaultValue: VISUAL.grass.flowers.maxScale,
    format: (v) => v.toFixed(3),
  },
  {
    id: 'dev-flower-color-strength',
    label: 'Color strength',
    min: 0,
    max: 1,
    step: 0.01,
    defaultValue: VISUAL.grass.flowers.colorStrength,
    format: (v) => v.toFixed(2),
  },
  {
    id: 'dev-flower-grass-threshold',
    label: 'Grass threshold',
    min: 0,
    max: 0.5,
    step: 0.01,
    defaultValue: VISUAL.grass.flowers.grassThreshold,
    format: (v) => v.toFixed(2),
  },
];

type FlowerSliderKey =
  | 'flowersPerSide'
  | 'heightOffset'
  | 'minScale'
  | 'maxScale'
  | 'colorStrength'
  | 'grassThreshold';

const FLOWER_SHARED_KEY_MAP: Record<string, FlowerSliderKey> = {
  'dev-flower-density': 'flowersPerSide',
  'dev-flower-height': 'heightOffset',
  'dev-flower-scale-min': 'minScale',
  'dev-flower-scale-max': 'maxScale',
  'dev-flower-color-strength': 'colorStrength',
  'dev-flower-grass-threshold': 'grassThreshold',
};

type SharedSliderKey =
  | 'bladeHeight'
  | 'windStrength'
  | 'windSpeed'
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
  | 'biomeGrassFadeWidth'
  | 'trailGrowthRate'
  | 'trailMinScale'
  | 'trailRadius'
  | 'trailKDown';

type RingField = 'radius' | 'densityPerM2' | 'bladeWidth' | 'segments';

const SHARED_KEY_MAP: Record<string, SharedSliderKey> = {
  'dev-grass-blade-height': 'bladeHeight',
  'dev-grass-wind-strength': 'windStrength',
  'dev-grass-wind-speed': 'windSpeed',
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
  'dev-grass-fade-width': 'biomeGrassFadeWidth',
  'dev-grass-trail-growth': 'trailGrowthRate',
  'dev-grass-trail-min': 'trailMinScale',
  'dev-grass-trail-radius': 'trailRadius',
  'dev-grass-trail-kdown': 'trailKDown',
};

const ALL_RING_SPECS = [0, 1, 2].flatMap((i) => ringSpecs(i));
const ALL_SHARED_SPECS = [
  ...SHARED_SPECS,
  ...GRASS_TUNING_SPECS,
  ...GRASS_LOOK_SPECS,
  ...GRASS_BIOME_SPECS,
  ...GRASS_TRAIL_SPECS,
];

function parseRingSliderId(id: string): { ringIndex: number; field: RingField } | null {
  const m = /^dev-grass-ring(\d)-(radius|density|width|segments)$/.exec(id);
  if (!m) return null;
  const ringIndex = Number(m[1]);
  const fieldMap: Record<string, RingField> = {
    radius: 'radius',
    density: 'densityPerM2',
    width: 'bladeWidth',
    segments: 'segments',
  };
  return { ringIndex, field: fieldMap[m[2]!]! };
}

function writeRingValue(ringIndex: number, field: RingField, v: number): void {
  const ring = devSettings.grass.rings[ringIndex]!;
  if (field === 'radius') {
    ring.radius = Math.max(1, v);
    syncAllGrassRingsDerived(devSettings.grass.rings, devSettings.grass.maxInstancesPerRing);
    return;
  }
  if (field === 'densityPerM2') {
    ring.densityPerM2 = Math.max(0.05, v);
    syncAllGrassRingsDerived(devSettings.grass.rings, devSettings.grass.maxInstancesPerRing);
    return;
  }
  if (field === 'bladeWidth') {
    ring.bladeWidth = Math.max(0.005, v);
    return;
  }
  ring.segments = Math.max(1, Math.round(v));
}

function writeSharedValue(key: SharedSliderKey, v: number): void {
  devSettings.grass[key] = v;
}

function onRingSliderChange(
  ringIndex: number,
  field: RingField,
  grass: GrassSystem,
  panel: HTMLDivElement,
): void {
  applyGrassDevUniforms();
  updateDerivedSummary(panel);
  logGrassDevBladeStats(grass, `ring${ringIndex}-${field}`);
  if (field === 'radius') {
    for (let i = ringIndex; i < 3; i++) {
      void grass.rebuildRing(i);
    }
    return;
  }
  void grass.rebuildRing(ringIndex);
}

function onSharedSliderChange(
  key: SharedSliderKey,
  grass: GrassSystem,
  panel: HTMLDivElement,
): void {
  applyGrassDevUniforms();
  updateDerivedSummary(panel);
  logGrassDevBladeStats(grass, key);
  if (key === 'bladeMinScale' || key === 'bladeMaxScale') {
    void grass.reinitInstances();
    return;
  }
  if (key === 'bladeHeight') {
    void grass.rebuildField();
  }
}

function writeFlowerSharedValue(key: FlowerSliderKey, v: number): void {
  if (key === 'flowersPerSide') {
    devSettings.grass.flowers.flowersPerSide = Math.max(8, Math.min(64, Math.round(v)));
    return;
  }
  devSettings.grass.flowers[key] = v;
}

function onFlowerSharedSliderChange(
  key: FlowerSliderKey,
  grass: GrassSystem,
  panel: HTMLDivElement,
): void {
  applyGrassDevUniforms();
  updateDerivedSummary(panel);
  logGrassDevBladeStats(grass, `flower-${key}`);
  if (key === 'flowersPerSide') {
    void grass.rebuildField();
    return;
  }
  if (key === 'minScale' || key === 'maxScale') {
    void grass.reinitInstances();
  }
}

function getSliderValue(id: string): number {
  const flowerKey = FLOWER_SHARED_KEY_MAP[id];
  if (flowerKey) return devSettings.grass.flowers[flowerKey] as number;
  const ring = parseRingSliderId(id);
  if (ring) {
    const r = devSettings.grass.rings[ring.ringIndex]!;
    return r[ring.field];
  }
  const sharedKey = SHARED_KEY_MAP[id];
  if (sharedKey) return devSettings.grass[sharedKey] as number;
  return 0;
}

function updateDerivedSummary(panel: HTMLDivElement): void {
  const el = panel.querySelector('#dev-grass-derived-summary');
  if (!el) return;
  const layout = syncAllGrassRingsDerived(
    devSettings.grass.rings,
    devSettings.grass.maxInstancesPerRing,
  );
  el.textContent = formatGrassRingsSummary(layout);
}

function logGrassDevBladeStats(grass: GrassSystem, control: string): void {
  void grass.syncBladeStatsFromGpu().then(() => {
    const stats = grass.getBladeStats();
    console.log('[grass] dev panel', {
      control,
      allocatedTotal: stats.allocatedTotal,
      allocatedPerRing: stats.rings.map(
        (r) => `LOD${r.ringIndex}: ${r.instanceCount.toLocaleString()} (${r.bladesPerSide}/side)`,
      ),
      compactedVisibleTotal: stats.compactedVisibleTotal,
      compactedPerRing: stats.rings.map(
        (r) => `LOD${r.ringIndex}: ${r.compactedVisible.toLocaleString()}`,
      ),
      estimatedVisibleTotal: stats.estimatedVisibleTotal,
      estimatedVisibleFraction: Number(stats.estimatedVisibleFraction.toFixed(3)),
      biomeGrassThreshold: stats.biomeGrassThreshold,
      biomeGrassFadeWidth: stats.biomeGrassFadeWidth,
      note:
        'allocatedTotal is fixed by LOD ring radius × density; compactedVisibleTotal is GPU indirect draw count (read on demand)',
    });
  });
}

function syncUi(panel: HTMLDivElement): void {
  for (const s of [...ALL_RING_SPECS, ...ALL_SHARED_SPECS, ...FLOWER_SHARED_SPECS]) {
    syncSlider(panel, s.id, `${s.id}-out`, getSliderValue(s.id), s.format);
  }
  updateDerivedSummary(panel);
}

export function initDevPanelGrass(panel: HTMLDivElement, grass: GrassSystem): () => void {
  const ringSubsections = RING_LABELS.map(
    (label, i) => `
      <details class="dev-subsection">
        <summary>${label}</summary>
        <div class="dev-section-body" id="dev-grass-ring${i}-rows"></div>
      </details>
    `,
  ).join('');

  const body = mountSection(panel, {
    hostId: 'dev-section-grass',
    title: 'Grass',
    open: true,
    body: `
      <p class="dev-hint">Three LOD rings — each <em>ring radius</em> is band width (m); cumulative totals stack (LOD1 20m → 10+20=30m total).</p>
      <details class="dev-subsection" open>
        <summary>General</summary>
        <div class="dev-section-body">
          <label class="dev-row dev-row-check">
            <span>Enabled</span>
            <input type="checkbox" id="dev-grass-enabled" checked />
          </label>
          <p class="dev-hint" id="dev-grass-derived-summary"></p>
        </div>
      </details>
      ${ringSubsections}
      <details class="dev-subsection">
        <summary>Blade &amp; wind</summary>
        <div class="dev-section-body">
          <div id="dev-grass-blade-rows"></div>
          <div id="dev-grass-tuning-rows"></div>
        </div>
      </details>
      <details class="dev-subsection">
        <summary>Appearance</summary>
        <div class="dev-section-body">
          <label class="dev-row">
            <span>Base color</span>
            <input type="color" id="dev-grass-base-color" value="${VISUAL.grass.baseColor}" />
          </label>
          <label class="dev-row">
            <span>Tip color</span>
            <input type="color" id="dev-grass-tip-color" value="${VISUAL.grass.tipColor}" />
          </label>
          <div id="dev-grass-look-rows"></div>
        </div>
      </details>
      <details class="dev-subsection">
        <summary>Biome &amp; trail</summary>
        <div class="dev-section-body">
          <div id="dev-grass-biome-rows"></div>
          <div id="dev-grass-trail-rows"></div>
        </div>
      </details>
      <details class="dev-subsection">
        <summary>Flowers</summary>
        <div class="dev-section-body">
          <label class="dev-row dev-row-check">
            <span>Enabled</span>
            <input type="checkbox" id="dev-flower-enabled" ${VISUAL.grass.flowers.enabled ? 'checked' : ''} />
          </label>
          <div id="dev-flower-shared-rows"></div>
          <label class="dev-row">
            <span>Color 1</span>
            <input type="color" id="dev-flower-color1" value="${VISUAL.grass.flowers.color1}" />
          </label>
          <label class="dev-row">
            <span>Color 2</span>
            <input type="color" id="dev-flower-color2" value="${VISUAL.grass.flowers.color2}" />
          </label>
        </div>
      </details>
      <div class="dev-actions">
        <button type="button" id="dev-grass-reset">Reset grass</button>
      </div>
    `,
  });

  for (let i = 0; i < 3; i++) {
    const host = body?.querySelector(`#dev-grass-ring${i}-rows`);
    if (host) injectRangeRows(host, ringSpecs(i));
  }
  const bladeHost = body?.querySelector('#dev-grass-blade-rows');
  const tuningHost = body?.querySelector('#dev-grass-tuning-rows');
  const lookHost = body?.querySelector('#dev-grass-look-rows');
  const biomeHost = body?.querySelector('#dev-grass-biome-rows');
  const trailHost = body?.querySelector('#dev-grass-trail-rows');
  const flowerSharedHost = body?.querySelector('#dev-flower-shared-rows');
  if (bladeHost) injectRangeRows(bladeHost, SHARED_SPECS);
  if (tuningHost) injectRangeRows(tuningHost, GRASS_TUNING_SPECS);
  if (lookHost) injectRangeRows(lookHost, GRASS_LOOK_SPECS);
  if (biomeHost) injectRangeRows(biomeHost, GRASS_BIOME_SPECS);
  if (trailHost) injectRangeRows(trailHost, GRASS_TRAIL_SPECS);
  if (flowerSharedHost) injectRangeRows(flowerSharedHost, FLOWER_SHARED_SPECS);

  const g = devSettings.grass;
  const disposers: Array<() => void> = [];

  for (const s of ALL_RING_SPECS) {
    const parsed = parseRingSliderId(s.id)!;
    disposers.push(
      bindRange(panel, s.id, `${s.id}-out`, s.format, (v) => {
        writeRingValue(parsed.ringIndex, parsed.field, v);
        onRingSliderChange(parsed.ringIndex, parsed.field, grass, panel);
      }),
    );
  }

  for (const s of ALL_SHARED_SPECS) {
    const key = SHARED_KEY_MAP[s.id]!;
    disposers.push(
      bindRange(panel, s.id, `${s.id}-out`, s.format, (v) => {
        writeSharedValue(key, v);
        onSharedSliderChange(key, grass, panel);
      }),
    );
  }

  for (const s of FLOWER_SHARED_SPECS) {
    const key = FLOWER_SHARED_KEY_MAP[s.id]!;
    disposers.push(
      bindRange(panel, s.id, `${s.id}-out`, s.format, (v) => {
        writeFlowerSharedValue(key, v);
        onFlowerSharedSliderChange(key, grass, panel);
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
  );

  disposers.push(
    bindCheckbox(
      panel,
      'dev-flower-enabled',
      () => g.flowers.enabled,
      (checked) => {
        g.flowers.enabled = checked;
        applyGrassDevUniforms();
        void grass.rebuildField();
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

  const flowerColor1Input = panel.querySelector('#dev-flower-color1') as HTMLInputElement | null;
  const flowerColor2Input = panel.querySelector('#dev-flower-color2') as HTMLInputElement | null;
  const onFlowerColor1 = () => {
    if (!flowerColor1Input) return;
    g.flowers.color1 = flowerColor1Input.value;
    applyGrassDevUniforms();
  };
  const onFlowerColor2 = () => {
    if (!flowerColor2Input) return;
    g.flowers.color2 = flowerColor2Input.value;
    applyGrassDevUniforms();
  };
  flowerColor1Input?.addEventListener('input', onFlowerColor1);
  flowerColor2Input?.addEventListener('input', onFlowerColor2);

  const resetBtn = panel.querySelector('#dev-grass-reset');
  const onReset = () => {
    resetGrassDevSettings();
    syncUi(panel);
    if (baseColorInput) baseColorInput.value = g.baseColor;
    if (tipColorInput) tipColorInput.value = g.tipColor;
    if (flowerColor1Input) flowerColor1Input.value = g.flowers.color1;
    if (flowerColor2Input) flowerColor2Input.value = g.flowers.color2;
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
    flowerColor1Input?.removeEventListener('input', onFlowerColor1);
    flowerColor2Input?.removeEventListener('input', onFlowerColor2);
    for (const fn of disposers) fn();
    body?.closest('details')?.remove();
  };
}
