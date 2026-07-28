// src/world/water/mesh/createPantheonWater.ts — reflective ocean (layer-culled reflector or cheap tier)

import type { DirectionalLight, Texture } from 'three';
import { CircleGeometry, Vector3 } from 'three';
import { VISUAL, type WaterTier } from '../../../config/visualTuning';
import { WATER_NIGHT, WATER_PARAMS } from '../config/waterConfig';
import type { WaterShoreDepthInputs } from '../material/waterShoreUniforms';
import { initWaterWaveUniforms } from '../material/waterWaveUniforms';
import { CheapPantheonWaterMesh } from './cheapPantheonWater';
import type { PantheonWaterInstance } from './pantheonWaterTypes';
import { ReflectivePantheonWaterMesh } from './ReflectivePantheonWaterMesh';

export interface PantheonWaterOptions {
  /** Half-extent of the ocean disc the water must cover. */
  waterRadius: number;
  /** World-space Y of the water surface. */
  waterY: number;
  /** Macro height map for coast clip + depth opacity/tint (play mode). */
  shoreDepth?: WaterShoreDepthInputs;
}

function buildWaterGeometry(waterRadius: number): CircleGeometry {
  return new CircleGeometry(waterRadius, 64);
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
    resolutionScale: WATER_PARAMS.resolutionScale,
    size: WATER_PARAMS.size,
    alpha: WATER_PARAMS.alpha,
    sunDirection: new Vector3(0, 1, 0),
    sunColor: WATER_NIGHT.sunColor.clone(),
    waterColor: WATER_NIGHT.waterColor.clone(),
    distortionScale: WATER_NIGHT.distortionScale,
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

  initWaterWaveUniforms(waterY);

  const water =
    (VISUAL.water.tier as WaterTier) === 'cheap'
      ? new CheapPantheonWaterMesh(geometry, options)
      : new ReflectivePantheonWaterMesh(geometry, options);

  water.rotation.x = -Math.PI / 2;
  water.position.y = waterY;
  water.receiveShadow = VISUAL.water.receiveShadow;
  water.renderOrder = 1;

  return water as PantheonWaterInstance;
}
