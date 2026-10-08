// src/world/terrain/material/syncTerrainSplatLighting.ts
import { type AmbientLight, Color, type DirectionalLight, type PointLight, Vector3 } from 'three';
import { runtimeSettings } from '../../../core/state/runtimeSettings';
import { copyBakedSunDirection } from '../../../rendering/sunShadow/bakedSunDirection';
import {
  shadowFloorForProfile,
  terrainShadeSunKeepForElevation,
} from '../../../rendering/sunShadow/sunShadowProfiles';
import { currentSunElevationDeg } from '../../../rendering/sunSpherical';
import { todWeights } from '../../../rendering/tod/todBlend';
import { applyStylizePaletteLerp } from './biomeSplatUniforms';
import type { TerrainSplatMaterial } from './createTerrainSplatMaterial';

const _sunDir = new Vector3();
const _lastSunDir = new Vector3();
let _lastSunIntensity = -1;
let _lastAmbientIntensity = -1;
const _lastAmbientColor = new Color();
const _lastSunColor = new Color();
const _lastPlayerPos = new Vector3();
let _lastLightRadius = -1;
let _lastLightIntensity = -1;
let _lastNightW = -1;
let _lastGoldenW = -1;
let _lastNoonW = -1;
let _lastTerrainFloor = Number.NaN;
let _lastShadeSunKeep = Number.NaN;
/** Materials that already got every value once: a new material needs a forced full push. */
const _seeded = new WeakSet<TerrainSplatMaterial>();

export function syncTerrainSplatLighting(
  material: TerrainSplatMaterial,
  playerPosition: Vector3,
  playerLight: PointLight,
  sun: DirectionalLight,
  ambient: AmbientLight,
): void {
  copyBakedSunDirection(sun, _sunDir);
  const sunMoved =
    _lastSunDir.distanceToSquared(_sunDir) > 1e-8 ||
    Math.abs(_lastSunIntensity - sun.intensity) > 1e-4 ||
    !_lastSunColor.equals(sun.color);
  const ambientChanged =
    Math.abs(_lastAmbientIntensity - ambient.intensity) > 1e-4 ||
    !_lastAmbientColor.equals(ambient.color);
  const playerMoved = _lastPlayerPos.distanceToSquared(playerPosition) > 1e-4;
  const lightChanged =
    Math.abs(_lastLightRadius - playerLight.distance) > 1e-4 ||
    Math.abs(_lastLightIntensity - playerLight.intensity) > 1e-4;
  const elev = currentSunElevationDeg();
  const w = todWeights(elev);
  const todChanged =
    Math.abs(_lastNightW - w.night) > 1e-4 ||
    Math.abs(_lastGoldenW - w.goldenHour) > 1e-4 ||
    Math.abs(_lastNoonW - w.noon) > 1e-4;
  const terrainFloor = shadowFloorForProfile('terrain', elev);
  const shadeSunKeep = terrainShadeSunKeepForElevation(elev);
  const floorChanged =
    Math.abs(terrainFloor - _lastTerrainFloor) > 1e-5 ||
    Number.isNaN(_lastTerrainFloor) ||
    Math.abs(shadeSunKeep - _lastShadeSunKeep) > 1e-5 ||
    Number.isNaN(_lastShadeSunKeep);
  const lightOrPlayerDirty = sunMoved || ambientChanged || playerMoved || lightChanged;
  const fresh = !_seeded.has(material);
  if (!fresh && !lightOrPlayerDirty && !todChanged && !floorChanged) {
    return;
  }
  _seeded.add(material);

  const u = material.terrainUniforms;
  if (fresh || lightOrPlayerDirty) {
    (u.uSunDirection.value as Vector3).copy(_sunDir);
    (u.uSunColor.value as Color).set(sun.color);
    u.uSunIntensity.value = sun.intensity;
    (u.uAmbientColor.value as Color).set(ambient.color);
    u.uAmbientIntensity.value = ambient.intensity;
    (u.uPlayerPos.value as Vector3).copy(playerPosition);
    u.uLightRadius.value = playerLight.distance;
    u.uLightIntensity.value = playerLight.intensity;
  }
  if (fresh || todChanged) {
    applyStylizePaletteLerp(u, elev, runtimeSettings.terrain.stylize);
  }
  if (fresh || floorChanged) {
    u.uShadowFloor.value = terrainFloor;
    u.uShadeSunKeep.value = shadeSunKeep;
  }

  if (floorChanged) {
    _lastTerrainFloor = terrainFloor;
    _lastShadeSunKeep = shadeSunKeep;
  }

  if (todChanged) {
    _lastNightW = w.night;
    _lastGoldenW = w.goldenHour;
    _lastNoonW = w.noon;
  }

  _lastSunDir.copy(_sunDir);
  _lastSunIntensity = sun.intensity;
  _lastSunColor.copy(sun.color);
  _lastAmbientIntensity = ambient.intensity;
  _lastAmbientColor.copy(ambient.color);
  _lastPlayerPos.copy(playerPosition);
  _lastLightRadius = playerLight.distance;
  _lastLightIntensity = playerLight.intensity;
}
