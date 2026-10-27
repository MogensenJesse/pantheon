// src/world/village/model/buildingInfo.ts — what each building type is called and how tall it stands (pure)
//
// One table per fact, typed over every building type, so adding a type is a compile error until it has both.

import type { VillageBuildingType } from './assetKeys.ts';

/** The name the player sees for each building type. */
export const BUILDING_LABELS: Readonly<Record<VillageBuildingType, string>> = {
  temple: 'Temple',
  house_a: 'Small house',
  house_b: 'House',
  house_c: 'Large house',
  workshop: 'Workshop',
  granary: 'Granary',
  farmstead: 'Farmstead',
  shrine: 'Shrine',
  well: 'Well',
};

/** About how tall a finished building is (m), floor, walls, roof and chimney, as the stand-in kit draws them. */
export const BUILDING_HEIGHT_M: Readonly<Record<VillageBuildingType, number>> = {
  temple: 9,
  well: 2.2,
  house_a: 4,
  house_b: 4.5,
  house_c: 5,
  workshop: 4.5,
  granary: 4.3,
  farmstead: 3.8,
  shrine: 4.5,
};
