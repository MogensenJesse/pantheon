// src/ui/dev/devPanelTerrain.ts
import { PHASE0 } from '../../config/phase0';
import { devSettings, type TerrainDevSettings } from '../../core/GameState';
import { WORLD } from '../../world/WorldConfig';
import { resetTerrainDevSettings } from '../../world/terrain/applyTerrainDevUniforms';
import type { TerrainSplatMaterial } from '../../world/terrain/TerrainSplatMaterial';
import {
  bindCheckbox,
  bindRange,
  injectRangeRows,
  mountSection,
  syncSpecs,
  type RangeSpec,
} from './bindRange';

interface TerrainSpec extends RangeSpec {
  key: keyof Pick<
    TerrainDevSettings,
    | 'textureRepeat'
    | 'displacementScale'
    | 'normalStrength'
    | 'aoStrength'
    | 'specularStrength'
    | 'slopeRockStart'
    | 'pathBlendSoft'
  >;
}

const TERRAIN_SPECS: TerrainSpec[] = [
  {
    id: 'dev-tex-repeat',
    label: 'Tile repeat',
    min: 0.02,
    max: 0.2,
    step: 0.005,
    defaultValue: PHASE0.TERRAIN_TEXTURE_REPEAT,
    format: (v) => v.toFixed(3),
    key: 'textureRepeat',
  },
  {
    id: 'dev-tex-disp',
    label: 'Disp. scale',
    min: 0,
    max: 2,
    step: 0.05,
    defaultValue: PHASE0.TERRAIN_DISPLACEMENT_SCALE,
    format: (v) => v.toFixed(2),
    key: 'displacementScale',
  },
  {
    id: 'dev-tex-normal',
    label: 'Normals',
    min: 0,
    max: 2,
    step: 0.05,
    defaultValue: PHASE0.TERRAIN_NORMAL_STRENGTH,
    format: (v) => v.toFixed(2),
    key: 'normalStrength',
  },
  {
    id: 'dev-tex-ao',
    label: 'AO',
    min: 0,
    max: 1,
    step: 0.05,
    defaultValue: PHASE0.TERRAIN_AO_STRENGTH,
    format: (v) => v.toFixed(2),
    key: 'aoStrength',
  },
  {
    id: 'dev-tex-spec',
    label: 'Specular',
    min: 0,
    max: 1,
    step: 0.05,
    defaultValue: PHASE0.TERRAIN_SPECULAR_STRENGTH,
    format: (v) => v.toFixed(2),
    key: 'specularStrength',
  },
  {
    id: 'dev-tex-slope',
    label: 'Rock slope',
    min: 0.4,
    max: 1,
    step: 0.05,
    defaultValue: PHASE0.TERRAIN_SLOPE_ROCK_START,
    format: (v) => v.toFixed(2),
    key: 'slopeRockStart',
  },
  {
    id: 'dev-tex-path-blend',
    label: 'Path blend',
    min: 0.3,
    max: 4,
    step: 0.1,
    defaultValue: WORLD.JOURNEY.PATH_SURFACE.BLEND_SOFT,
    format: (v) => v.toFixed(1),
    key: 'pathBlendSoft',
  },
];

export function initDevPanelTerrain(
  panel: HTMLDivElement,
  _terrainMaterial: TerrainSplatMaterial,
): () => void {
  void _terrainMaterial;
  const body = mountSection(panel, {
    hostId: 'dev-section-terrain',
    title: 'Terrain textures',
    open: false,
    body: `
      <div id="dev-terrain-repeat-row"></div>
      <label class="dev-row dev-row-check">
        <span>Displacement</span>
        <input type="checkbox" id="dev-tex-disp-on" checked />
      </label>
      <div id="dev-terrain-rows"></div>
      <div class="dev-actions">
        <button type="button" id="dev-tex-reset">Reset terrain</button>
      </div>
    `,
  });
  if (!body) return () => {};

  // Repeat row comes first (above displacement toggle), then the rest below it.
  const repeatHost = panel.querySelector('#dev-terrain-repeat-row');
  const restHost = panel.querySelector('#dev-terrain-rows');
  if (repeatHost) injectRangeRows(repeatHost, [TERRAIN_SPECS[0]]);
  if (restHost) injectRangeRows(restHost, TERRAIN_SPECS.slice(1));

  const t = devSettings.terrain;
  const markDirty = () => {
    t.dirty = true;
  };

  const readTerrain = (s: TerrainSpec): number => t[s.key];
  const syncTerrainUi = () => syncSpecs(panel, TERRAIN_SPECS, (s) => readTerrain(s as TerrainSpec));

  syncTerrainUi();

  const disposers: Array<() => void> = [];
  for (const spec of TERRAIN_SPECS) {
    disposers.push(
      bindRange(panel, spec.id, `${spec.id}-out`, spec.format, (v) => {
        (t[spec.key] as number) = v;
        markDirty();
      }),
    );
  }

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

  const resetBtn = panel.querySelector('#dev-tex-reset') as HTMLButtonElement | null;
  const onReset = () => {
    resetTerrainDevSettings();
    markDirty();
    syncTerrainUi();
    const dispOn = panel.querySelector('#dev-tex-disp-on') as HTMLInputElement | null;
    if (dispOn) dispOn.checked = t.displacementEnabled;
  };
  resetBtn?.addEventListener('click', onReset);

  return () => {
    for (const fn of disposers) fn();
    resetBtn?.removeEventListener('click', onReset);
  };
}
