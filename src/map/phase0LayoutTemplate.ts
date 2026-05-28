// src/map/phase0LayoutTemplate.ts — seed Phase 0 gameplay entities from WORLD defaults

import alea from 'alea';

import { PHASE0 } from '../config/phase0';

import { buildJourneyOrbPlacements } from '../world/JourneyPath';

import { MOUNTAIN_BORDER_PLACEMENTS, STONE_SCALES } from '../world/LandmarkSpawner';

import type { TerrainContext } from '../world/TerrainGenerator';

import { WORLD } from '../world/WorldConfig';

import type { MapEntity } from './MapTypes';



export function buildPhase0LayoutEntities(terrain: TerrainContext): MapEntity[] {

  const entities: MapEntity[] = [];



  const [px, pz] = WORLD.PLAYER_START.xz;

  entities.push({ type: 'playerStart', x: px, z: pz });



  for (const stone of WORLD.LANDMARKS.stones) {

    entities.push({

      type: 'standingStone',

      stoneId: stone.id,

      x: stone.xz[0],

      z: stone.xz[1],

      scale: STONE_SCALES[stone.id],

      rotY: (stone.id * 0.7 + 0.3) % (Math.PI * 2),

    });

  }



  const [oakX, oakZ] = WORLD.LANDMARKS.ancientOak.xz;

  entities.push({ type: 'landmark', landmark: 'ancientOak', x: oakX, z: oakZ, scale: 1.5 });



  const [springX, springZ] = WORLD.LANDMARKS.sacredSpring.xz;

  entities.push({ type: 'landmark', landmark: 'sacredSpring', x: springX, z: springZ });



  const [templeX, templeZ] = WORLD.LANDMARKS.drownedTemple.xz;

  entities.push({ type: 'landmark', landmark: 'drownedTemple', x: templeX, z: templeZ });



  const [cairnX, cairnZ] = WORLD.LANDMARKS.highCairn.xz;

  entities.push({ type: 'landmark', landmark: 'highCairn', x: cairnX, z: cairnZ });



  for (const p of MOUNTAIN_BORDER_PLACEMENTS) {

    entities.push({

      type: 'mountain',

      key: p.key,

      x: p.x,

      z: p.z,

      rotY: p.rotY,

      scale: p.scale,

    });

  }



  const rng = alea(`${WORLD.SEED}-orbs`);

  const orbPlacements = buildJourneyOrbPlacements(

    PHASE0.ORB_COUNT,

    rng,

    terrain,

    WORLD.JOURNEY.PATH_HALF_WIDTH * 0.55,

  );

  for (const { x, z } of orbPlacements) {

    const energy =

      PHASE0.ORB.ENERGY_MIN +

      Math.floor(rng() * (PHASE0.ORB.ENERGY_MAX - PHASE0.ORB.ENERGY_MIN));

    entities.push({ type: 'orb', x, z, energy });

  }



  return entities;

}


