// src/ui/dev/devPanelGrass.ts

import { VISUAL } from '../../config/visualTuning';
import { devSettings } from '../../core/GameState';
import type { FoliagePackKey, FoliageScatterBiomeKey } from '../../world/grass/foliageTypes';
import type { AssetScatterer } from '../../world/AssetScatterer';
import { resetGrassDev } from '../../world/grass/grassDevDefaults';
import { applyGrassDevUniforms } from '../../world/grass/grassMaterial';
import {
  bindRange,
  bindRangeOnChange,
  injectRangeRows,
  mountSection,
  type RangeSpec,
  syncSpecs,
} from './bindRange';

const WIND_SPECS: RangeSpec[] = [
  {
    id: 'dev-grass-wind-strength',
    label: 'Wind strength',
    min: 0,
    max: 0.6,
    step: 0.02,
    defaultValue: VISUAL.grass.windStrength,
    format: (v) => v.toFixed(2),
  },
  {
    id: 'dev-grass-wind-speed',
    label: 'Wind speed',
    min: 0,
    max: 2,
    step: 0.05,
    defaultValue: VISUAL.grass.windSpeed,
    format: (v) => v.toFixed(2),
  },
];

const SCATTER_SPECS: RangeSpec[] = [
  {
    id: 'dev-grass-density',
    label: 'Density ×',
    min: 0,
    max: 2,
    step: 0.05,
    defaultValue: VISUAL.grass.densityMul,
    format: (v) => v.toFixed(2),
  },
  {
    id: 'dev-grass-scale',
    label: 'Blade scale ×',
    min: 0.5,
    max: 2,
    step: 0.05,
    defaultValue: VISUAL.grass.scaleMul,
    format: (v) => v.toFixed(2),
  },
];

const BIOME_LABELS: Record<FoliageScatterBiomeKey, string> = {
  forest: 'Forest',
  hills: 'Hills',
  mountain: 'Mountain',
  shore: 'Shore',
};

const PACK_LABELS: Record<FoliagePackKey, string> = {
  grass_medium_01: 'Grass 01',
  grass_medium_02: 'Grass 02',
  moss_01: 'Moss',
};

function packDefault(
  packs: (typeof VISUAL.grass.biomes)[FoliageScatterBiomeKey]['packs'],
  key: FoliagePackKey,
): number {
  return (packs as Record<FoliagePackKey, number>)[key] ?? 0;
}

function biomeSpecs(biome: FoliageScatterBiomeKey): RangeSpec[] {
  const defaults = VISUAL.grass.biomes[biome];
  const { packs } = defaults;
  return [
    {
      id: `dev-foliage-${biome}-share`,
      label: 'Budget share',
      min: 0,
      max: 1,
      step: 0.01,
      defaultValue: defaults.countShare,
      format: (v) => v.toFixed(2),
    },
    {
      id: `dev-foliage-${biome}-spacing`,
      label: 'Spacing ×',
      min: 0.3,
      max: 4,
      step: 0.05,
      defaultValue: defaults.spacingMul,
      format: (v) => v.toFixed(2),
    },
    {
      id: `dev-foliage-${biome}-g01`,
      label: PACK_LABELS.grass_medium_01,
      min: 0,
      max: 1,
      step: 0.01,
      defaultValue: packDefault(packs, 'grass_medium_01'),
      format: (v) => v.toFixed(2),
    },
    {
      id: `dev-foliage-${biome}-g02`,
      label: PACK_LABELS.grass_medium_02,
      min: 0,
      max: 1,
      step: 0.01,
      defaultValue: packDefault(packs, 'grass_medium_02'),
      format: (v) => v.toFixed(2),
    },
    {
      id: `dev-foliage-${biome}-moss`,
      label: PACK_LABELS.moss_01,
      min: 0,
      max: 1,
      step: 0.01,
      defaultValue: packDefault(packs, 'moss_01'),
      format: (v) => v.toFixed(2),
    },
  ];
}

const BIOME_KEYS: FoliageScatterBiomeKey[] = ['forest', 'hills', 'mountain', 'shore'];
const ALL_BIOME_SPECS = BIOME_KEYS.flatMap((b) => biomeSpecs(b));

function formatGrassPerfStats(scatterer: AssetScatterer): string {
  const s = scatterer.getGrassPerfStats();
  return (
    `meshes ${s.visibleDrawCalls}/${s.meshGroups} draws · ` +
    `instances ${s.visibleInstances.toLocaleString()}/${s.totalInstances.toLocaleString()}`
  );
}

function readBiomeValue(biome: FoliageScatterBiomeKey, specId: string): number {
  const rule = devSettings.grass.biomes[biome];
  if (specId.endsWith('-share')) return rule.countShare;
  if (specId.endsWith('-spacing')) return rule.spacingMul;
  if (specId.endsWith('-g01')) return rule.packs.grass_medium_01 ?? 0;
  if (specId.endsWith('-g02')) return rule.packs.grass_medium_02 ?? 0;
  if (specId.endsWith('-moss')) return rule.packs.moss_01 ?? 0;
  return 0;
}

