// src/dev/panel/devPanelTerrain.ts
import { VISUAL } from '../../config/visualTuning';
import { devSettings } from '../../core/GameState';
import {
  TERRAIN_ATLAS_BIOME_KEYS,
  TERRAIN_BIOME_LABELS,
  type TerrainAtlasBiomeKey,
  type TerrainBiomeTextureTune,
  type TerrainStylizePaletteMap,
  type TerrainStylizeStop,
} from '../../world/terrain/config/terrainBiomeTuning';
import {
  readBiomeTune,
  resetTerrainDevSettings,
  writeBiomeTune,
} from '../../world/terrain/material/applyTerrainDevUniforms';
import {
  bindColor,
  bindRange,
  mountSection,
  type RangeSpec,
  rangeRowHtml,
  syncColor,
  syncSpecs,
} from '../bindRange';

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

const PALETTE_TODS = ['noon', 'goldenHour'] as const;
const PALETTE_STOPS = ['sun', 'ground', 'shadow'] as const;
const PALETTE_TOD_LABELS = { noon: 'Noon', goldenHour: 'Golden' } as const;

function paletteColorId(
  biome: TerrainAtlasBiomeKey,
  tod: (typeof PALETTE_TODS)[number],
  stop: (typeof PALETTE_STOPS)[number],
): string {
  return `dev-tex-palette-${biome}-${tod}-${stop}`;
}

function paletteTodRowHtml(
  biome: TerrainAtlasBiomeKey,
  tod: (typeof PALETTE_TODS)[number],
  palettes: TerrainStylizePaletteMap,
): string {
  const inputs = PALETTE_STOPS.map(
    (stop) =>
      `<input type="color" id="${paletteColorId(biome, tod, stop)}" value="${palettes[biome][tod][stop]}" title="${stop}" />`,
  ).join('');
  return `<div class="dev-palette-tod"><span>${PALETTE_TOD_LABELS[tod]}</span>${inputs}</div>`;
}

function globalPaletteColorId(stop: (typeof PALETTE_STOPS)[number]): string {
  return `dev-tex-stylize-global-${stop}`;
}

function globalPaletteRowHtml(global: TerrainStylizeStop): string {
  const inputs = PALETTE_STOPS.map(
    (stop) =>
      `<input type="color" id="${globalPaletteColorId(stop)}" value="${global[stop]}" title="${stop}" />`,
  ).join('');
  return `<div class="dev-palette-tod"><span>Global</span>${inputs}</div>`;
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
];

const CHISEL_SPECS: RangeSpec[] = [
  {
    id: 'dev-tex-chisel-edge-soft',
    label: 'Edge soft',
    min: 0,
    max: 0.5,
    step: 0.01,
    defaultValue: VISUAL.terrain.chisel.edgeSoft,
    format: (v) => v.toFixed(2),
  },
];

