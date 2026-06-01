// src/world/map/mapLandmarkLayout.ts — landmark XZ layout for proximity + clearance

import type { MapEntity, MapFile } from '../../map/MapTypes';

export interface MapLandmarkLayout {
  stones: Array<{ id: number; x: number; z: number }>;
  ancientOak: { x: number; z: number };
  sacredSpring: { x: number; z: number };
  drownedTemple: { x: number; z: number };
  highCairn: { x: number; z: number };
}

const FAR = 1e6;

export const EMPTY_LANDMARK_LAYOUT: MapLandmarkLayout = {
  stones: [],
  ancientOak: { x: FAR, z: FAR },
  sacredSpring: { x: FAR, z: FAR },
  drownedTemple: { x: FAR, z: FAR },
  highCairn: { x: FAR, z: FAR },
};

export function buildMapLandmarkLayout(entities: MapEntity[]): MapLandmarkLayout {
  const layout: MapLandmarkLayout = {
    stones: [],
    ancientOak: { x: FAR, z: FAR },
    sacredSpring: { x: FAR, z: FAR },
    drownedTemple: { x: FAR, z: FAR },
    highCairn: { x: FAR, z: FAR },
  };

  for (const e of entities) {
    if (e.type === 'standingStone') {
      const existing = layout.stones.find((s) => s.id === e.stoneId);
      if (existing) {
        existing.x = e.x;
        existing.z = e.z;
      } else {
        layout.stones.push({ id: e.stoneId, x: e.x, z: e.z });
      }
    } else if (e.type === 'landmark') {
      switch (e.landmark) {
        case 'ancientOak':
          layout.ancientOak = { x: e.x, z: e.z };
          break;
        case 'sacredSpring':
          layout.sacredSpring = { x: e.x, z: e.z };
          break;
        case 'drownedTemple':
          layout.drownedTemple = { x: e.x, z: e.z };
          break;
        case 'highCairn':
          layout.highCairn = { x: e.x, z: e.z };
          break;
      }
    }
  }

  layout.stones.sort((a, b) => a.id - b.id);
  return layout;
}

export function buildLandmarkLayoutFromMap(map: MapFile): MapLandmarkLayout {
  if (!map.entities?.length) return EMPTY_LANDMARK_LAYOUT;
  return buildMapLandmarkLayout(map.entities);
}
