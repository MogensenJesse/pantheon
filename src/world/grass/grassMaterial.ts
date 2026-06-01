// src/world/grass/grassMaterial.ts — per-pack TSL foliage materials (alpha cutout, wind, player glow)
import {
  type DirectionalLight,
  DoubleSide,
  type InstancedMesh,
  MeshDepthMaterial,
  type PerspectiveCamera,
  type PointLight,
  type Texture,
  Vector3,
} from 'three';
import {
  cos,
  dot,
  float,
  max,
  mix,
  positionLocal,
  positionWorld,
  sin,
  smoothstep,
  sub,
  texture,
  time,
  uniform,
  uv,
  vec3,
} from 'three/tsl';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import { PHASE0 } from '../../config/phase0';
import { devSettings } from '../../core/GameState';
import { playerGlowFalloff } from '../../rendering/playerGlowTsl';
import type { FoliagePackKey } from './foliageTypes';
import type { GrassTextureSet } from './grassPrototype';

type GrassNodeMaterial = MeshBasicNodeMaterial;

interface GrassUniforms {
  uWindStrength: ReturnType<typeof uniform>;
  uWindSpeed: ReturnType<typeof uniform>;
  uWindNoiseScale: ReturnType<typeof uniform>;
  uBladeHeight: ReturnType<typeof uniform>;
  uPlayerPos: ReturnType<typeof uniform>;
  uCameraPos: ReturnType<typeof uniform>;
  uLightRadius: ReturnType<typeof uniform>;
  uLightIntensity: ReturnType<typeof uniform>;
  uPlayerGlowMul: ReturnType<typeof uniform>;
  uWorldLight: ReturnType<typeof uniform>;
}

interface PackMaterialState {
  material: GrassNodeMaterial;
  uniforms: GrassUniforms;
  depthMaterial: MeshDepthMaterial;
  opacityOwned: Texture | null;
}

const packMaterials = new Map<FoliagePackKey, PackMaterialState>();

function configureGrassTexture(map: Texture): void {
  map.anisotropy = 8;
  map.needsUpdate = true;
}

function buildPackMaterial(packKey: FoliagePackKey, maps: GrassTextureSet): PackMaterialState {
  configureGrassTexture(maps.diffuse);
  if (maps.arm) configureGrassTexture(maps.arm);
  if (maps.opacity) configureGrassTexture(maps.opacity);

  const { GRASS: G } = PHASE0;
  const uWindStrength = uniform(G.WIND_STRENGTH);
  const uWindSpeed = uniform(G.WIND_SPEED);
  const uWindNoiseScale = uniform(G.WIND_NOISE_SCALE);
  const uBladeHeight = uniform(1.2);
  const uPlayerPos = uniform(new Vector3());
  const uCameraPos = uniform(new Vector3());
  const uLightRadius = uniform(6);
  const uLightIntensity = uniform(2.2);
  const uPlayerGlowMul = uniform(G.PLAYER_GLOW_MUL);
  const uWorldLight = uniform(0);

  const uniforms: GrassUniforms = {
    uWindStrength,
    uWindSpeed,
    uWindNoiseScale,
    uBladeHeight,
    uPlayerPos,
    uCameraPos,
    uLightRadius,
    uLightIntensity,
    uPlayerGlowMul,
    uWorldLight,
  };
  const uvCoord = uv();
  const diff = texture(maps.diffuse).sample(uvCoord);
  const { r, g, b } = G.COLOR_BOOST;
  let albedo = diff.rgb.mul(vec3(r, g, b));

  if (maps.arm) {
    const arm = texture(maps.arm).sample(uvCoord);
    const ao = arm.r;
    albedo = albedo.mul(ao.mul(G.AO_MUL).add(G.AO_ADD));
  }

  let baseAlpha;
  if (maps.opacity) {
    const mask = texture(maps.opacity).sample(uvCoord);
    const maskLum = dot(mask.rgb, vec3(0.2126, 0.7152, 0.0722));
    baseAlpha = maskLum.mul(mask.a);
  } else {
    const lum = dot(diff.rgb, vec3(0.2126, 0.7152, 0.0722));
    // JPEG diffuse has no real alpha channel (often a=1 everywhere); luminance only.
    baseAlpha = smoothstep(float(G.LUM_ALPHA_LOW), float(G.LUM_ALPHA_HIGH), lum);
  }

  const dist = positionWorld.distance(uPlayerPos);
  const playerGlow = playerGlowFalloff(dist, uLightRadius, uLightIntensity, uPlayerGlowMul);
  const nightClip = max(playerGlow, uWorldLight);
  const sunUp = smoothstep(float(0.12), float(0.35), uWorldLight);
  const clipAlpha = mix(baseAlpha.mul(nightClip), baseAlpha, sunUp);

  const camDist = positionWorld.distance(uCameraPos);
  const windFade = sub(
    float(1),
    smoothstep(float(G.LOD0_DISTANCE), float(G.DISTANCE_CUT_SHOW), camDist),
  );

  const windPhase = positionWorld.x
    .mul(uWindNoiseScale)
    .add(positionWorld.z.mul(uWindNoiseScale))
    .add(time.mul(uWindSpeed));
  const swayX = sin(windPhase).mul(uWindStrength).mul(windFade);
  const swayZ = cos(windPhase.mul(1.31)).mul(uWindStrength.mul(0.65)).mul(windFade);
  const bendMask = smoothstep(float(0), uBladeHeight, positionLocal.y);
  const windOffset = vec3(swayX, float(0), swayZ).mul(bendMask);

  const material = new MeshBasicNodeMaterial({
    side: DoubleSide,
    transparent: false,
    depthWrite: true,
    alphaTest: G.ALPHA_TEST,
  }) as GrassNodeMaterial;

  material.colorNode = albedo;
  material.opacityNode = clipAlpha;
  material.positionNode = positionLocal.add(windOffset);

  const depthMaterial = new MeshDepthMaterial({
    map: maps.diffuse,
    ...(maps.opacity ? { alphaMap: maps.opacity } : {}),
    alphaTest: G.ALPHA_TEST,
    depthWrite: true,
  });
  (
    material as GrassNodeMaterial & { customDepthMaterial?: MeshDepthMaterial }
  ).customDepthMaterial = depthMaterial;

  const opacityOwned = maps.opacityOwned && maps.opacity ? maps.opacity : null;

  if (import.meta.env.DEV) {
    const img = maps.diffuse.image as HTMLImageElement | undefined;
    console.info(`[foliage] material ready (${packKey})`, {
      alphaTest: G.ALPHA_TEST,
      mapSize: img ? `${img.width}x${img.height}` : '?',
      hasArm: !!maps.arm,
      hasOpacity: !!maps.opacity,
      lumCutout: maps.opacity ? null : [G.LUM_ALPHA_LOW, G.LUM_ALPHA_HIGH],
    });
  }

  return { material, uniforms, depthMaterial, opacityOwned };
}

