// src/world/water/mesh/createPantheonWater.ts — reflective ocean (layer-culled reflector or cheap tier)

import type { DirectionalLight, Texture } from 'three';
import { Color, Vector3 } from 'three';
import { VISUAL, type WaterTier } from '../../../config/visualTuning';
import type { WaterShoreDepthInputs } from '../material/waterShoreUniforms';
import { CheapPantheonWaterMesh } from './cheapPantheonWater';
import type { PantheonWaterInstance } from './pantheonWaterTypes';
import { ReflectivePantheonWaterMesh } from './ReflectivePantheonWaterMesh';
import { createWaterDiscGeometry } from './waterDiscGeometry';

export interface PantheonWaterOptions {
  /** Half-extent of the ocean disc the water must cover. */
  waterRadius: number;
  /** World-space Y of the water surface. */
  waterY: number;
  /** Macro height map for coast clip + depth opacity/tint (play mode). */
  shoreDepth?: WaterShoreDepthInputs;
}

/** The disc follows the camera (syncWaterWaves), so its rim must reach past the edge fade from any camera position on the map. */
const FOLLOW_MARGIN_M = 4096;

function buildWaterGeometry(waterRadius: number) {
  return createWaterDiscGeometry({
    radius: waterRadius + FOLLOW_MARGIN_M,
    ...VISUAL.water.waves.mesh,
  });
}

function sharedWaterOptions(
  sun: DirectionalLight,
  waterNormals: Texture,
  waterRadius: number,
  shoreDepth?: WaterShoreDepthInputs,
) {
  return {
    sun,
    waterNormals,
    waterRadius,
    shoreDepth,
    edgeFadeStartRatio: VISUAL.water.edgeFadeStartRatio,
    edgeFadeEndRatio: VISUAL.water.edgeFadeEndRatio,
    resolutionScale: VISUAL.water.resolutionScale,
    size: VISUAL.water.size,
    alpha: VISUAL.water.alpha,
    // the starting look (night stop); syncPantheonWater overwrites all three every frame
    sunDirection: new Vector3(0, 1, 0),
    sunColor: new Color(VISUAL.water.stops.night.sunColor),
    waterColor: new Color(VISUAL.water.stops.night.waterColor),
    distortionScale: VISUAL.water.stops.night.distortion,
  };
}

/**
 * Builds the flat ocean used across the island. Reflective tier uses a planar reflector
 * limited to sky/terrain/clouds (grass excluded via {@link waterReflectionLayers}).
 */
export function createPantheonWater(
  waterNormals: Texture,
  { waterRadius, waterY, shoreDepth }: PantheonWaterOptions,
  sun: DirectionalLight,
): PantheonWaterInstance {
  const geometry = buildWaterGeometry(waterRadius);
  const options = sharedWaterOptions(sun, waterNormals, waterRadius, shoreDepth);

  const water =
    (VISUAL.water.tier as WaterTier) === 'cheap'
      ? new CheapPantheonWaterMesh(geometry, options)
      : new ReflectivePantheonWaterMesh(geometry, options);

  water.rotation.x = -Math.PI / 2;
  water.position.y = waterY;
  water.receiveShadow = VISUAL.water.receiveShadow;
  water.renderOrder = 1;
  water.frustumCulled = false;

  return water as PantheonWaterInstance;
}
