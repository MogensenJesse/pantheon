// src/dev/panel/tod/todLookEditor.ts — Time-of-day stop editor: terrain palettes, bloom / god-ray / haze looks, clouds, water, grass, shadow floors
import { Color } from 'three';
import { VISUAL } from '../../../config/visualTuning';
import { devSettings } from '../../../core/settings';
import type { HazeLookStop } from '../../../rendering/atmosphere';
import {
  getValleyFogParams,
  resetValleyFogParams,
  setValleyFogLookStop,
} from '../../../rendering/atmosphere';
import {
  getActiveCloudPalette,
  getActiveTerrainShadeSunKeep,
  readBloomSceneWeightStop,
  readShadowFloorStop,
  resetBloomSceneWeightDevOverride,
  resetCloudPaletteDevOverride,
  resetShadowFloorDevOverrides,
  setBloomSceneWeightStop,
  setCloudPaletteStopColor,
  setShadowFloorStop,
  setTerrainShadeSunKeepStop,
  type TodShadowReceiverProfile,
} from '../../../rendering/tod/todDevOverrides';
import {
  TERRAIN_ATLAS_BIOME_KEYS,
  TERRAIN_BIOME_LABELS,
} from '../../../world/terrain/config/terrainBiomeTuning';
import {
  bindColor,
  bindRange,
  injectRangeRows,
  type RangeSpec,
  rangeRowHtml,
  subsectionHtml,
  syncColor,
  syncSlider,
} from '../../bindRange';
import type { TodEditor, TodEditorEnv } from './todEditor';

const HAZE_LOOK_FIELDS: Array<{
  key: Exclude<keyof HazeLookStop, 'tint'>;
  label: string;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
}> = [
  {
    key: 'hazeDensity',
    label: 'Valley extinction (1/m)',
    min: 0,
    max: 0.02,
    step: 0.0001,
    format: (v) => v.toFixed(4),
  },
  {
    key: 'aerialStartM',
    label: 'Aerial start (m)',
    min: 20,
    max: 400,
    step: 5,
    format: (v) => v.toFixed(0),
  },
  {
    key: 'aerialEndM',
    label: 'Aerial end (m)',
    min: 100,
    max: 1200,
    step: 10,
    format: (v) => v.toFixed(0),
  },
  {
    key: 'aerialStrength',
    label: 'Aerial strength',
    min: 0,
    max: 1,
    step: 0.05,
    format: (v) => v.toFixed(2),
  },
  {
    key: 'aerialNightMul',
    label: 'Night aerial (× day)',
    min: 0,
    max: 1,
    step: 0.01,
    format: (v) => v.toFixed(2),
  },
  {
    key: 'skyHorizonStart',
    label: 'Sky horizon start',
    min: 0,
    max: 0.5,
    step: 0.01,
    format: (v) => v.toFixed(2),
  },
  {
    key: 'skyHorizonEnd',
    label: 'Sky horizon end',
    min: 0.05,
    max: 0.8,
    step: 0.01,
    format: (v) => v.toFixed(2),
  },
  {
    key: 'skyHorizonStrength',
    label: 'Sky horizon strength',
    min: 0,
    max: 1,
    step: 0.01,
    format: (v) => v.toFixed(2),
  },
];

const SHADOW_PROFILES: Array<{ id: TodShadowReceiverProfile; label: string }> = [
  { id: 'terrain', label: 'Terrain floor' },
  { id: 'grass', label: 'Grass floor' },
  { id: 'props', label: 'Props floor' },
  { id: 'water', label: 'Water floor' },
];

const PALETTE_CHANNELS = ['sun', 'ground', 'shadow'] as const;
const CLOUD_CHANNELS = ['sun', 'ambient', 'tint'] as const;

/** Per-stop water colours: id suffix, label, field of the water stop. */
const WATER_COLORS = [
  ['color', 'Water color', 'waterColor'],
  ['sun', 'Sun color', 'sunColor'],
  ['shallow', 'Shallow color', 'shallowColor'],
] as const;

/** Per-stop grass colours: id suffix, label, field of the grass colour stop. */
const GRASS_COLORS = [
  ['base-dark', 'Dark base', 'baseColorDark'],
  ['base', 'Base', 'baseColor'],
  ['tip', 'Tip', 'tipColor'],
  ['rust', 'Rust', 'rustColor'],
  ['warm', 'Warm', 'warmColor'],
  ['shadow-tint', 'Shadow tint', 'shadowTint'],
] as const;

