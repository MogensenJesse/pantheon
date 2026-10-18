// src/dev/panel/devPanelTerrain.ts
import { VISUAL } from '../../config/visualTuning';
import { devSettings } from '../../core/settings';
import {
  TERRAIN_ATLAS_BIOME_KEYS,
  TERRAIN_BIOME_LABELS,
  type TerrainAtlasBiomeKey,
} from '../../world/terrain/config/terrainBiomeTuning';
import {
  readBiomeTune,
  resetTerrainDevSettings,
  writeBiomeTune,
} from '../../world/terrain/material/applyTerrainDevUniforms';
import { bindRange, mountSection, type RangeSpec, rangeRowHtml, syncSpecs } from '../bindRange';

/** A slider plus the accessors that connect it to the live terrain settings. */
interface TerrainRangeSpec extends RangeSpec {
  read: () => number;
  write: (value: number) => void;
}

const fixed = (digits: number) => (v: number) => v.toFixed(digits);
const degrees = (v: number) => `${v.toFixed(0)}°`;

function rangeSpec(
  id: string,
  label: string,
  [min, max, step]: readonly [number, number, number],
  defaultValue: number,
  format: (v: number) => string,
  read: () => number,
  write: (value: number) => void,
): TerrainRangeSpec {
  return { id, label, min, max, step, defaultValue, format, read, write };
}

const terrain = () => devSettings.terrain;
const shipped = VISUAL.terrain;

const CHISEL_SPECS: TerrainRangeSpec[] = [
  rangeSpec(
    'dev-tex-chisel-edge-soft',
    'Edge soft',
    [0, 0.5, 0.01],
    shipped.chisel.edgeSoft,
    fixed(2),
    () => terrain().chisel.edgeSoft,
    (v) => {
      terrain().chisel.edgeSoft = v;
    },
  ),
];

const STYLIZE_SPECS: TerrainRangeSpec[] = [
  rangeSpec(
    'dev-tex-stylize-mix',
    'Hue-split mix',
    [0, 1, 0.05],
    shipped.stylize.albedoPaletteMix,
    fixed(2),
    () => terrain().stylize.albedoPaletteMix,
    (v) => {
      terrain().stylize.albedoPaletteMix = v;
    },
  ),
  rangeSpec(
    'dev-tex-stylize-global-mix',
    'Global palette',
    [0, 1, 0.05],
    shipped.stylize.globalPaletteMix,
    fixed(2),
    () => terrain().stylize.globalPaletteMix,
    (v) => {
      terrain().stylize.globalPaletteMix = v;
    },
  ),
];

const SNOW_SPECS: TerrainRangeSpec[] = [
  rangeSpec(
    'dev-tex-snow-start',
    'Snow start',
    [0.5, 1, 0.01],
    shipped.snow.heightStart,
    fixed(2),
    () => terrain().snow.heightStart,
    (v) => {
      terrain().snow.heightStart = v;
    },
  ),
  rangeSpec(
    'dev-tex-snow-end',
    'Snow end',
    [0.5, 1, 0.01],
    shipped.snow.heightEnd,
    fixed(2),
    () => terrain().snow.heightEnd,
    (v) => {
      terrain().snow.heightEnd = v;
    },
  ),
  rangeSpec(
    'dev-tex-snow-mtn',
    'Snow spread',
    [0, 1, 0.05],
    shipped.snow.mountainWeight,
    fixed(2),
    () => terrain().snow.mountainWeight,
    (v) => {
      terrain().snow.mountainWeight = v;
    },
  ),
  rangeSpec(
    'dev-tex-snow-noise-amp',
    'Noise amplitude',
    [0, 0.2, 0.005],
    shipped.snow.noise.amplitude,
    fixed(3),
    () => terrain().snow.noise.amplitude,
    (v) => {
      terrain().snow.noise.amplitude = v;
    },
  ),
  rangeSpec(
    'dev-tex-snow-noise-scale',
    'Noise scale',
    [0.002, 0.05, 0.001],
    shipped.snow.noise.scale,
    fixed(3),
    () => terrain().snow.noise.scale,
    (v) => {
      terrain().snow.noise.scale = v;
    },
  ),
  rangeSpec(
    'dev-tex-snow-aspect-strength',
    'Sun melt',
    [0, 1, 0.05],
    shipped.snow.aspect.strength,
    fixed(2),
    () => terrain().snow.aspect.strength,
    (v) => {
      terrain().snow.aspect.strength = v;
    },
  ),
  rangeSpec(
    'dev-tex-snow-aspect-shade',
    'Shade boost',
    [0, 0.5, 0.01],
    shipped.snow.aspect.shadeBoost,
    fixed(2),
    () => terrain().snow.aspect.shadeBoost,
    (v) => {
      terrain().snow.aspect.shadeBoost = v;
    },
  ),
  rangeSpec(
    'dev-tex-snow-aspect-azimuth',
    'Ref sun azimuth',
    [0, 360, 1],
    shipped.snow.aspect.referenceAzimuthDeg,
    degrees,
    () => terrain().snow.aspect.referenceAzimuthDeg,
    (v) => {
      terrain().snow.aspect.referenceAzimuthDeg = v;
    },
  ),
  rangeSpec(
    'dev-tex-snow-aspect-elev',
    'Ref sun elev',
    [5, 85, 1],
    shipped.snow.aspect.referenceElevationDeg,
    degrees,
    () => terrain().snow.aspect.referenceElevationDeg,
    (v) => {
      terrain().snow.aspect.referenceElevationDeg = v;
    },
  ),
];

