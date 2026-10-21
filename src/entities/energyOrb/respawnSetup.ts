// src/entities/energyOrb/respawnSetup.ts — where picked-up orbs may come back: open, gently sloping land

import { PHASE0 } from '../../config/phase0';
import { WORLD } from '../../config/world';
import type { ShrineEntity } from '../../map/MapTypes';
import type { MapTerrainContext } from '../../world/MapTerrainBuilder';
import { sampleOrbTerrainFooting } from '../orbTerrainFooting';
import type { OrbSystemContext } from './orbSystem';

/** Tells the orb system when and where orbs respawn: once the tree has opened, off the water, away from the village. */
export function configureOrbRespawn(o: {
  orbSystem: OrbSystemContext;
  terrain: MapTerrainContext;
  shrines: readonly ShrineEntity[];
  waterLevelM: number;
  villageSeed: { x: number; z: number; radiusM: number } | null;
  /** Orbs return only while this is true (the skill tree is open). */
  enabled: () => boolean;
}): void {
  const place = PHASE0.RESPAWN_PLACE;
  const half = WORLD.SIZE * PHASE0.PLAYER.WORLD_CLAMP_MARGIN * place.EDGE_SHARE;
  o.orbSystem.configureRespawn({
    enabled: o.enabled,
    shrines: o.shrines.map((s) => ({ x: s.x, z: s.z })),
    bounds: { minX: -half, maxX: half, minZ: -half, maxZ: half },
    // Open, gently sloping land above the water; the village keeps its own ground clear.
    isWalkable: (x, z) => {
      const footing = sampleOrbTerrainFooting(o.terrain, x, z, PHASE0.ORB.ENERGY_RADIUS);
      return (
        footing.surfaceY > o.waterLevelM + place.WATER_CLEARANCE_M &&
        footing.normalY >= place.MIN_NORMAL_Y
      );
    },
    avoid: o.villageSeed
      ? [
          {
            x: o.villageSeed.x,
            z: o.villageSeed.z,
            radiusM: o.villageSeed.radiusM + place.VILLAGE_CLEARANCE_M,
          },
        ]
      : [],
  });
}
