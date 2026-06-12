// src/ui/dev/devPanelTerrain.ts
import { VISUAL } from '../../config/visualTuning';
import { devSettings } from '../../core/GameState';
import {
  readBiomeTune,
  resetTerrainDevSettings,
  writeBiomeTune,
} from '../../world/terrain/applyTerrainDevUniforms';
import type { TerrainSplatMaterial } from '../../world/terrain/TerrainSplatMaterial';
import {
  TERRAIN_ATLAS_BIOME_KEYS,
  TERRAIN_BIOME_LABELS,
  type TerrainAtlasBiomeKey,
  type TerrainBiomeTextureTune,
} from '../../world/terrain/terrainBiomeTuning';
import { bindCheckbox, bindRange, mountSection, type RangeSpec } from './bindRange';

type BiomeField = keyof TerrainBiomeTextureTune;

interface BiomeFieldSpec {
  field: BiomeField;
  label: string;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
}

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

function biomeSliderId(biome: TerrainAtlasBiomeKey, field: BiomeField): string {
  return `dev-tex-${biome}-${field}`;
}

function injectBiomeAccordion(
  host: HTMLElement,
  biome: TerrainAtlasBiomeKey,
  hasDisplacementMaps: boolean,
): Array<() => void> {
  const disposers: Array<() => void> = [];
  const label = TERRAIN_BIOME_LABELS[biome];
  const details = document.createElement('details');
  details.className = 'dev-biome-accordion';
  details.open = biome === 'hills';

  const summary = document.createElement('summary');
  summary.textContent = label;
  details.appendChild(summary);

  const inner = document.createElement('div');
  inner.className = 'dev-biome-accordion-body';

  for (const spec of BIOME_FIELD_SPECS) {
    if (spec.field === 'detailDisplacement' && (!hasDisplacementMaps || biome === 'meadow')) continue;

    const row = document.createElement('label');
    row.className = 'dev-row';
    const id = biomeSliderId(biome, spec.field);
    row.innerHTML = `
      <span>${spec.label}</span>
      <input type="range" id="${id}" min="${spec.min}" max="${spec.max}" step="${spec.step}" />
      <span class="dev-out" id="${id}-out"></span>
    `;
    inner.appendChild(row);

    const input = row.querySelector('input') as HTMLInputElement;
    const out = row.querySelector('.dev-out') as HTMLSpanElement;
    const sync = () => {
      const v = readBiomeTune(biome, spec.field);
      input.value = String(v);
      out.textContent = spec.format(v);
    };
    sync();

    const onInput = () => {
      writeBiomeTune(biome, spec.field, Number.parseFloat(input.value));
      out.textContent = spec.format(Number.parseFloat(input.value));
    };
    input.addEventListener('input', onInput);
    disposers.push(() => input.removeEventListener('input', onInput));
  }

  details.appendChild(inner);
  host.appendChild(details);
  return disposers;
}