function hexFromInt(n: number): string {
  return `#${new Color(n).getHexString()}`;
}

function intFromHex(hex: string): number {
  return new Color(hex).getHex();
}

const HAZE_LOOK_SPECS = HAZE_LOOK_FIELDS.map((f) => ({
  key: f.key,
  spec: {
    id: `dev-tod-haze-${f.key}`,
    label: f.label,
    min: f.min,
    max: f.max,
    step: f.step,
    defaultValue: VISUAL.atmosphere.haze.stops.goldenHour[f.key],
    format: f.format,
  } satisfies RangeSpec,
}));

const bloomSpec: RangeSpec = {
  id: 'dev-tod-bloom-weight',
  label: 'Scene weight',
  min: 0,
  max: 2,
  step: 0.01,
  defaultValue: VISUAL.bloom.sceneWeight.goldenHour,
  format: (v) => v.toFixed(2),
};

const godraySpec: RangeSpec = {
  id: 'dev-tod-godray-weight',
  label: 'Weight',
  min: 0,
  max: 2,
  step: 0.01,
  defaultValue: VISUAL.godrays.weight.goldenHour,
  format: (v) => v.toFixed(2),
};

const waterDistortionSpec: RangeSpec = {
  id: 'dev-tod-water-distortion',
  label: 'Distortion',
  min: 0,
  max: 8,
  step: 0.1,
  defaultValue: VISUAL.water.stops.goldenHour.distortion,
  format: (v) => v.toFixed(1),
};

const shadeSunKeepSpec: RangeSpec = {
  id: 'dev-tod-shade-sun-keep',
  label: 'Terrain shade sun keep',
  min: 0,
  max: 1,
  step: 0.01,
  defaultValue: VISUAL.shadows.receivers.terrain.shadeSunKeep.goldenHour,
  format: (v) => v.toFixed(2),
};

const SHADOW_SPECS = SHADOW_PROFILES.map((p) => ({
  id: p.id,
  spec: {
    id: `dev-tod-shadow-${p.id}`,
    label: p.label,
    min: 0,
    max: 1,
    step: 0.01,
    defaultValue: VISUAL.shadows.receivers[p.id].shadowFloor.goldenHour,
    format: (v: number) => v.toFixed(2),
  } satisfies RangeSpec,
}));

const colorRow = (id: string, label: string) =>
  `<label class="dev-row"><span>${label}</span><input type="color" id="${id}" /></label>`;

/** The markup of the terrain, bloom, god-ray, haze, cloud, water, grass and shadow-floor subsections. */
export function todLookHtml(): string {
  return [
    subsectionHtml(
      'Terrain palettes',
      `<div id="dev-tod-terrain-rows">
          <div class="dev-palette-legend"><span></span><span>Sun</span><span>Ground</span><span>Shadow</span></div>
        </div>`,
    ),
    subsectionHtml('Bloom weight', '<div id="dev-tod-bloom-rows"></div>'),
    subsectionHtml(
      'God rays',
      `${colorRow('dev-tod-godray-tint', 'Tint')}
        <div id="dev-tod-godray-weight-rows"></div>`,
    ),
    subsectionHtml(
      'Haze look',
      `<p class="dev-hint">Per-stop look. Slab geometry + night-master cycle stay under Distance haze.</p>
        ${colorRow('dev-tod-haze-tint', 'Tint')}
        <div id="dev-tod-haze-scalar-rows"></div>`,
    ),
    subsectionHtml(
      'Clouds palette',
      `<div class="dev-palette-legend"><span></span><span>Sun</span><span>Ambient</span><span>Tint</span></div>
        <div class="dev-palette-tod" id="dev-tod-cloud-colors"></div>`,
    ),
    subsectionHtml(
      'Water look',
      `${WATER_COLORS.map(([id, label]) => colorRow(`dev-tod-water-${id}`, label)).join('')}
        ${rangeRowHtml(waterDistortionSpec)}`,
    ),
    subsectionHtml(
      'Grass colors',
      `<p class="dev-hint">Blade albedo per stop (blended by todWeights). Foliage wrap tints stay under Grass.</p>
        ${GRASS_COLORS.map(([id, label]) => colorRow(`dev-tod-grass-${id}`, label)).join('')}`,
    ),
    subsectionHtml('Shadow floors', '<div id="dev-tod-shadow-rows"></div>'),
  ].join('');
}

