// src/map/mapEntityCatalog.ts — valid prop keys and editor palette metadata
import { ASSET_MANIFEST } from '../assets/assetManifest';
import type { MapEntity, MapLandmarkKind } from './MapTypes';

export const MAP_PROP_KEYS = new Set<string>([
  ...ASSET_MANIFEST.trees.map((t) => t.key),
  ...ASSET_MANIFEST.rocks.map((r) => r.key),
  ...ASSET_MANIFEST.plants.map((p) => p.key),
  ...ASSET_MANIFEST.landmarks.mountains.map((m) => m.key),
]);

export const MAP_LANDMARK_KINDS: readonly MapLandmarkKind[] = [
  'ancientOak',
  'sacredSpring',
  'drownedTemple',
  'highCairn',
];

export type EditorPaletteGroup = 'trees' | 'rocks' | 'plants' | 'mountains' | 'markers';

export interface EditorPaletteEntry {
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

function markerEntries(): EditorPaletteEntry[] {
  const stones: EditorPaletteEntry[] = ([0, 1, 2, 3, 4] as const).map((stoneId) => ({
    group: 'markers' as const,
    label: `Stone ${stoneId}`,
    placeId: `stone:${stoneId}`,
    entityFactory: (x, z) => ({ type: 'standingStone', stoneId, x, z }),
  }));

  const landmarks: EditorPaletteEntry[] = MAP_LANDMARK_KINDS.map((landmark) => ({
    group: 'markers' as const,
    label: landmark,
    placeId: `landmark:${landmark}`,
    entityFactory: (x, z) => ({ type: 'landmark', landmark, x, z }),
  }));

  return [
    ...stones,
    ...landmarks,
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
  ...ASSET_MANIFEST.trees.map((t) => ({
    group: 'trees' as const,
    label: t.key,
    placeId: t.key,
    entityFactory: propFactory(t.key, 1),
  })),
  ...ASSET_MANIFEST.rocks.map((r) => ({
    group: 'rocks' as const,
    label: r.key,
    placeId: r.key,
    entityFactory: propFactory(r.key, 1),
  })),
  ...ASSET_MANIFEST.plants.map((p) => ({
    group: 'plants' as const,
    label: p.key,
    placeId: p.key,
    entityFactory: propFactory(p.key, 0.9),
  })),
  ...ASSET_MANIFEST.landmarks.mountains.map((m) => ({
    group: 'mountains' as const,
    label: m.key,
    placeId: `mountain:${m.key}`,
    entityFactory: (x: number, z: number): MapEntity => ({
      type: 'mountain',
      key: m.key,
      x,
      z,
      rotY: 0,
      scale: 2.5,
    }),
  })),
  ...markerEntries(),
];

export function getPaletteEntry(placeId: string): EditorPaletteEntry | undefined {
  return EDITOR_PALETTE.find((e) => e.placeId === placeId);
}

/** GLTF registry key for thumbnail render; null = use CSS marker swatch. */
export function resolveThumbnailAssetKey(placeId: string): string | null {
  if (placeId.startsWith('mountain:')) return placeId.slice('mountain:'.length);
  if (placeId.startsWith('stone:')) return `stone_${placeId.slice('stone:'.length)}`;
  if (placeId.startsWith('landmark:')) {
    const kind = placeId.slice('landmark:'.length);
    if (kind === 'ancientOak') return 'ancient_oak';
    return null;
  }
  if (placeId === 'orb' || placeId === 'playerStart') return null;
  if (MAP_PROP_KEYS.has(placeId)) return placeId;
  return null;
}

export type MarkerThumbClass = 'playerStart' | 'orb' | 'stone' | 'landmark';

export function markerThumbClass(placeId: string): MarkerThumbClass | null {
  if (placeId === 'playerStart') return 'playerStart';
  if (placeId === 'orb') return 'orb';
  if (placeId.startsWith('stone:')) return 'stone';
  if (placeId.startsWith('landmark:')) return 'landmark';
  return null;
}

export function isPropPlaceId(placeId: string): boolean {
  return markerThumbClass(placeId) === null;
}

export function entriesByGroup(group: EditorPaletteGroup): EditorPaletteEntry[] {
  return EDITOR_PALETTE.filter((e) => e.group === group);
}

export function isValidPropKey(key: string): boolean {
  return MAP_PROP_KEYS.has(key);
}

const STONE_IDS = new Set([0, 1, 2, 3, 4]);

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
    case 'standingStone':
      return STONE_IDS.has(e.stoneId) && finite(e.x) && finite(e.z);
    case 'orb':
      return finite(e.x) && finite(e.z) && (e.energy === undefined || finite(e.energy));
    case 'landmark':
      return MAP_LANDMARK_KINDS.includes(e.landmark) && finite(e.x) && finite(e.z);
    case 'mountain':
      return isValidPropKey(e.key) && finite(e.x) && finite(e.z) && finite(e.rotY) && finite(e.scale);
    default:
      return false;
  }
}

export function defaultScaleForPropKey(key: string): number {
  if (key.startsWith('mountain_')) return 2.5;
  if (key.startsWith('pine_')) return 1.1;
  if (key.startsWith('common_tree_')) return 1;
  if (key.startsWith('twisted_tree_')) return 1.05;
  return 1;
}
