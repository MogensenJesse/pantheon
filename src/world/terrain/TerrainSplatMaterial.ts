// src/world/terrain/TerrainSplatMaterial.ts
import {
  Color,
  type Camera,
  type AmbientLight,
  type DirectionalLight,
  type PointLight,
  Vector3,
} from 'three';
import {
  createBiomeSplatMaterial,
  type BiomeSplatMaterialOptions,
  type TerrainSplatMaterial,
  type TerrainSplatUniforms,
} from './biomeSplat';
import type { TerrainTextureSet } from './loadTerrainTextures';

const _sunDir = new Vector3();
const _lastSunDir = new Vector3();
let _lastSunIntensity = -1;
let _lastAmbientIntensity = -1;
const _lastAmbientColor = new Color();
const _lastSunColor = new Color();
const _lastCamPos = new Vector3();
const _lastPlayerPos = new Vector3();
let _lastLightRadius = -1;
let _lastLightIntensity = -1;

export type { TerrainSplatMaterial, TerrainSplatUniforms };

export type { BiomeSplatMaterialOptions };

export function createTerrainSplatMaterial(
  textures: TerrainTextureSet,
  sun: DirectionalLight,
  options?: BiomeSplatMaterialOptions,
): TerrainSplatMaterial {
  return createBiomeSplatMaterial(textures, sun, options);
}

export function syncTerrainSplatLighting(
  material: TerrainSplatMaterial,
  playerPosition: Vector3,
  playerLight: PointLight,
  sun: DirectionalLight,
  ambient: AmbientLight,
  camera: Camera,
): void {
  _sunDir.copy(sun.position).sub(sun.target.position).normalize();
  const sunMoved =
    _lastSunDir.distanceToSquared(_sunDir) > 1e-8 ||
    Math.abs(_lastSunIntensity - sun.intensity) > 1e-4 ||
    !_lastSunColor.equals(sun.color);
  const ambientChanged =
    Math.abs(_lastAmbientIntensity - ambient.intensity) > 1e-4 ||
    !_lastAmbientColor.equals(ambient.color);
  const camMoved = _lastCamPos.distanceToSquared(camera.position) > 1e-4;
  const playerMoved = _lastPlayerPos.distanceToSquared(playerPosition) > 1e-4;
  const lightChanged =
    Math.abs(_lastLightRadius - playerLight.distance) > 1e-4 ||
    Math.abs(_lastLightIntensity - playerLight.intensity) > 1e-4;
  if (!sunMoved && !ambientChanged && !camMoved && !playerMoved && !lightChanged) return;

  const u = material.terrainUniforms;
  (u.uSunDirection.value as Vector3).copy(_sunDir);
  (u.uSunColor.value as Color).set(sun.color);
  u.uSunIntensity.value = sun.intensity;
  (u.uAmbientColor.value as Color).set(ambient.color);
  u.uAmbientIntensity.value = ambient.intensity;
  (u.uViewCamPos.value as Vector3).copy(camera.position);
  (u.uPlayerPos.value as Vector3).copy(playerPosition);
  u.uLightRadius.value = playerLight.distance;
  u.uLightIntensity.value = playerLight.intensity;

  _lastSunDir.copy(_sunDir);
  _lastSunIntensity = sun.intensity;
  _lastSunColor.copy(sun.color);
  _lastAmbientIntensity = ambient.intensity;
  _lastAmbientColor.copy(ambient.color);
  _lastCamPos.copy(camera.position);
  _lastPlayerPos.copy(playerPosition);
  _lastLightRadius = playerLight.distance;
  _lastLightIntensity = playerLight.intensity;
}

export function disposeTerrainSplatMaterial(material: TerrainSplatMaterial): void {
  material.dispose();
}