export function createTodLookEditor(env: TodEditorEnv): TodEditor {
  const { panel, body, ctx, stop } = env;
  const waterStop = () => devSettings.water.stops[stop()];
  const grassColorStop = () => devSettings.grass.colorStops[stop()];

  injectRangeRows(
    body.querySelector('#dev-tod-haze-scalar-rows')!,
    HAZE_LOOK_SPECS.map((h) => h.spec),
  );
  injectRangeRows(body.querySelector('#dev-tod-bloom-rows')!, [bloomSpec]);
  injectRangeRows(body.querySelector('#dev-tod-godray-weight-rows')!, [godraySpec]);
  injectRangeRows(body.querySelector('#dev-tod-shadow-rows')!, [
    ...SHADOW_SPECS.map((s) => s.spec),
    shadeSunKeepSpec,
  ]);

  const terrainHost = body.querySelector('#dev-tod-terrain-rows')!;
  const globalRow = document.createElement('div');
  globalRow.className = 'dev-palette-tod';
  globalRow.innerHTML = `<span>Global</span>${PALETTE_CHANNELS.map(
    (ch) => `<input type="color" id="dev-tod-terrain-global-${ch}" title="${ch}" />`,
  ).join('')}`;
  terrainHost.appendChild(globalRow);
  for (const biome of TERRAIN_ATLAS_BIOME_KEYS) {
    const row = document.createElement('div');
    row.className = 'dev-palette-tod';
    row.innerHTML = `<span>${TERRAIN_BIOME_LABELS[biome]}</span>${PALETTE_CHANNELS.map(
      (ch) => `<input type="color" id="dev-tod-terrain-${biome}-${ch}" title="${ch}" />`,
    ).join('')}`;
    terrainHost.appendChild(row);
  }

  body.querySelector('#dev-tod-cloud-colors')!.innerHTML = CLOUD_CHANNELS.map(
    (ch) => `<input type="color" id="dev-tod-cloud-${ch}" title="${ch}" />`,
  ).join('');

  const disposers: Array<() => void> = [];

  for (const ch of PALETTE_CHANNELS) {
    disposers.push(
      bindColor(panel, `dev-tod-terrain-global-${ch}`, (hex) => {
        devSettings.terrain.stylize.global[stop()][ch] = hex;
        devSettings.terrain.dirty = true;
      }),
    );
  }
  for (const biome of TERRAIN_ATLAS_BIOME_KEYS) {
    for (const ch of PALETTE_CHANNELS) {
      disposers.push(
        bindColor(panel, `dev-tod-terrain-${biome}-${ch}`, (hex) => {
          devSettings.terrain.stylize.biomes[biome][stop()][ch] = hex;
          devSettings.terrain.dirty = true;
        }),
      );
    }
  }

  disposers.push(
    bindRange(panel, bloomSpec.id, `${bloomSpec.id}-out`, bloomSpec.format, (v) => {
      setBloomSceneWeightStop(stop(), v);
    }),
  );
  if (ctx) {
    disposers.push(
      bindColor(panel, 'dev-tod-godray-tint', (hex) => {
        const cur = ctx.postFX.getGodraysParams().tint;
        ctx.postFX.setGodraysParams({ tint: { ...cur, [stop()]: hex } });
      }),
      bindRange(panel, godraySpec.id, `${godraySpec.id}-out`, godraySpec.format, (v) => {
        const cur = ctx.postFX.getGodraysParams().weight;
        ctx.postFX.setGodraysParams({ weight: { ...cur, [stop()]: v } });
      }),
    );
  }

  disposers.push(
    bindColor(panel, 'dev-tod-haze-tint', (hex) => {
      setValleyFogLookStop(stop(), { tint: hex });
    }),
  );
  for (const { key, spec } of HAZE_LOOK_SPECS) {
    disposers.push(
      bindRange(panel, spec.id, `${spec.id}-out`, spec.format, (v) => {
        setValleyFogLookStop(stop(), { [key]: v });
      }),
    );
  }

  for (const ch of CLOUD_CHANNELS) {
    disposers.push(
      bindColor(panel, `dev-tod-cloud-${ch}`, (hex) => {
        setCloudPaletteStopColor(stop(), ch, intFromHex(hex));
      }),
    );
  }

  for (const [id, , field] of WATER_COLORS) {
    disposers.push(
      bindColor(panel, `dev-tod-water-${id}`, (hex) => {
        waterStop()[field] = hex;
      }),
    );
  }
  disposers.push(
    bindRange(
      panel,
      waterDistortionSpec.id,
      `${waterDistortionSpec.id}-out`,
      waterDistortionSpec.format,
      (v) => {
        waterStop().distortion = v;
      },
    ),
  );
  for (const [id, , field] of GRASS_COLORS) {
    disposers.push(
      bindColor(panel, `dev-tod-grass-${id}`, (hex) => {
        grassColorStop()[field] = hex;
      }),
    );
  }

  disposers.push(
    bindRange(
      panel,
      shadeSunKeepSpec.id,
      `${shadeSunKeepSpec.id}-out`,
      shadeSunKeepSpec.format,
      (v) => {
        setTerrainShadeSunKeepStop(stop(), v);
      },
    ),
  );
  for (const { id, spec } of SHADOW_SPECS) {
    disposers.push(
      bindRange(panel, spec.id, `${spec.id}-out`, spec.format, (v) => {
        setShadowFloorStop(id, stop(), v);
      }),
    );
  }

  return {
    sync: () => {
      const selected = stop();
      syncSlider(
        panel,
        bloomSpec.id,
        `${bloomSpec.id}-out`,
        readBloomSceneWeightStop(selected),
        bloomSpec.format,
      );
      if (ctx) {
        const gp = ctx.postFX.getGodraysParams();
        syncColor(panel, 'dev-tod-godray-tint', gp.tint[selected]);
        syncSlider(
          panel,
          godraySpec.id,
          `${godraySpec.id}-out`,
          gp.weight[selected],
          godraySpec.format,
        );
      }
      const haze = getValleyFogParams().stops[selected];
      syncColor(panel, 'dev-tod-haze-tint', haze.tint);
      for (const { key, spec } of HAZE_LOOK_SPECS) {
        syncSlider(panel, spec.id, `${spec.id}-out`, haze[key], spec.format);
      }

      const globalPal = devSettings.terrain.stylize.global[selected];
      for (const ch of PALETTE_CHANNELS) {
        syncColor(panel, `dev-tod-terrain-global-${ch}`, globalPal[ch]);
      }
      for (const biome of TERRAIN_ATLAS_BIOME_KEYS) {
        const pal = devSettings.terrain.stylize.biomes[biome][selected];
        for (const ch of PALETTE_CHANNELS) {
          syncColor(panel, `dev-tod-terrain-${biome}-${ch}`, pal[ch]);
        }
      }

      const cloud = getActiveCloudPalette()[selected];
      for (const ch of CLOUD_CHANNELS) {
        syncColor(panel, `dev-tod-cloud-${ch}`, hexFromInt(cloud[ch]));
      }

      const ws = waterStop();
      for (const [id, , field] of WATER_COLORS) {
        syncColor(panel, `dev-tod-water-${id}`, ws[field]);
      }
      syncSlider(
        panel,
        waterDistortionSpec.id,
        `${waterDistortionSpec.id}-out`,
        ws.distortion,
        waterDistortionSpec.format,
      );

      const gs = grassColorStop();
      for (const [id, , field] of GRASS_COLORS) {
        syncColor(panel, `dev-tod-grass-${id}`, gs[field]);
      }
      syncSlider(
        panel,
        shadeSunKeepSpec.id,
        `${shadeSunKeepSpec.id}-out`,
        getActiveTerrainShadeSunKeep()[selected],
        shadeSunKeepSpec.format,
      );
      for (const { id, spec } of SHADOW_SPECS) {
        syncSlider(
          panel,
          spec.id,
          `${spec.id}-out`,
          readShadowFloorStop(id, selected),
          spec.format,
        );
      }
    },
    reset: () => {
      resetBloomSceneWeightDevOverride();
      resetShadowFloorDevOverrides();
      resetCloudPaletteDevOverride();
      resetValleyFogParams();
      devSettings.grass.colorStops = structuredClone(VISUAL.grass.colorStops);
      ctx?.postFX.resetGodraysParams();
    },
    dispose: () => {
      for (const fn of disposers) fn();
    },
  };
}
