// src/dev/panel/devPanelTerrain.ts
import { VISUAL } from '../../config/visualTuning';
import { devSettings } from '../../core/GameState';
import { formatTerrainLodVertexStatsHtml, type TerrainLodVertexStats } from '../../world/terrain';
import {
  TERRAIN_ATLAS_BIOME_KEYS,
  TERRAIN_BIOME_LABELS,
  type TerrainAtlasBiomeKey,
} from '../../world/terrain/config/terrainBiomeTuning';
import {
  readSolidColor,
  resetTerrainDevSettings,
  writeSolidColor,
} from '../../world/terrain/material/applyTerrainDevUniforms';
import {
  bindCheckbox,
  bindRange,
  mountSection,
  type RangeSpec,
  rangeRowHtml,
  syncSpecs,
} from '../bindRange';

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
  {
    id: 'dev-tex-snow-noise-amp',
    label: 'Noise amplitude',
    min: 0,
    max: 0.2,
    step: 0.005,
    defaultValue: VISUAL.terrain.snow.noise.amplitude,
    format: (v) => v.toFixed(3),
  },
  {
    id: 'dev-tex-snow-noise-scale',
    label: 'Noise scale',
    min: 0.002,
    max: 0.05,
    step: 0.001,
    defaultValue: VISUAL.terrain.snow.noise.scale,
    format: (v) => v.toFixed(3),
  },
  {
    id: 'dev-tex-snow-aspect-strength',
    label: 'Sun melt',
    min: 0,
    max: 1,
    step: 0.05,
    defaultValue: VISUAL.terrain.snow.aspect.strength,
    format: (v) => v.toFixed(2),
  },
  {
    id: 'dev-tex-snow-aspect-shade',
    label: 'Shade boost',
    min: 0,
    max: 0.5,
    step: 0.01,
    defaultValue: VISUAL.terrain.snow.aspect.shadeBoost,
    format: (v) => v.toFixed(2),
  },
  {
    id: 'dev-tex-snow-aspect-azimuth',
    label: 'Ref sun azimuth',
    min: 0,
    max: 360,
    step: 1,
    defaultValue: VISUAL.terrain.snow.aspect.referenceAzimuthDeg,
    format: (v) => `${v.toFixed(0)}°`,
  },
  {
    id: 'dev-tex-snow-aspect-elev',
    label: 'Ref sun elev',
    min: 5,
    max: 85,
    step: 1,
    defaultValue: VISUAL.terrain.snow.aspect.referenceElevationDeg,
    format: (v) => `${v.toFixed(0)}°`,
  },
  {
    id: 'dev-tex-snow-slope-start',
    label: 'Slope shed start',
    min: 0.2,
    max: 0.9,
    step: 0.01,
    defaultValue: VISUAL.terrain.snow.slope.normalYStart,
    format: (v) => v.toFixed(2),
  },
  {
    id: 'dev-tex-snow-slope-end',
    label: 'Slope shed end',
    min: 0.05,
    max: 0.8,
    step: 0.01,
    defaultValue: VISUAL.terrain.snow.slope.normalYEnd,
    format: (v) => v.toFixed(2),
  },
];

export interface DevPanelTerrainLodOptions {
  lodEnabled: boolean;
  vertexStats?: TerrainLodVertexStats;
}

function colorInputId(biome: TerrainAtlasBiomeKey): string {
  return `dev-tex-${biome}-color`;
}

function colorRowHtml(biome: TerrainAtlasBiomeKey): string {
  return `
    <label class="dev-row">
      <span>${TERRAIN_BIOME_LABELS[biome]}</span>
      <input type="color" id="${colorInputId(biome)}" value="${readSolidColor(biome)}" />
    </label>
  `;
}

