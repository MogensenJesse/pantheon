// src/world/water/syncPantheonWater.ts — per-frame sun + day/night drive for WaterMesh
import { Color, MathUtils, Vector3 } from 'three';
import type { WaterMesh } from 'three/addons/objects/WaterMesh.js';
import { VISUAL } from '../../config/visualTuning';
import { devSettings } from '../../core/GameState';
import { sunDirectionFromSpherical } from '../../rendering/sunSpherical';
import { WATER_DAY, WATER_NIGHT } from './waterConfig';

const _sunDir = new Vector3();
const _waterColor = new Color();
const _sunColor = new Color();

const NIGHT = VISUAL.sky.revealLighting.nightSky;

/**
 * Syncs the ocean to the shared sun each frame. The sun direction matches the
 * SkyMesh + god-rays source (sunDirectionFromSpherical), and the colour/chop
 * blend from the night preset to the day preset as WorldReveal raises daylight.
 */
export function syncPantheonWater(
  water: WaterMesh,
  elevationDeg: number,
  daylight: number,
  sunAzimuthDeg: number,
): void {
  sunDirectionFromSpherical(elevationDeg, sunAzimuthDeg, _sunDir);
  water.sunDirection.value.copy(_sunDir).normalize();

  const t = MathUtils.smoothstep(daylight, NIGHT, 1);
  const w = devSettings.water;

  _waterColor.copy(WATER_NIGHT.waterColor).lerp(WATER_DAY.waterColor, t);
  _sunColor.copy(WATER_NIGHT.sunColor).lerp(WATER_DAY.sunColor, t);

  water.waterColor.value.copy(_waterColor);
  water.sunColor.value.copy(_sunColor);
  water.distortionScale.value = MathUtils.lerp(w.distortionNight, w.distortionDay, t);
  water.size.value = w.size;
  water.alpha.value = w.alpha;
}