/** Per-biome tile repeat (world XZ UV scale of that atlas slot). */
function tileRepeatSpec(biome: TerrainAtlasBiomeKey): TerrainRangeSpec {
  return rangeSpec(
    `dev-tex-${biome}-tileRepeat`,
    'Tile repeat',
    [0.02, 0.2, 0.005],
    readBiomeTune(biome, 'tileRepeat'),
    fixed(3),
    () => readBiomeTune(biome, 'tileRepeat'),
    (v) => writeBiomeTune(biome, 'tileRepeat', v),
  );
}

/** Append a `<details>` accordion with `bodyHtml` to `host`. */
function mountAccordion(host: HTMLElement, title: string, bodyHtml: string, open: boolean): void {
  const details = document.createElement('details');
  details.className = 'dev-biome-accordion';
  details.open = open;
  const summary = document.createElement('summary');
  summary.textContent = title;
  const inner = document.createElement('div');
  inner.className = 'dev-biome-accordion-body';
  inner.innerHTML = bodyHtml;
  details.append(summary, inner);
  host.appendChild(details);
}

const rowsHtml = (specs: readonly RangeSpec[]) => specs.map(rangeRowHtml).join('');

const CHISEL_HINT = `<p class="dev-hint">Fillets lighting across the knife crease only (the shared triangle edge). Facet interiors stay flat; vertex Y stays planar so the 8 m silhouette does not round. 0 = knife, ~0.15 ≈ 1.2 m on 8 m slabs.</p>`;
const STYLIZE_HINT = `<p class="dev-hint">Hue-split mix 0 = photographed albedo, 1 = palettes. Global palette 1 paints every biome with the per-stop <strong>Global</strong> trio; 0 uses per-biome palettes. Both live under <strong>Time of day → Terrain palettes</strong> (selected stop).</p>
      <p class="dev-hint">Distance haze is under Dev → Distance haze (scene fog). Color picks are live; shader graph changes still need a full page reload.</p>`;

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

  const hostOf = (id: string) => panel.querySelector(`#${id}`) as HTMLElement | null;
  const allSpecs: TerrainRangeSpec[] = [];
  const markDirty = () => {
    terrain().dirty = true;
  };

  const mount = (host: HTMLElement | null, title: string, specs: TerrainRangeSpec[], hint = '') => {
    if (!host) return;
    mountAccordion(host, title, rowsHtml(specs) + hint, true);
    allSpecs.push(...specs);
  };
  mount(hostOf('dev-terrain-chisel'), 'Chisel', CHISEL_SPECS, CHISEL_HINT);
  mount(hostOf('dev-terrain-stylize'), 'Stylize', STYLIZE_SPECS, STYLIZE_HINT);

  const biomesHost = hostOf('dev-terrain-biomes');
  if (biomesHost) {
    for (const biome of TERRAIN_ATLAS_BIOME_KEYS) {
      if (biome === 'snow') continue;
      const specs = [tileRepeatSpec(biome)];
      mountAccordion(biomesHost, TERRAIN_BIOME_LABELS[biome], rowsHtml(specs), false);
      allSpecs.push(...specs);
    }
  }

  const snowHost = hostOf('dev-terrain-snow');
  if (snowHost) {
    const specs = [tileRepeatSpec('snow'), ...SNOW_SPECS];
    mountAccordion(snowHost, 'Snow', rowsHtml(specs), false);
    allSpecs.push(...specs);
  }

  const disposers = allSpecs.map((spec) =>
    bindRange(panel, spec.id, `${spec.id}-out`, spec.format, (v) => {
      spec.write(v);
      markDirty();
    }),
  );

  const syncAll = () => syncSpecs(panel, allSpecs, (spec) => spec.read());

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
