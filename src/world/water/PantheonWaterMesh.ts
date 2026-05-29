// src/world/water/PantheonWaterMesh.ts — reflective ocean (three.js WebGPU WaterMesh)
import { PlaneGeometry, Vector3 } from 'three';
import { WaterMesh } from 'three/addons/objects/WaterMesh.js';
import type { Texture } from 'three';
import { WATER_NIGHT, WATER_PARAMS } from './waterConfig';

export interface PantheonWaterOptions {
  /** Half-extent of the ocean disc the water must cover (matches seafloor radius). */
  waterRadius: number;
  /** World-space Y of the water surface. */
  waterY: number;
}

/**
 * Builds the flat reflective ocean used across the island. The WaterMesh's
 * built-in planar reflector mirrors the SkyMesh in real time, so the sky and
 * water share a single sun (see syncPantheonWater). Starts in the night preset;
 * WorldReveal-driven daylight blends it toward the day look each frame.
 */
export function createPantheonWater(
  waterNormals: Texture,
  { waterRadius, waterY }: PantheonWaterOptions,
): WaterMesh {
  // Square plane sized to span the circular ocean disc (diameter = 2 * radius).
  const planeSize = waterRadius * 2;
  const geometry = new PlaneGeometry(planeSize, planeSize);

  const water = new WaterMesh(geometry, {
    waterNormals,
    resolutionScale: WATER_PARAMS.resolutionScale,
    size: WATER_PARAMS.size,
    alpha: WATER_PARAMS.alpha,
    sunDirection: new Vector3(0, 1, 0),
    sunColor: WATER_NIGHT.sunColor.clone(),
    waterColor: WATER_NIGHT.waterColor.clone(),
    distortionScale: WATER_NIGHT.distortionScale,
  });

  water.rotation.x = -Math.PI / 2;
  water.position.y = waterY;
  water.receiveShadow = true;
  water.renderOrder = 1;

  return water;
}
