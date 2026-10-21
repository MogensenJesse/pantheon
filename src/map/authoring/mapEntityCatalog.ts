// src/map/authoring/mapEntityCatalog.ts — valid prop keys and editor palette metadata
import {
  ASSET_MANIFEST,
  allPropAssetEntries,
  type NaturePropAssetEntry,
} from '../../assets/assetManifest.ts';
import { PHASE0 } from '../../config/phase0.ts';
import { VILLAGE } from '../../config/village.ts';
import { isLandmarkKind, LANDMARK_KINDS, type LandmarkKind, type MapEntity } from '../MapTypes.ts';

export const MAP_PROP_KEYS = new Set<string>(allPropAssetEntries().map((e) => e.key));

export type EditorPaletteGroup = 'trees' | 'rocks' | 'structures' | 'markers';

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

/** Palette id of a landmark kind (`landmark:runestones`); there is one palette entry per kind. */
export function landmarkPlaceId(kind: LandmarkKind): string {
  return `landmark:${kind}`;
}

/** The landmark kind of a palette id, or null for any other entry. */
export function landmarkKindOfPlaceId(placeId: string): LandmarkKind | null {
  if (!placeId.startsWith('landmark:')) return null;
  const kind = placeId.slice('landmark:'.length);
  return isLandmarkKind(kind) ? kind : null;
}

const LANDMARK_LABELS: Record<LandmarkKind, string> = {
  runestones: 'Runestones',
  tree: 'Tree',
  temple_ruin: 'Temple ruin',
  sunken_ruin: 'Sunken temple ruin',
  monolith: 'Monolith',
};

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
      entityFactory: (x, z) => ({
        type: 'playerStart',
        x,
        z,
        rotY: PHASE0.CAMERA.INITIAL_YAW,
      }),
    },
    {
      group: 'markers',
      label: 'Village seed',
      placeId: 'villageSeed',
      entityFactory: (x, z) => ({
        type: 'villageSeed',
        x,
        z,
        rotY: 0,
        seed: VILLAGE.SEED.DEFAULT,
        radiusM: VILLAGE.SEED.DEFAULT_RADIUS_M,
      }),
    },
    {
      group: 'markers',
      label: 'Shrine',
      placeId: 'shrine',
      entityFactory: (x, z) => ({ type: 'shrine', x, z }),
    },
    ...LANDMARK_KINDS.map(
      (kind): EditorPaletteEntry => ({
        group: 'markers',
        label: `Landmark: ${LANDMARK_LABELS[kind]}`,
        placeId: landmarkPlaceId(kind),
        entityFactory: (x, z) => ({ type: 'landmark', x, z, rotY: 0, kind }),
      }),
    ),
  ];
}

export const EDITOR_PALETTE: readonly EditorPaletteEntry[] = [
  ...propPaletteEntries('trees', ASSET_MANIFEST.trees),
  ...propPaletteEntries('rocks', ASSET_MANIFEST.rocks),
  ...propPaletteEntries('structures', ASSET_MANIFEST.structures),
  ...markerEntries(),
];

export function getPaletteEntry(placeId: string): EditorPaletteEntry | undefined {
  return EDITOR_PALETTE.find((e) => e.placeId === placeId);
}

/** GLTF registry key for thumbnail render; null = use CSS marker swatch. */
export function resolveThumbnailAssetKey(placeId: string): string | null {
  if (
    placeId === 'orb' ||
    placeId === 'playerStart' ||
    placeId === 'villageSeed' ||
    placeId === 'shrine' ||
    landmarkKindOfPlaceId(placeId)
  ) {
    return null;
  }
  if (MAP_PROP_KEYS.has(placeId)) return placeId;
  return null;
}

export type MarkerThumbClass = 'playerStart' | 'orb' | 'villageSeed' | 'shrine' | 'landmark';

export function markerThumbClass(placeId: string): MarkerThumbClass | null {
  if (placeId === 'playerStart') return 'playerStart';
  if (placeId === 'orb') return 'orb';
  if (placeId === 'villageSeed') return 'villageSeed';
  if (placeId === 'shrine') return 'shrine';
  if (landmarkKindOfPlaceId(placeId)) return 'landmark';
  return null;
}

export function entriesByGroup(group: EditorPaletteGroup): EditorPaletteEntry[] {
  return EDITOR_PALETTE.filter((e) => e.group === group);
}

/** Upper bound for an authored shrine's `regenPerSec` (energy per second). */
const MAX_SHRINE_REGEN_PER_SEC = 5;

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
      return finite(e.x) && finite(e.z) && (e.rotY === undefined || finite(e.rotY));
    case 'orb':
      return finite(e.x) && finite(e.z) && (e.energy === undefined || finite(e.energy));
    case 'villageSeed':
      return (
        finite(e.x) &&
        finite(e.z) &&
        (e.rotY === undefined || finite(e.rotY)) &&
        (e.seed === undefined || finite(e.seed)) &&
        (e.radiusM === undefined ||
          (finite(e.radiusM) &&
            e.radiusM >= VILLAGE.SEED.MIN_RADIUS_M &&
            e.radiusM <= VILLAGE.SEED.MAX_RADIUS_M))
      );
    case 'shrine':
      return (
        finite(e.x) &&
        finite(e.z) &&
        (e.radiusM === undefined ||
          (finite(e.radiusM) &&
            e.radiusM >= PHASE0.SHRINE.MIN_RADIUS_M &&
            e.radiusM <= PHASE0.SHRINE.MAX_RADIUS_M)) &&
        (e.regenPerSec === undefined ||
          (finite(e.regenPerSec) &&
            e.regenPerSec >= 0 &&
            e.regenPerSec <= MAX_SHRINE_REGEN_PER_SEC))
      );
    case 'landmark':
      return (
        finite(e.x) &&
        finite(e.z) &&
        (e.rotY === undefined || finite(e.rotY)) &&
        isLandmarkKind(e.kind)
      );
    default:
      return false;
  }
}
