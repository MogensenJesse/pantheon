// src/dev/panel/devPanelGrass.ts — GPU grass tuning (DEV) — 3 LOD rings
import { VISUAL } from '../../config/visualTuning';
import { devSettings } from '../../core/GameState';
import {
  applyGrassDevUniforms,
  markGrassDevDirty,
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
  bindRangeOnChange,
  injectRangeRows,
  mountSection,
  syncSlider,
} from '../bindRange';
import {
  ALL_RING_SPECS,
  ALL_SHARED_SPECS,
  FLOWER_SHARED_KEY_MAP,
  FLOWER_SHARED_SPECS,
  type FlowerSliderKey,
  GRASS_BIOME_SPECS,
  GRASS_LOOK_SPECS,
  GRASS_SUN_LIGHTING_SPECS,
  GRASS_TRAIL_SPECS,
  GRASS_TUNING_SPECS,
  type RingField,
  ringSpecs,
  SHARED_KEY_MAP,
  SHARED_SPECS,
  type SharedSliderKey,
} from './devPanelGrassSpecs';

const RING_LABELS = ['LOD0 (near)', 'LOD1 (mid)', 'LOD2 (far)'] as const;
const GRASS_FL = VISUAL.grass.foliageLighting;

const FOLIAGE_SLIDER_KEYS = new Set([
  'wrapStrength',
  'hemisphereStrength',
  'backlightStrength',
  'backlightPunchThrough',
] as const);

type FoliageSliderKey = typeof FOLIAGE_SLIDER_KEYS extends Set<infer K> ? K : never;

function isFoliageSliderKey(key: SharedSliderKey): key is FoliageSliderKey {
  return (FOLIAGE_SLIDER_KEYS as Set<string>).has(key);
}

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
    syncAllGrassRingsDerived(
      devSettings.grass.rings,
      devSettings.grass.ringDerived,
      devSettings.grass.maxInstancesPerRing,
    );
    markGrassDevDirty();
    return;
  }
  if (field === 'densityPerM2') {
    ring.densityPerM2 = Math.max(0.05, v);
    syncAllGrassRingsDerived(
      devSettings.grass.rings,
      devSettings.grass.ringDerived,
      devSettings.grass.maxInstancesPerRing,
    );
    markGrassDevDirty();
    return;
  }
  if (field === 'bladeWidth') {
    ring.bladeWidth = Math.max(0.005, v);
    markGrassDevDirty();
    return;
  }
  ring.segments = Math.min(127, Math.max(1, Math.round(v)));
  markGrassDevDirty();
}

function writeSharedValue(key: SharedSliderKey, v: number): void {
  if (isFoliageSliderKey(key)) {
    devSettings.grass.foliageLighting[key] = v;
  } else {
    devSettings.grass[key] = v;
  }
  markGrassDevDirty();
}

function onRingSliderChange(
  ringIndex: number,
  field: RingField,
  grass: GrassSystem,
  panel: HTMLDivElement,
): void {
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

const TRAIL_SLIDER_KEYS = new Set<SharedSliderKey>([
  'trailGrowthRate',
  'trailMinScale',
  'trailRadius',
  'trailKDown',
]);

function onSharedSliderChange(
  key: SharedSliderKey,
  grass: GrassSystem,
  panel: HTMLDivElement,
): void {
  updateDerivedSummary(panel);
  logGrassDevBladeStats(grass, key);
  if (TRAIL_SLIDER_KEYS.has(key)) {
    applyGrassDevUniforms(true);
    grass.requestCompactPass();
    return;
  }
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
    markGrassDevDirty();
    return;
  }
  devSettings.grass.flowers[key] = v;
  markGrassDevDirty();
}

function onFlowerSharedSliderChange(
  key: FlowerSliderKey,
  grass: GrassSystem,
  panel: HTMLDivElement,
): void {
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
  if (sharedKey) {
    if (isFoliageSliderKey(sharedKey)) {
      return devSettings.grass.foliageLighting[sharedKey];
    }
    return devSettings.grass[sharedKey] as number;
  }
  return 0;
}

