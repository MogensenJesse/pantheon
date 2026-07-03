// src/ui/dev/devPanelTerrain.ts
import { VISUAL } from '../../config/visualTuning';
import { devSettings } from '../../core/GameState';
import {
  readBiomeTune,
  resetTerrainDevSettings,
  writeBiomeTune,
} from '../../world/terrain/material/applyTerrainDevUniforms';
import { formatTerrainLodVertexStatsHtml, type TerrainLodVertexStats } from '../../world/terrain';
import {
  TERRAIN_ATLAS_BIOME_KEYS,
  TERRAIN_BIOME_LABELS,
  type TerrainAtlasBiomeKey,
  type TerrainBiomeTextureTune,
} from '../../world/terrain/config/terrainBiomeTuning';
import { bindCheckbox, bindRange, mountSection, rangeRowHtml, syncSpecs, type RangeSpec } from './bindRange';

type BiomeField = keyof TerrainBiomeTextureTune;

interface BiomeFieldSpec {
  field: BiomeField;
  label: string;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
}

type BiomeRangeSpec = RangeSpec & { biome: TerrainAtlasBiomeKey; field: BiomeField };

const BIOME_FIELD_SPECS: BiomeFieldSpec[] = [
  {
    field: 'tileRepeat',
    label: 'Tile repeat',
    min: 0.02,
    max: 0.2,
    step: 0.005,
    format: (v) => v.toFixed(3),
  },
  {
    field: 'detailDisplacement',
    label: 'Detail vertex disp.',
    min: 0,
    max: 2,
    step: 0.05,
    format: (v) => v.toFixed(2),
  },
  {
    field: 'normalStrength',
    label: 'Normals',
    min: 0,
    max: 2,
    step: 0.05,
    format: (v) => v.toFixed(2),
  },
  {
    field: 'roughness',
    label: 'Roughness',
    min: 0,
    max: 2,
    step: 0.05,
    format: (v) => v.toFixed(2),
  },
];

const SNOW_SPECS: RangeSpec[] = [
  {
    id: 'dev-tex-snow-start',
    label: 'Snow start',
    min: 0.5,
    max: 1,
    step: 0.01,
    defaultValue: VISUAL.terrain.snow.heightStart,
    format: (v) => v.toFixed(2),
  },
  {
    id: 'dev-tex-snow-end',
    label: 'Snow end',
    min: 0.5,
    max: 1,
    step: 0.01,
    defaultValue: VISUAL.terrain.snow.heightEnd,
    format: (v) => v.toFixed(2),
  },
  {
    id: 'dev-tex-snow-mtn',
    label: 'Snow spread',
    min: 0,
    max: 1,
    step: 0.05,
    defaultValue: VISUAL.terrain.snow.mountainWeight,
    format: (v) => v.toFixed(2),
  },
];

export interface DevPanelTerrainLodOptions {
  lodEnabled: boolean;
  vertexStats?: TerrainLodVertexStats;
}

function biomeSliderId(biome: TerrainAtlasBiomeKey, field: BiomeField): string {
  return `dev-tex-${biome}-${field}`;
}

function biomeRangeSpecs(biome: TerrainAtlasBiomeKey, hasDisplacementMaps: boolean): BiomeRangeSpec[] {
  return BIOME_FIELD_SPECS.filter(
    (spec) => !(spec.field === 'detailDisplacement' && (!hasDisplacementMaps || biome === 'meadow')),
  ).map((spec) => ({
    id: biomeSliderId(biome, spec.field),
    label: spec.label,
    min: spec.min,
    max: spec.max,
    step: spec.step,
    defaultValue: readBiomeTune(biome, spec.field),
    format: spec.format,
    biome,
    field: spec.field,
  }));
}

function bindBiomeRangeSpecs(panel: HTMLDivElement, specs: BiomeRangeSpec[]): Array<() => void> {
  return specs.map((spec) =>
    bindRange(panel, spec.id, `${spec.id}-out`, spec.format, (v) => {
      writeBiomeTune(spec.biome, spec.field, v);
    }),
  );
}