export function initDevPanelTerrain(
  panel: HTMLDivElement,
  _hasDisplacementMaps = false,
  lodOpts: DevPanelTerrainLodOptions = { lodEnabled: false },
): () => void {
  const body = mountSection(panel, {
    hostId: 'dev-section-terrain',
    title: 'Terrain',
    open: false,
    body: `
      <div id="dev-terrain-lod"></div>
      <div id="dev-terrain-colors"></div>
      <p class="dev-hint">Mesh density: <code>VISUAL.terrain.meshSegments</code> (play) / <code>editorMeshSegments</code> — full page reload after edits. Paint blur is 0 (hard biome cells).</p>
      <div id="dev-terrain-snow"></div>
      <p class="dev-hint">Snow spread: 0 = height only; 1 = wider snowline + mountain-splat gate. Noise/aspect/slope shape the snowline; ref sun azimuth is fixed (not live day cycle).</p>
      <div class="dev-actions">
        <button type="button" id="dev-tex-reset">Reset terrain</button>
      </div>
    `,
  });
  if (!body) return () => {};

  const lodHost = panel.querySelector('#dev-terrain-lod');
  const colorsHost = panel.querySelector('#dev-terrain-colors') as HTMLElement | null;
  const snowHost = panel.querySelector('#dev-terrain-snow') as HTMLElement | null;

  const disposers: Array<() => void> = [];
  const t = devSettings.terrain;
  const markDirty = () => {
    t.dirty = true;
  };

  const readSnowSpec = (spec: RangeSpec): number => {
    const s = t.snow;
    switch (spec.id) {
      case 'dev-tex-snow-start':
        return s.heightStart;
      case 'dev-tex-snow-end':
        return s.heightEnd;
      case 'dev-tex-snow-mtn':
        return s.mountainWeight;
      case 'dev-tex-snow-noise-amp':
        return s.noise.amplitude;
      case 'dev-tex-snow-noise-scale':
        return s.noise.scale;
      case 'dev-tex-snow-aspect-strength':
        return s.aspect.strength;
      case 'dev-tex-snow-aspect-shade':
        return s.aspect.shadeBoost;
      case 'dev-tex-snow-aspect-azimuth':
        return s.aspect.referenceAzimuthDeg;
      case 'dev-tex-snow-aspect-elev':
        return s.aspect.referenceElevationDeg;
      case 'dev-tex-snow-slope-start':
        return s.slope.normalYStart;
      case 'dev-tex-snow-slope-end':
        return s.slope.normalYEnd;
      default:
        return spec.defaultValue ?? 0;
    }
  };

  const writeSnowSpec = (id: string, v: number): void => {
    const s = t.snow;
    switch (id) {
      case 'dev-tex-snow-start':
        s.heightStart = v;
        break;
      case 'dev-tex-snow-end':
        s.heightEnd = v;
        break;
      case 'dev-tex-snow-mtn':
        s.mountainWeight = v;
        break;
      case 'dev-tex-snow-noise-amp':
        s.noise.amplitude = v;
        break;
      case 'dev-tex-snow-noise-scale':
        s.noise.scale = v;
        break;
      case 'dev-tex-snow-aspect-strength':
        s.aspect.strength = v;
        break;
      case 'dev-tex-snow-aspect-shade':
        s.aspect.shadeBoost = v;
        break;
      case 'dev-tex-snow-aspect-azimuth':
        s.aspect.referenceAzimuthDeg = v;
        break;
      case 'dev-tex-snow-aspect-elev':
        s.aspect.referenceElevationDeg = v;
        break;
      case 'dev-tex-snow-slope-start':
        s.slope.normalYStart = v;
        break;
      case 'dev-tex-snow-slope-end':
        s.slope.normalYEnd = v;
        break;
      default:
        break;
    }
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

  if (colorsHost) {
    colorsHost.innerHTML = `
      <details class="dev-biome-accordion" open>
        <summary>Solid colors</summary>
        <div class="dev-biome-accordion-body">
          ${TERRAIN_ATLAS_BIOME_KEYS.map(colorRowHtml).join('')}
        </div>
      </details>
    `;
    for (const biome of TERRAIN_ATLAS_BIOME_KEYS) {
      const input = panel.querySelector(`#${colorInputId(biome)}`) as HTMLInputElement | null;
      if (!input) continue;
      const onInput = () => {
        writeSolidColor(biome, input.value);
      };
      input.addEventListener('input', onInput);
      disposers.push(() => input.removeEventListener('input', onInput));
    }
  }

  if (snowHost) {
    const snowDetails = document.createElement('details');
    snowDetails.className = 'dev-biome-accordion';
    snowDetails.open = false;
    const summary = document.createElement('summary');
    summary.textContent = 'Snow';
    snowDetails.appendChild(summary);
    const inner = document.createElement('div');
    inner.className = 'dev-biome-accordion-body';
    inner.innerHTML = SNOW_SPECS.map(rangeRowHtml).join('');
    snowDetails.appendChild(inner);
    snowHost.appendChild(snowDetails);

    for (const spec of SNOW_SPECS) {
      disposers.push(
        bindRange(panel, spec.id, `${spec.id}-out`, spec.format, (v) => {
          writeSnowSpec(spec.id, v);
          markDirty();
        }),
      );
    }
  }

  const syncAll = () => {
    syncSpecs(panel, SNOW_SPECS, readSnowSpec);
    for (const biome of TERRAIN_ATLAS_BIOME_KEYS) {
      const input = panel.querySelector(`#${colorInputId(biome)}`) as HTMLInputElement | null;
      if (input) input.value = readSolidColor(biome);
    }
    const boundsOn = panel.querySelector('#dev-tex-lod-bounds') as HTMLInputElement | null;
    if (boundsOn) boundsOn.checked = t.showLodBounds;
  };

  const resetBtn = panel.querySelector('#dev-tex-reset') as HTMLButtonElement | null;
  const onReset = () => {
    resetTerrainDevSettings();
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