export function initDevPanelTerrain(
  panel: HTMLDivElement,
  _terrainMaterial: TerrainSplatMaterial,
  hasDisplacementMaps = false,
): () => void {
  void _terrainMaterial;
  const body = mountSection(panel, {
    hostId: 'dev-section-terrain',
    title: 'Terrain textures',
    open: false,
    body: `
      <div id="dev-terrain-disp-toggle" class="${hasDisplacementMaps ? '' : 'hidden'}"></div>
      <div id="dev-terrain-biomes"></div>
      <p id="dev-terrain-disp-hint" class="dev-hint ${hasDisplacementMaps ? 'hidden' : ''}">Vertex displacement is off — add Poly Haven <code>*_disp_2k</code> maps to each pack's <code>textures/</code> folder (EXR, JPG, or PNG).</p>
      <div id="dev-terrain-snow"></div>
      <p class="dev-hint">Snow spread: 0 = height only; 1 = wider snowline + mountain-splat gate.</p>
      <div class="dev-actions">
        <button type="button" id="dev-tex-reset">Reset terrain</button>
      </div>
    `,
  });
  if (!body) return () => {};

  const toggleHost = panel.querySelector('#dev-terrain-disp-toggle');
  const biomesHost = panel.querySelector('#dev-terrain-biomes') as HTMLElement | null;
  const snowHost = panel.querySelector('#dev-terrain-snow') as HTMLElement | null;

  const disposers: Array<() => void> = [];
  const t = devSettings.terrain;
  const markDirty = () => {
    t.dirty = true;
  };

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
      disposers.push(...injectBiomeAccordion(biomesHost, biome, hasDisplacementMaps));
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

    for (const spec of BIOME_FIELD_SPECS) {
      if (spec.field === 'detailDisplacement' && !hasDisplacementMaps) continue;
      const row = document.createElement('label');
      row.className = 'dev-row';
      const id = biomeSliderId('snow', spec.field);
      row.innerHTML = `
        <span>${spec.label}</span>
        <input type="range" id="${id}" min="${spec.min}" max="${spec.max}" step="${spec.step}" />
        <span class="dev-out" id="${id}-out"></span>
      `;
      inner.appendChild(row);
      const input = row.querySelector('input') as HTMLInputElement;
      const out = row.querySelector('.dev-out') as HTMLSpanElement;
      const sync = () => {
        const v = readBiomeTune('snow', spec.field);
        input.value = String(v);
        out.textContent = spec.format(v);
      };
      sync();
      const onInput = () => {
        writeBiomeTune('snow', spec.field, Number.parseFloat(input.value));
        out.textContent = spec.format(Number.parseFloat(input.value));
      };
      input.addEventListener('input', onInput);
      disposers.push(() => input.removeEventListener('input', onInput));
    }

    for (const spec of SNOW_SPECS) {
      const row = document.createElement('label');
      row.className = 'dev-row';
      row.innerHTML = `
        <span>${spec.label}</span>
        <input type="range" id="${spec.id}" min="${spec.min}" max="${spec.max}" step="${spec.step}" />
        <span class="dev-out" id="${spec.id}-out"></span>
      `;
      inner.appendChild(row);
      disposers.push(
        bindRange(panel, spec.id, `${spec.id}-out`, spec.format, (v) => {
          if (spec.id === 'dev-tex-snow-start') t.snow.heightStart = v;
          else if (spec.id === 'dev-tex-snow-end') t.snow.heightEnd = v;
          else t.snow.mountainWeight = v;
          markDirty();
        }),
      );
    }

    snowDetails.appendChild(inner);
    snowHost.appendChild(snowDetails);

    for (const spec of SNOW_SPECS) {
      const input = panel.querySelector(`#${spec.id}`) as HTMLInputElement | null;
      const out = panel.querySelector(`#${spec.id}-out`) as HTMLSpanElement | null;
      if (!input || !out) continue;
      const v =
        spec.id === 'dev-tex-snow-start'
          ? t.snow.heightStart
          : spec.id === 'dev-tex-snow-end'
            ? t.snow.heightEnd
            : t.snow.mountainWeight;
      input.value = String(v);
      out.textContent = spec.format(v);
    }
  }

  const syncAll = () => {
    for (const biome of TERRAIN_ATLAS_BIOME_KEYS) {
      for (const spec of BIOME_FIELD_SPECS) {
        if (spec.field === 'detailDisplacement' && (!hasDisplacementMaps || biome === 'meadow')) continue;
        const input = panel.querySelector(`#${biomeSliderId(biome, spec.field)}`) as HTMLInputElement | null;
        const out = panel.querySelector(`#${biomeSliderId(biome, spec.field)}-out`) as HTMLSpanElement | null;
        if (!input || !out) continue;
        const v = readBiomeTune(biome, spec.field);
        input.value = String(v);
        out.textContent = spec.format(v);
      }
    }
    for (const spec of SNOW_SPECS) {
      const input = panel.querySelector(`#${spec.id}`) as HTMLInputElement | null;
      const out = panel.querySelector(`#${spec.id}-out`) as HTMLSpanElement | null;
      if (!input || !out) continue;
      const v =
        spec.id === 'dev-tex-snow-start'
          ? t.snow.heightStart
          : spec.id === 'dev-tex-snow-end'
            ? t.snow.heightEnd
            : t.snow.mountainWeight;
      input.value = String(v);
      out.textContent = spec.format(v);
    }
    const dispOn = panel.querySelector('#dev-tex-disp-on') as HTMLInputElement | null;
    if (dispOn) dispOn.checked = t.displacementEnabled;
  };

  const resetBtn = panel.querySelector('#dev-tex-reset') as HTMLButtonElement | null;
  const onReset = () => {
    resetTerrainDevSettings();
    if (!hasDisplacementMaps) t.displacementEnabled = false;
    markDirty();
    syncAll();
  };
  resetBtn?.addEventListener('click', onReset);

  return () => {
    for (const fn of disposers) fn();
    resetBtn?.removeEventListener('click', onReset);
  };
}