function applyBiomeValue(biome: FoliageScatterBiomeKey, specId: string, v: number): void {
  const rule = devSettings.grass.biomes[biome];
  if (specId.endsWith('-share')) rule.countShare = v;
  else if (specId.endsWith('-spacing')) rule.spacingMul = v;
  else if (specId.endsWith('-g01')) rule.packs.grass_medium_01 = v;
  else if (specId.endsWith('-g02')) rule.packs.grass_medium_02 = v;
  else if (specId.endsWith('-moss')) rule.packs.moss_01 = v;
  devSettings.grass.dirty = true;
}

export function initDevPanelGrass(panel: HTMLDivElement, scatterer: AssetScatterer): () => void {
  const biomeDetailsHtml = BIOME_KEYS.map(
    (b) => `
      <details class="dev-subsection">
        <summary>${BIOME_LABELS[b]}</summary>
        <div class="dev-section-body" id="dev-foliage-${b}-rows"></div>
      </details>`,
  ).join('');

  const body = mountSection(panel, {
    hostId: 'dev-section-grass',
    title: 'Foliage',
    open: false,
    body: `
      <p class="dev-hint" id="dev-grass-stats">—</p>
      <p class="dev-hint">Wind — live</p>
      <div id="dev-grass-wind-rows"></div>
      <p class="dev-hint">Scatter — release slider to rebuild</p>
      <div id="dev-grass-scatter-rows"></div>
      <p class="dev-hint">Pack weights are normalized when scattering.</p>
      ${biomeDetailsHtml}
      <div class="dev-actions">
        <button type="button" id="dev-grass-reset">Reset foliage</button>
      </div>
    `,
  });
  if (!body) return () => {};

  const statsEl = panel.querySelector('#dev-grass-stats');
  const refreshStats = () => {
    if (statsEl) statsEl.textContent = formatGrassPerfStats(scatterer);
  };
  refreshStats();
  const statsTimer = window.setInterval(refreshStats, 1000);

  const windHost = panel.querySelector('#dev-grass-wind-rows');
  if (windHost) injectRangeRows(windHost, WIND_SPECS);
  const scatterHost = panel.querySelector('#dev-grass-scatter-rows');
  if (scatterHost) injectRangeRows(scatterHost, SCATTER_SPECS);

  for (const biome of BIOME_KEYS) {
    const host = panel.querySelector(`#dev-foliage-${biome}-rows`);
    if (host) injectRangeRows(host, biomeSpecs(biome));
  }

  const g = devSettings.grass;
  const readGrass = (s: RangeSpec): number => {
    switch (s.id) {
      case 'dev-grass-wind-strength':
        return g.windStrength;
      case 'dev-grass-wind-speed':
        return g.windSpeed;
      case 'dev-grass-density':
        return g.densityMul;
      case 'dev-grass-scale':
        return g.scaleMul;
      default: {
        for (const biome of BIOME_KEYS) {
          if (s.id.startsWith(`dev-foliage-${biome}-`)) {
            return readBiomeValue(biome, s.id);
          }
        }
        return s.defaultValue;
      }
    }
  };

  const allSpecs = [...WIND_SPECS, ...SCATTER_SPECS, ...ALL_BIOME_SPECS];
  const syncGrassUi = () => syncSpecs(panel, allSpecs, readGrass);
  syncGrassUi();

  const disposers: Array<() => void> = [];
  disposers.push(
    bindRange(panel, 'dev-grass-wind-strength', 'dev-grass-wind-strength-out', (v) => v.toFixed(2), (v) => {
      g.windStrength = v;
      applyGrassDevUniforms();
    }),
  );
  disposers.push(
    bindRange(panel, 'dev-grass-wind-speed', 'dev-grass-wind-speed-out', (v) => v.toFixed(2), (v) => {
      g.windSpeed = v;
      applyGrassDevUniforms();
    }),
  );
  disposers.push(
    bindRangeOnChange(panel, 'dev-grass-density', 'dev-grass-density-out', (v) => v.toFixed(2), (v) => {
      g.densityMul = v;
      g.dirty = true;
    }),
  );
  disposers.push(
    bindRangeOnChange(panel, 'dev-grass-scale', 'dev-grass-scale-out', (v) => v.toFixed(2), (v) => {
      g.scaleMul = v;
      g.dirty = true;
    }),
  );

  for (const biome of BIOME_KEYS) {
    for (const spec of biomeSpecs(biome)) {
      const outId = `${spec.id}-out`;
      disposers.push(
        bindRangeOnChange(panel, spec.id, outId, spec.format ?? ((v) => String(v)), (v) => {
          applyBiomeValue(biome, spec.id, v);
        }),
      );
    }
  }

  const resetBtn = panel.querySelector('#dev-grass-reset') as HTMLButtonElement | null;
  const onReset = () => {
    resetGrassDev(g);
    applyGrassDevUniforms();
    g.dirty = true;
    syncGrassUi();
    refreshStats();
  };
  resetBtn?.addEventListener('click', onReset);

  return () => {
    window.clearInterval(statsTimer);
    for (const fn of disposers) fn();
    resetBtn?.removeEventListener('click', onReset);
  };
}