const STYLIZE_SPECS: RangeSpec[] = [
  {
    id: 'dev-tex-stylize-mix',
    label: 'Hue-split mix',
    min: 0,
    max: 1,
    step: 0.05,
    defaultValue: VISUAL.terrain.stylize.albedoPaletteMix,
    format: (v) => v.toFixed(2),
  },
  {
    id: 'dev-tex-stylize-global-mix',
    label: 'Global palette',
    min: 0,
    max: 1,
    step: 0.05,
    defaultValue: VISUAL.terrain.stylize.globalPaletteMix,
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
];

function biomeSliderId(biome: TerrainAtlasBiomeKey, field: BiomeField): string {
  return `dev-tex-${biome}-${field}`;
}

function biomeRangeSpecs(biome: TerrainAtlasBiomeKey): BiomeRangeSpec[] {
  return BIOME_FIELD_SPECS.map((spec) => ({
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
): { disposers: Array<() => void>; specs: BiomeRangeSpec[] } {
  const specs = biomeRangeSpecs(biome);
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

export function initDevPanelTerrain(panel: HTMLDivElement): () => void {
  const body = mountSection(panel, {
    hostId: 'dev-section-terrain',
    title: 'Terrain textures',
    open: false,
    body: `
      <div id="dev-terrain-chisel"></div>
      <div id="dev-terrain-stylize"></div>
      <div id="dev-terrain-biomes"></div>
      <div id="dev-terrain-snow"></div>
      <p class="dev-hint">Snow spread: 0 = height only; 1 = wider snowline + mountain-splat gate. Noise/aspect/slope shape the snowline; ref sun azimuth is fixed (not live day cycle).</p>
      <div class="dev-actions">
        <button type="button" id="dev-tex-reset">Reset terrain</button>
      </div>
    `,
  });
  if (!body) return () => {};

  const chiselHost = panel.querySelector('#dev-terrain-chisel') as HTMLElement | null;
  const biomesHost = panel.querySelector('#dev-terrain-biomes') as HTMLElement | null;
  const snowHost = panel.querySelector('#dev-terrain-snow') as HTMLElement | null;

  const disposers: Array<() => void> = [];
  const biomeSpecs: BiomeRangeSpec[] = [];
  const t = devSettings.terrain;
  const markDirty = () => {
    t.dirty = true;
  };

  const stylizeHost = panel.querySelector('#dev-terrain-stylize') as HTMLElement | null;

  const readChiselSpec = (spec: RangeSpec): number => {
    if (spec.id === 'dev-tex-chisel-edge-soft') return t.chisel.edgeSoft;
    return spec.defaultValue ?? 0;
  };

  const writeChiselSpec = (id: string, v: number): void => {
    if (id === 'dev-tex-chisel-edge-soft') t.chisel.edgeSoft = v;
  };

  if (chiselHost) {
    const details = document.createElement('details');
    details.className = 'dev-biome-accordion';
    details.open = true;
    const summary = document.createElement('summary');
    summary.textContent = 'Chisel';
    details.appendChild(summary);
    const inner = document.createElement('div');
    inner.className = 'dev-biome-accordion-body';
    inner.innerHTML = `${CHISEL_SPECS.map(rangeRowHtml).join('')}
      <p class="dev-hint">Fillets lighting across the knife crease only (the shared triangle edge). Facet interiors stay flat; vertex Y stays planar so the 8 m silhouette does not round. 0 = knife, ~0.15 ≈ 1.2 m on 8 m slabs.</p>`;
    details.appendChild(inner);
    chiselHost.appendChild(details);
    for (const spec of CHISEL_SPECS) {
      disposers.push(
        bindRange(panel, spec.id, `${spec.id}-out`, spec.format, (v) => {
          writeChiselSpec(spec.id, v);
          markDirty();
        }),
      );
    }
  }

  const readStylizeSpec = (spec: RangeSpec): number => {
    const s = t.stylize;
    switch (spec.id) {
      case 'dev-tex-stylize-mix':
        return s.albedoPaletteMix;
      case 'dev-tex-stylize-global-mix':
        return s.globalPaletteMix;
      default:
        return spec.defaultValue ?? 0;
    }
  };

  const writeStylizeSpec = (id: string, v: number): void => {
    const s = t.stylize;
    switch (id) {
      case 'dev-tex-stylize-mix':
        s.albedoPaletteMix = v;
        break;
      case 'dev-tex-stylize-global-mix':
        s.globalPaletteMix = v;
        break;
      default:
        break;
    }
  };

  if (stylizeHost) {
    const details = document.createElement('details');
    details.className = 'dev-biome-accordion';
    details.open = true;
    const summary = document.createElement('summary');
    summary.textContent = 'Stylize';
    details.appendChild(summary);
    const inner = document.createElement('div');
    inner.className = 'dev-biome-accordion-body';
    inner.innerHTML = `${STYLIZE_SPECS.map(rangeRowHtml).join('')}
      <div class="dev-palette-legend">
        <span></span><span>Sun</span><span>Ground</span><span>Shadow</span>
      </div>
      ${globalPaletteRowHtml(t.stylize.global)}
      <p class="dev-hint">Hue-split mix 0 = photographed albedo, 1 = palettes. Global palette 1 paints every biome with the three colors above (noon and golden); 0 uses per-biome palettes below.</p>
      <details class="dev-biome-accordion">
        <summary>Palettes</summary>
        <div class="dev-biome-accordion-body">
          <div class="dev-palette-legend">
            <span></span><span>Sun</span><span>Ground</span><span>Shadow</span>
          </div>
          ${TERRAIN_ATLAS_BIOME_KEYS.map(
            (biome) => `<details class="dev-biome-accordion">
            <summary>${TERRAIN_BIOME_LABELS[biome]}</summary>
            <div class="dev-biome-accordion-body">
              ${PALETTE_TODS.map((tod) => paletteTodRowHtml(biome, tod, t.stylize.biomes)).join('')}
            </div>
          </details>`,
          ).join('')}
        </div>
      </details>
      <p class="dev-hint">Sun / ground / shadow remaps atlas luma. Noon vs golden hour follows the day cycle. Distance haze is under Dev → Distance haze (scene fog). Color picks are live; shader graph changes still need a full page reload.</p>`;
    details.appendChild(inner);
    stylizeHost.appendChild(details);
    for (const spec of STYLIZE_SPECS) {
      disposers.push(
        bindRange(panel, spec.id, `${spec.id}-out`, spec.format, (v) => {
          writeStylizeSpec(spec.id, v);
          markDirty();
        }),
      );
    }
    for (const stop of PALETTE_STOPS) {
      disposers.push(
        bindColor(panel, globalPaletteColorId(stop), (hex) => {
          t.stylize.global[stop] = hex;
          markDirty();
        }),
      );
    }
    for (const biome of TERRAIN_ATLAS_BIOME_KEYS) {
      for (const tod of PALETTE_TODS) {
        for (const stop of PALETTE_STOPS) {
          disposers.push(
            bindColor(panel, paletteColorId(biome, tod, stop), (hex) => {
              t.stylize.biomes[biome][tod][stop] = hex;
              markDirty();
            }),
          );
        }
      }
    }
  }

  if (biomesHost) {
    for (const biome of TERRAIN_ATLAS_BIOME_KEYS) {
      if (biome === 'snow') continue;
      const accordion = injectBiomeAccordion(panel, biomesHost, biome);
      biomeSpecs.push(...accordion.specs);
      disposers.push(...accordion.disposers);
    }
  }

  if (snowHost) {
    const snowBiomeSpecs = biomeRangeSpecs('snow');
    biomeSpecs.push(...snowBiomeSpecs);

    const snowDetails = document.createElement('details');
    snowDetails.className = 'dev-biome-accordion';
    snowDetails.open = false;
    const summary = document.createElement('summary');
    summary.textContent = 'Snow';
    snowDetails.appendChild(summary);
    const inner = document.createElement('div');
    inner.className = 'dev-biome-accordion-body';
    inner.innerHTML = [...snowBiomeSpecs.map(rangeRowHtml), ...SNOW_SPECS.map(rangeRowHtml)].join(
      '',
    );
    snowDetails.appendChild(inner);
    snowHost.appendChild(snowDetails);

    disposers.push(...bindBiomeRangeSpecs(panel, snowBiomeSpecs));
    for (const spec of SNOW_SPECS) {
      disposers.push(
        bindRange(panel, spec.id, `${spec.id}-out`, spec.format, (v) => {
          writeSnowSpec(spec.id, v);
          markDirty();
        }),
      );
    }
  }

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
      default:
        break;
    }
  };

  const syncAll = () => {
    syncSpecs(panel, biomeSpecs, (s) => readBiomeTune(s.biome, s.field));
    syncSpecs(panel, SNOW_SPECS, readSnowSpec);
    syncSpecs(panel, CHISEL_SPECS, readChiselSpec);
    syncSpecs(panel, STYLIZE_SPECS, readStylizeSpec);
    for (const stop of PALETTE_STOPS) {
      syncColor(panel, globalPaletteColorId(stop), t.stylize.global[stop]);
    }
    for (const biome of TERRAIN_ATLAS_BIOME_KEYS) {
      for (const tod of PALETTE_TODS) {
        for (const stop of PALETTE_STOPS) {
          syncColor(panel, paletteColorId(biome, tod, stop), t.stylize.biomes[biome][tod][stop]);
        }
      }
    }
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