function updateDerivedSummary(panel: HTMLDivElement): void {
  const el = panel.querySelector('#dev-grass-derived-summary');
  if (!el) return;
  const layout = syncAllGrassRingsDerived(
    devSettings.grass.rings,
    devSettings.grass.ringDerived,
    devSettings.grass.maxInstancesPerRing,
  );
  el.textContent = formatGrassRingsSummary(layout);
}

function logGrassDevBladeStats(grass: GrassSystem, control: string): void {
  void (async () => {
    await grass.syncBladeStatsFromGpu();
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
      note: 'allocatedTotal is fixed by LOD ring radius × density; compactedVisibleTotal is GPU indirect draw count (after flushCompute)',
    });
  })();
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
    open: false,
    body: `
      <p class="dev-hint">Three LOD rings — each <em>ring radius</em> is band width (m); cumulative totals stack (LOD1 20m → 10+20=30m total).</p>
      <details class="dev-subsection">
        <summary>General</summary>
        <div class="dev-section-body">
          <label class="dev-row dev-row-check">
            <span>Enabled</span>
            <input type="checkbox" id="dev-grass-enabled" checked />
          </label>
          <label class="dev-row dev-row-check">
            <span>Cull debug (draw all slots)</span>
            <input type="checkbox" id="dev-grass-cull-debug" />
          </label>
          <p class="dev-hint">Cull colors: magenta=outside annulus (tile corners), orange=biome, red=frustum fail, green=frustum ok, cyan=near bypass (Manhattan diamond), blue=pitch bypass. Magenta speckle in corners is expected. Empty patches with terrain on = depth burial (grass Y vs terrain detail displacement), not compute cull.</p>
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
        <summary>Sun lighting</summary>
        <div class="dev-section-body">
          <p class="dev-hint">Wrap + hemisphere + fake SSS back-light on grass and flowers (shared foliage TSL).</p>
          <div id="dev-grass-sun-rows"></div>
          <label class="dev-row">
            <span>Sky tint</span>
            <input type="color" id="dev-grass-sky-tint" value="${GRASS_FL.skyTint}" />
          </label>
          <label class="dev-row">
            <span>Ground tint</span>
            <input type="color" id="dev-grass-ground-tint" value="${GRASS_FL.groundTint}" />
          </label>
          <label class="dev-row">
            <span>Back-light tint</span>
            <input type="color" id="dev-grass-backlight-tint" value="${GRASS_FL.backlightTint}" />
          </label>
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
  const sunHost = body?.querySelector('#dev-grass-sun-rows');
  const biomeHost = body?.querySelector('#dev-grass-biome-rows');
  const trailHost = body?.querySelector('#dev-grass-trail-rows');
  const flowerSharedHost = body?.querySelector('#dev-flower-shared-rows');
  if (bladeHost) injectRangeRows(bladeHost, SHARED_SPECS);
  if (tuningHost) injectRangeRows(tuningHost, GRASS_TUNING_SPECS);
  if (lookHost) injectRangeRows(lookHost, GRASS_LOOK_SPECS);
  if (sunHost) injectRangeRows(sunHost, GRASS_SUN_LIGHTING_SPECS);
  if (biomeHost) injectRangeRows(biomeHost, GRASS_BIOME_SPECS);
  if (trailHost) injectRangeRows(trailHost, GRASS_TRAIL_SPECS);
  if (flowerSharedHost) injectRangeRows(flowerSharedHost, FLOWER_SHARED_SPECS);

  const g = devSettings.grass;
  const disposers: Array<() => void> = [];

  for (const s of ALL_RING_SPECS) {
    const parsed = parseRingSliderId(s.id)!;
    disposers.push(
      bindRangeOnChange(panel, s.id, `${s.id}-out`, s.format, (v) => {
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
      'dev-grass-cull-debug',
      () => g.cullDebug,
      (checked) => {
        g.cullDebug = checked;
        markGrassDevDirty();
        applyGrassDevUniforms(true);
        logGrassDevBladeStats(grass, 'cullDebug');
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
        markGrassDevDirty();
        void grass.rebuildField();
      },
    ),
  );

  const baseColorInput = panel.querySelector('#dev-grass-base-color') as HTMLInputElement | null;
  const tipColorInput = panel.querySelector('#dev-grass-tip-color') as HTMLInputElement | null;
  const onBaseColor = () => {
    if (!baseColorInput) return;
    g.baseColor = baseColorInput.value;
    markGrassDevDirty();
  };
  const onTipColor = () => {
    if (!tipColorInput) return;
    g.tipColor = tipColorInput.value;
    markGrassDevDirty();
  };
  baseColorInput?.addEventListener('input', onBaseColor);
  tipColorInput?.addEventListener('input', onTipColor);

  const skyTintInput = panel.querySelector('#dev-grass-sky-tint') as HTMLInputElement | null;
  const groundTintInput = panel.querySelector('#dev-grass-ground-tint') as HTMLInputElement | null;
  const backlightTintInput = panel.querySelector(
    '#dev-grass-backlight-tint',
  ) as HTMLInputElement | null;
  const onSkyTint = () => {
    if (!skyTintInput) return;
    g.foliageLighting.skyTint = skyTintInput.value;
    markGrassDevDirty();
  };
  const onGroundTint = () => {
    if (!groundTintInput) return;
    g.foliageLighting.groundTint = groundTintInput.value;
    markGrassDevDirty();
  };
  const onBacklightTint = () => {
    if (!backlightTintInput) return;
    g.foliageLighting.backlightTint = backlightTintInput.value;
    markGrassDevDirty();
  };
  skyTintInput?.addEventListener('input', onSkyTint);
  groundTintInput?.addEventListener('input', onGroundTint);
  backlightTintInput?.addEventListener('input', onBacklightTint);

  const flowerColor1Input = panel.querySelector('#dev-flower-color1') as HTMLInputElement | null;
  const flowerColor2Input = panel.querySelector('#dev-flower-color2') as HTMLInputElement | null;
  const onFlowerColor1 = () => {
    if (!flowerColor1Input) return;
    g.flowers.color1 = flowerColor1Input.value;
    markGrassDevDirty();
  };
  const onFlowerColor2 = () => {
    if (!flowerColor2Input) return;
    g.flowers.color2 = flowerColor2Input.value;
    markGrassDevDirty();
  };
  flowerColor1Input?.addEventListener('input', onFlowerColor1);
  flowerColor2Input?.addEventListener('input', onFlowerColor2);

  const resetBtn = panel.querySelector('#dev-grass-reset');
  const onReset = () => {
    resetGrassDevSettings();
    syncUi(panel);
    if (baseColorInput) baseColorInput.value = g.baseColor;
    if (tipColorInput) tipColorInput.value = g.tipColor;
    if (skyTintInput) skyTintInput.value = g.foliageLighting.skyTint;
    if (groundTintInput) groundTintInput.value = g.foliageLighting.groundTint;
    if (backlightTintInput) backlightTintInput.value = g.foliageLighting.backlightTint;
    if (flowerColor1Input) flowerColor1Input.value = g.flowers.color1;
    if (flowerColor2Input) flowerColor2Input.value = g.flowers.color2;
    grass.mesh.visible = g.enabled;
    void grass.rebuildField();
  };
  resetBtn?.addEventListener('click', onReset);

  applyGrassDevUniforms(true);
  if (baseColorInput) baseColorInput.value = g.baseColor;
  if (tipColorInput) tipColorInput.value = g.tipColor;
  if (skyTintInput) skyTintInput.value = g.foliageLighting.skyTint;
  if (groundTintInput) groundTintInput.value = g.foliageLighting.groundTint;
  if (backlightTintInput) backlightTintInput.value = g.foliageLighting.backlightTint;
  syncUi(panel);

  return () => {
    resetBtn?.removeEventListener('click', onReset);
    baseColorInput?.removeEventListener('input', onBaseColor);
    tipColorInput?.removeEventListener('input', onTipColor);
    skyTintInput?.removeEventListener('input', onSkyTint);
    groundTintInput?.removeEventListener('input', onGroundTint);
    backlightTintInput?.removeEventListener('input', onBacklightTint);
    flowerColor1Input?.removeEventListener('input', onFlowerColor1);
    flowerColor2Input?.removeEventListener('input', onFlowerColor2);
    for (const fn of disposers) fn();
  };
}
