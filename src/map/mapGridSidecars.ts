// src/map/mapGridSidecars.ts — binary height/biome filenames next to map JSON
import { isValidMapId, normalizeMapId } from './MapTypes.ts';

export const MAP_GRID_KINDS = ['height', 'biome', 'heightBase', 'terrainAux'] as const;
export type MapGridKind = (typeof MAP_GRID_KINDS)[number];

export type MapGridEncoding = 'f32le' | 'u8' | 'rgba8';

const KIND_ENCODING: Record<MapGridKind, MapGridEncoding> = {
  height: 'f32le',
  heightBase: 'f32le',
  biome: 'u8',
  terrainAux: 'rgba8',
};

const KIND_EXT: Record<MapGridKind, string> = {
  height: 'height.f32',
  heightBase: 'heightBase.f32',
  biome: 'biome.u8',
  terrainAux: 'terrainAux.rgba8',
};

export function mapGridEncoding(kind: MapGridKind): MapGridEncoding {
  return KIND_ENCODING[kind];
}

export function mapGridSidecarFile(id: string, kind: MapGridKind): string {
  return `${normalizeMapId(id)}.${KIND_EXT[kind]}`;
}

/** JSON + grid sidecars for a map id (all under `public/maps/`). */
export function mapProjectFiles(id: string): string[] {
  const normalized = normalizeMapId(id);
  return [
    `${normalized}.json`,
    ...MAP_GRID_KINDS.map((kind) => mapGridSidecarFile(normalized, kind)),
  ];
}

export function isMapGridKind(value: string): value is MapGridKind {
  return (MAP_GRID_KINDS as readonly string[]).includes(value);
}

/** True when `file` is a path-safe sidecar for this map id + kind. */
export function isValidMapGridSidecar(id: string, kind: MapGridKind, file: unknown): boolean {
  if (typeof file !== 'string') return false;
  if (file.includes('/') || file.includes('\\') || file.includes('..')) return false;
  const expected = mapGridSidecarFile(id, kind);
  return file === expected && isValidMapId(normalizeMapId(id));
}

export function bytesPerGridCell(kind: MapGridKind): number {
  const encoding = KIND_ENCODING[kind];
  if (encoding === 'u8') return 1;
  if (encoding === 'rgba8') return 4;
  return 4;
}

export function expectedGridByteLength(kind: MapGridKind, cellCount: number): number {
  return cellCount * bytesPerGridCell(kind);
}
