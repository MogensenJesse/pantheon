// src/world/grass/grassMaterial.ts — shared TSL grass material (alpha cutout, wind, player glow)
import {
  DoubleSide,
  MeshDepthMaterial,
  Vector3,
  type DirectionalLight,
  type InstancedMesh,
  type PointLight,
  type Texture,
} from 'three';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import {
  cos,
  float,
  max,
  positionLocal,
  positionWorld,
  sin,
  smoothstep,
  texture,
  time,
  uniform,
  uv,
  vec3,
} from 'three/tsl';
import { PHASE0 } from '../../config/phase0';
import { devSettings } from '../../core/GameState';

type GrassNodeMaterial = MeshBasicNodeMaterial;

interface GrassUniforms {
  uWindStrength: ReturnType<typeof uniform>;
  uWindSpeed: ReturnType<typeof uniform>;
  uWindNoiseScale: ReturnType<typeof uniform>;
  uBladeHeight: ReturnType<typeof uniform>;
  uPlayerPos: ReturnType<typeof uniform>;
  uLightRadius: ReturnType<typeof uniform>;
  uLightIntensity: ReturnType<typeof uniform>;
  uPlayerGlowMul: ReturnType<typeof uniform>;
  uWorldLight: ReturnType<typeof uniform>;
}

let sharedGrassMaterial: GrassNodeMaterial | null = null;
let grassUniforms: GrassUniforms | null = null;
let grassDepthMaterial: MeshDepthMaterial | null = null;

function createPlayerGlowNodes(
  uPlayerPos: ReturnType<typeof uniform>,
  uLightRadius: ReturnType<typeof uniform>,
  uLightIntensity: ReturnType<typeof uniform>,
  uPlayerGlowMul: ReturnType<typeof uniform>,
) {
  const dist = positionWorld.distance(uPlayerPos);
  const falloff = float(1).sub(smoothstep(float(0), uLightRadius, dist));
  return falloff.mul(uLightIntensity).mul(uPlayerGlowMul);
}

export function initGrassMaterial(diffuseMap: Texture): MeshBasicNodeMaterial {
  if (sharedGrassMaterial) return sharedGrassMaterial;

  const { GRASS: G } = PHASE0;
  const uWindStrength = uniform(G.WIND_STRENGTH);
  const uWindSpeed = uniform(G.WIND_SPEED);
  const uWindNoiseScale = uniform(G.WIND_NOISE_SCALE);
  const uBladeHeight = uniform(1.2);
  const uPlayerPos = uniform(new Vector3());
  const uLightRadius = uniform(6);
  const uLightIntensity = uniform(2.2);
  const uPlayerGlowMul = uniform(G.PLAYER_GLOW_MUL);
  const uWorldLight = uniform(0);

  grassUniforms = {
    uWindStrength,
    uWindSpeed,
    uWindNoiseScale,
    uBladeHeight,
    uPlayerPos,
    uLightRadius,
    uLightIntensity,
    uPlayerGlowMul,
    uWorldLight,
  };

  const uvCoord = uv();
  const sample = texture(diffuseMap).sample(uvCoord);
  const { r, g, b } = G.COLOR_BOOST;
  const albedo = sample.rgb.mul(vec3(r, g, b));
  const playerGlow = createPlayerGlowNodes(uPlayerPos, uLightRadius, uLightIntensity, uPlayerGlowMul);
  const visibility = max(playerGlow, uWorldLight);

  const windPhase = positionWorld.x
    .mul(uWindNoiseScale)
    .add(positionWorld.z.mul(uWindNoiseScale))
    .add(time.mul(uWindSpeed));
  const swayX = sin(windPhase).mul(uWindStrength);
  const swayZ = cos(windPhase.mul(1.31)).mul(uWindStrength.mul(0.65));
  const bendMask = smoothstep(float(0), uBladeHeight, positionLocal.y);
  const windOffset = vec3(swayX, float(0), swayZ).mul(bendMask);

  const material = new MeshBasicNodeMaterial({
    side: DoubleSide,
    transparent: false,
    depthWrite: true,
    alphaTest: G.ALPHA_TEST,
    map: diffuseMap,
  }) as GrassNodeMaterial;
  material.colorNode = albedo.mul(visibility);
  material.opacityNode = sample.a;
  material.positionNode = positionLocal.add(windOffset);

  grassDepthMaterial = new MeshDepthMaterial({
    map: diffuseMap,
    alphaTest: G.ALPHA_TEST,
    depthWrite: true,
  });
  (material as GrassNodeMaterial & { customDepthMaterial?: MeshDepthMaterial }).customDepthMaterial =
    grassDepthMaterial;

  sharedGrassMaterial = material;
  applyGrassDevUniforms();

  if (import.meta.env.DEV) {
    console.info('[grass] material ready', {
      alphaTest: G.ALPHA_TEST,
      mapSize: `${diffuseMap.image?.width ?? '?'}x${diffuseMap.image?.height ?? '?'}`,
    });
  }

  return sharedGrassMaterial;
}

export function getGrassMaterial(): MeshBasicNodeMaterial {
  if (!sharedGrassMaterial) {
    throw new Error('initGrassMaterial must be called before scattering grass');
  }
  return sharedGrassMaterial;
}

export function applyGrassMaterial(mesh: InstancedMesh): void {
  mesh.material = getGrassMaterial();
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.frustumCulled = true;
}

export function applyGrassDevUniforms(): void {
  if (!grassUniforms) return;
  const g = devSettings.grass;
  grassUniforms.uWindStrength.value = g.windStrength;
  grassUniforms.uWindSpeed.value = g.windSpeed;
}

export function syncGrassLighting(
  playerPosition: Vector3,
  playerLight: PointLight,
  sun: DirectionalLight,
): void {
  if (!grassUniforms) return;
  (grassUniforms.uPlayerPos.value as Vector3).copy(playerPosition);
  grassUniforms.uLightRadius.value = playerLight.distance;
  grassUniforms.uLightIntensity.value = playerLight.intensity;
  grassUniforms.uWorldLight.value = Math.min(1, sun.intensity / PHASE0.GRASS.SUN_INTENSITY_MAX);
  applyGrassDevUniforms();
}

export function disposeGrassMaterial(): void {
  grassDepthMaterial?.dispose();
  grassDepthMaterial = null;
  sharedGrassMaterial?.dispose();
  sharedGrassMaterial = null;
  grassUniforms = null;
}
