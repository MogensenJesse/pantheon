// src/world/map/mapLandmarkLayout.ts — landmark XZ layout for proximity + clearance

import type { MapEntity, MapFile } from '../../map/MapTypes';

import { WORLD } from '../WorldConfig';



export interface MapLandmarkLayout {

  stones: Array<{ id: number; x: number; z: number }>;

  ancientOak: { x: number; z: number };

  sacredSpring: { x: number; z: number };

  drownedTemple: { x: number; z: number };

  highCairn: { x: number; z: number };

}



export function buildProceduralLandmarkLayout(): MapLandmarkLayout {

  return {

    stones: WORLD.LANDMARKS.stones.map((s) => ({ id: s.id, x: s.xz[0], z: s.xz[1] })),

    ancientOak: { x: WORLD.LANDMARKS.ancientOak.xz[0], z: WORLD.LANDMARKS.ancientOak.xz[1] },

    sacredSpring: { x: WORLD.LANDMARKS.sacredSpring.xz[0], z: WORLD.LANDMARKS.sacredSpring.xz[1] },

    drownedTemple: { x: WORLD.LANDMARKS.drownedTemple.xz[0], z: WORLD.LANDMARKS.drownedTemple.xz[1] },

    highCairn: { x: WORLD.LANDMARKS.highCairn.xz[0], z: WORLD.LANDMARKS.highCairn.xz[1] },

  };

}



export function buildMapLandmarkLayout(entities: MapEntity[]): MapLandmarkLayout {

  const layout = buildProceduralLandmarkLayout();



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



export function buildLandmarkLayoutFromMap(map: MapFile | undefined): MapLandmarkLayout {

  if (map?.entities?.length) return buildMapLandmarkLayout(map.entities);

  return buildProceduralLandmarkLayout();

}