export function initFoliageMaterial(packKey: FoliagePackKey, maps: GrassTextureSet): MeshBasicNodeMaterial {
  if (packMaterials.has(packKey)) {
    return packMaterials.get(packKey)!.material;
  }
  const state = buildPackMaterial(packKey, maps);
  packMaterials.set(packKey, state);
  applyGrassDevUniforms();
  return state.material;
}

/** @deprecated Use initFoliageMaterial. */
export const initGrassMaterial = initFoliageMaterial;

export function getFoliageMaterial(packKey: FoliagePackKey): MeshBasicNodeMaterial {
  const state = packMaterials.get(packKey);
  if (!state) {
    throw new Error(`initFoliageMaterial must be called for pack ${packKey} before scattering`);
  }
  return state.material;
}

export function getGrassMaterial(): MeshBasicNodeMaterial {
  return getFoliageMaterial('grass_medium_01');
}

export function applyFoliageMaterial(mesh: InstancedMesh, packKey: FoliagePackKey): void {
  mesh.material = getFoliageMaterial(packKey);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.frustumCulled = true;
}

/** @deprecated Use applyFoliageMaterial. */
export const applyGrassMaterial = applyFoliageMaterial;

function forEachPackUniforms(fn: (u: GrassUniforms) => void): void {
  for (const state of packMaterials.values()) {
    fn(state.uniforms);
  }
}

export function applyGrassDevUniforms(): void {
  const g = devSettings.grass;
  forEachPackUniforms((u) => {
    u.uWindStrength.value = g.windStrength;
    u.uWindSpeed.value = g.windSpeed;
  });
}

export function syncGrassLighting(
  playerPosition: Vector3,
  playerLight: PointLight,
  sun: DirectionalLight,
  camera: PerspectiveCamera,
): void {
  if (packMaterials.size === 0) return;
  const worldLight = Math.min(1, sun.intensity / PHASE0.SKY_REVEAL.SUN_INTENSITY_MAX);
  forEachPackUniforms((u) => {
    (u.uPlayerPos.value as Vector3).copy(playerPosition);
    (u.uCameraPos.value as Vector3).copy(camera.position);
    u.uLightRadius.value = playerLight.distance;
    u.uLightIntensity.value = playerLight.intensity;
    u.uWorldLight.value = worldLight;
  });
  applyGrassDevUniforms();
}

export function disposeFoliageMaterials(): void {
  for (const state of packMaterials.values()) {
    state.depthMaterial.dispose();
    state.material.dispose();
    state.opacityOwned?.dispose();
  }
  packMaterials.clear();
}

/** @deprecated Use disposeFoliageMaterials. */
export const disposeGrassMaterial = disposeFoliageMaterials;
