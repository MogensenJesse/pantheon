// src/world/landmarkClearance.ts — XZ positions for scatter/grass clearance

import type { MapFile } from '../map/MapTypes';
import { buildLandmarkLayoutFromMap } from './map/mapLandmarkLayout';
import { LANDMARK_XZ_POSITIONS } from './WorldConfig';

let activeClearance: ReadonlyArray<readonly [number, number]> = LANDMARK_XZ_POSITIONS;

export function setLandmarkClearancePositions(
  positions: ReadonlyArray<readonly [number, number]>,
): void {
  activeClearance = positions;
}

export function resetLandmarkClearancePositions(): void {
  activeClearance = LANDMARK_XZ_POSITIONS;
}

export function getActiveLandmarkClearance(): ReadonlyArray<readonly [number, number]> {
  return activeClearance;
}

export function getClearancePositions(map?: MapFile): ReadonlyArray<readonly [number, number]> {
  if (!map?.entities?.length) return LANDMARK_XZ_POSITIONS;

  const layout = buildLandmarkLayoutFromMap(map);

  const out: Array<readonly [number, number]> = [];

  for (const s of layout.stones) out.push([s.x, s.z]);

  out.push(
    [layout.ancientOak.x, layout.ancientOak.z],

    [layout.sacredSpring.x, layout.sacredSpring.z],

    [layout.drownedTemple.x, layout.drownedTemple.z],

    [layout.highCairn.x, layout.highCairn.z],
  );

  return out;
}

export function applyMapClearance(map?: MapFile): void {
  setLandmarkClearancePositions(getClearancePositions(map));
}