function injectBiomeAccordion(
  panel: HTMLDivElement,
  host: HTMLElement,
  biome: TerrainAtlasBiomeKey,
  hasDisplacementMaps: boolean,
): { disposers: Array<() => void>; specs: BiomeRangeSpec[] } {
  const specs = biomeRangeSpecs(biome, hasDisplacementMaps);
  const label = TERRAIN_BIOME_LABELS[biome];
  const details = document.createElement('details');
  details.className = 'dev-biome-accordion';
  details.open = false;

  const summary = document.createElement('summary');
  summary.textContent = label;
  details.appendChild(summary);

  const inner = document.createElement('div');
  inner.className = 'dev-biome-accordion-body';
  inner.innerHTML = specs.map(rangeRowHtml).join('');

  details.appendChild(inner);
  host.appendChild(details);
  return { disposers: bindBiomeRangeSpecs(panel, specs), specs };
}

export function initDevPanelTerrain(
  panel: HTMLDivElement,
  hasDisplacementMaps = false,
  lodOpts: DevPanelTerrainLodOptions = { lodEnabled: false },
): () => void {
  const body = mountSection(panel, {
    hostId: 'dev-section-terrain',
    title: 'Terrain textures',
    open: false,
    body: `
      <div id="dev-terrain-lod"></div>
      <div id="dev-terrain-disp-toggle" class="${hasDisplacementMaps ? '' : 'hidden'}"></div>
      <div id="dev-terrain-biomes"></div>
      <p id="dev-terrain-disp-hint" class="dev-hint ${hasDisplacementMaps ? 'hidden' : ''}">Vertex displacement is off — add Poly Haven <code>*_disp_${VISUAL.terrain.preferredDispResolution}</code> maps (or <code>*_disp_2k</code>) to each pack's <code>textures/</code> folder (EXR, JPG, or PNG).</p>
      <div id="dev-terrain-snow"></div>
      <p class="dev-hint">Snow spread: 0 = height only; 1 = wider snowline + mountain-splat gate.</p>
      <div class="dev-actions">
        <button type="button" id="dev-tex-reset">Reset terrain</button>
      </div>
    `,
  });
  if (!body) return () => {};

  const lodHost = panel.querySelector('#dev-terrain-lod');
  const toggleHost = panel.querySelector('#dev-terrain-disp-toggle');
  const biomesHost = panel.querySelector('#dev-terrain-biomes') as HTMLElement | null;
  const snowHost = panel.querySelector('#dev-terrain-snow') as HTMLElement | null;

  const disposers: Array<() => void> = [];
  const biomeSpecs: BiomeRangeSpec[] = [];
  const t = devSettings.terrain;
  const markDirty = () => {
    t.dirty = true;
  };

  if (lodHost) {
    lodHost.innerHTML = `
      <details class="dev-biome-accordion">
        <summary>Play terrain mesh</summary>
        <div class="dev-biome-accordion-body">
          <label class="dev-row dev-row-check ${lodOpts.lodEnabled ? '' : 'hidden'}" id="dev-tex-lod-bounds-row">
            <span>Show detail-ring debug</span>
            <input type="checkbox" id="dev-tex-lod-bounds" />
          </label>
          <p class="dev-hint ${lodOpts.lodEnabled ? '' : 'hidden'}" id="dev-tex-lod-bounds-hint">Cyan = detail radius (disp fade end). White = inner full-detail circle. Green square = fine mesh bounds.</p>
          <div class="${lodOpts.vertexStats ? '' : 'hidden'}" id="dev-tex-lod-vertex-stats">
            ${lodOpts.vertexStats ? formatTerrainLodVertexStatsHtml(lodOpts.vertexStats) : ''}
          </div>
        </div>
      </details>
      <p class="dev-hint">Detail circle: <code>detailRadiusM</code>, <code>layerFadeBandM</code>, and <code>detailDispFadeStartM</code> in <code>visualTuning.ts</code> — reload after edits.</p>
    `;
    disposers.push(
      bindCheckbox(
        panel,
        'dev-tex-lod-bounds',
        () => t.showLodBounds,
        (checked) => {
          t.showLodBounds = checked;
        },
      ),
    );
  }

  if (hasDisplacementMaps && toggleHost) {
    toggleHost.innerHTML = `
      <label class="dev-row dev-row-check">
        <span>Vertex displacement</span>
        <input type="checkbox" id="dev-tex-disp-on" />
      </label>
    `;
    disposers.push(
      bindCheckbox(
        panel,
        'dev-tex-disp-on',
        () => t.displacementEnabled,
        (checked) => {
          t.displacementEnabled = checked;
          markDirty();
        },
      ),
    );
  } else {
    t.displacementEnabled = false;
  }

  if (biomesHost) {
    for (const biome of TERRAIN_ATLAS_BIOME_KEYS) {
      if (biome === 'snow') continue;
      const accordion = injectBiomeAccordion(panel, biomesHost, biome, hasDisplacementMaps);
      biomeSpecs.push(...accordion.specs);
      disposers.push(...accordion.disposers);
    }
  }

  if (snowHost) {
    const snowBiomeSpecs = biomeRangeSpecs('snow', hasDisplacementMaps);
    biomeSpecs.push(...snowBiomeSpecs);

    const snowDetails = document.createElement('details');
    snowDetails.className = 'dev-biome-accordion';
    snowDetails.open = false;
    const summary = document.createElement('summary');
    summary.textContent = 'Snow';
    snowDetails.appendChild(summary);
    const inner = document.createElement('div');
    inner.className = 'dev-biome-accordion-body';
    inner.innerHTML = [
      ...snowBiomeSpecs.map(rangeRowHtml),
      ...SNOW_SPECS.map(rangeRowHtml),
    ].join('');
    snowDetails.appendChild(inner);
    snowHost.appendChild(snowDetails);

    disposers.push(...bindBiomeRangeSpecs(panel, snowBiomeSpecs));
    for (const spec of SNOW_SPECS) {
      disposers.push(
        bindRange(panel, spec.id, `${spec.id}-out`, spec.format, (v) => {
          if (spec.id === 'dev-tex-snow-start') t.snow.heightStart = v;
          else if (spec.id === 'dev-tex-snow-end') t.snow.heightEnd = v;
          else t.snow.mountainWeight = v;
          markDirty();
        }),
      );
    }
  }

  const readSnowSpec = (spec: RangeSpec): number => {
    if (spec.id === 'dev-tex-snow-start') return t.snow.heightStart;
    if (spec.id === 'dev-tex-snow-end') return t.snow.heightEnd;
    return t.snow.mountainWeight;
  };

  const syncAll = () => {
    syncSpecs(panel, biomeSpecs, (s) => readBiomeTune(s.biome, s.field));
    syncSpecs(panel, SNOW_SPECS, readSnowSpec);
    const dispOn = panel.querySelector('#dev-tex-disp-on') as HTMLInputElement | null;
    if (dispOn) dispOn.checked = t.displacementEnabled;
    const boundsOn = panel.querySelector('#dev-tex-lod-bounds') as HTMLInputElement | null;
    if (boundsOn) boundsOn.checked = t.showLodBounds;
  };

  const resetBtn = panel.querySelector('#dev-tex-reset') as HTMLButtonElement | null;
  const onReset = () => {
    resetTerrainDevSettings();
    if (!hasDisplacementMaps) t.displacementEnabled = false;
    markDirty();
    syncAll();
  };
  resetBtn?.addEventListener('click', onReset);
  syncAll();

  return () => {
    for (const fn of disposers) fn();
    resetBtn?.removeEventListener('click', onReset);
  };
}
