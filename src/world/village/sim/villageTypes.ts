// src/world/village/sim/villageTypes.ts — village simulation state shapes (pure, no three)
import type { VillageBuildingType, VillageStage } from '../assets/villageAssetKeys.ts';

export interface Building {
  id: number;
  type: VillageBuildingType;
  x: number;
  z: number;
  rotY: number;
  /** Half footprint (m) in the building's local x / z. */
  halfW: number;
  halfD: number;
  /** Plinth top is the floor (y = 0 of the model); the base sinks below the lowest ground. */
  plinthTopY: number;
  plinthBaseY: number;
  stage: VillageStage;
  /** Builder-seconds of work into the current stage (0 once finished). */
  progress: number;
}

/** Footprint inside the walls (m): local x by z. */
export type FootprintOf = (type: VillageBuildingType) => readonly [number, number];
