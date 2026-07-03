// src/map/mapEntityCatalog.ts — valid prop keys and editor palette metadata
import {
  ASSET_MANIFEST,
  allPropAssetEntries,
  type NaturePropAssetEntry,
} from '../assets/assetManifest';
import type { MapEntity } from './MapTypes';

export const MAP_PROP_KEYS = new Set<string>(allPropAssetEntries().map((e) => e.key));

export type EditorPaletteGroup =
  | 'trees'
  | 'dead_trees'
  | 'rocks'
  | 'rock_paths'
  | 'plants'
  | 'flowers'
  | 'mushrooms'
  | 'pebbles'
  | 'markers';

interface EditorPaletteEntry {
  group: EditorPaletteGroup;
  label: string;
  /** Prop key or marker token for place tool. */
  placeId: string;
  entityFactory: (x: number, z: number) => MapEntity;
}

const propFactory =
  (key: string, defaultScale = 1): EditorPaletteEntry['entityFactory'] =>
  (x, z) => ({
    type: 'prop',
    key,
    x,
    z,
    rotY: 0,
    scale: defaultScale,
  });

function propPaletteEntries(
  group: Exclude<EditorPaletteGroup, 'markers'>,
  entries: readonly NaturePropAssetEntry[],
  defaultScale = 1,
): EditorPaletteEntry[] {
  return entries.map((entry) => ({
    group,
    label: entry.key,
    placeId: entry.key,
    entityFactory: propFactory(entry.key, defaultScale),
  }));
}

function markerEntries(): EditorPaletteEntry[] {
  return [
    {
      group: 'markers',
      label: 'Energy orb',
      placeId: 'orb',
      entityFactory: (x, z) => ({ type: 'orb', x, z }),
    },
    {
      group: 'markers',
      label: 'Player start',
      placeId: 'playerStart',
      entityFactory: (x, z) => ({ type: 'playerStart', x, z }),
    },
  ];
}

export const EDITOR_PALETTE: readonly EditorPaletteEntry[] = [
  ...propPaletteEntries('trees', ASSET_MANIFEST.trees),
  ...propPaletteEntries('dead_trees', ASSET_MANIFEST.dead_trees),
  ...propPaletteEntries('rocks', ASSET_MANIFEST.rocks),
  ...propPaletteEntries('rock_paths', ASSET_MANIFEST.rock_paths),
  ...propPaletteEntries('plants', ASSET_MANIFEST.plants, 0.9),
  ...propPaletteEntries('flowers', ASSET_MANIFEST.flowers, 0.85),
  ...propPaletteEntries('mushrooms', ASSET_MANIFEST.mushrooms, 0.9),
  ...propPaletteEntries('pebbles', ASSET_MANIFEST.pebbles, 0.6),
  ...markerEntries(),
];

export function getPaletteEntry(placeId: string): EditorPaletteEntry | undefined {
  return EDITOR_PALETTE.find((e) => e.placeId === placeId);
}

/** GLTF registry key for thumbnail render; null = use CSS marker swatch. */
export function resolveThumbnailAssetKey(placeId: string): string | null {
  if (placeId === 'orb' || placeId === 'playerStart') return null;
  if (MAP_PROP_KEYS.has(placeId)) return placeId;
  return null;
}

export type MarkerThumbClass = 'playerStart' | 'orb';

export function markerThumbClass(placeId: string): MarkerThumbClass | null {
  if (placeId === 'playerStart') return 'playerStart';
  if (placeId === 'orb') return 'orb';
  return null;
}

export function entriesByGroup(group: EditorPaletteGroup): EditorPaletteEntry[] {
  return EDITOR_PALETTE.filter((e) => e.group === group);
}

function isValidPropKey(key: string): boolean {
  return MAP_PROP_KEYS.has(key);
}

export function isValidMapEntity(entity: unknown): entity is MapEntity {
  if (!entity || typeof entity !== 'object') return false;
  const e = entity as MapEntity;
  if (typeof e.type !== 'string') return false;

  const finite = (n: unknown) => typeof n === 'number' && Number.isFinite(n);

  switch (e.type) {
    case 'prop':
      return (
        isValidPropKey(e.key) &&
        finite(e.x) &&
        finite(e.z) &&
        finite(e.rotY) &&
        finite(e.scale) &&
        (e.surfaceLift === undefined || finite(e.surfaceLift))
      );
    case 'playerStart':
      return finite(e.x) && finite(e.z);
    case 'orb':
      return finite(e.x) && finite(e.z) && (e.energy === undefined || finite(e.energy));
    default:
      return false;
  }
}
