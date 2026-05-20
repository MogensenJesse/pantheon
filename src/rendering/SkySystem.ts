// src/rendering/SkySystem.ts — TSL sky dome + volumetric-style cloud shell (WebGPU)
import {
  BackSide,
  Color,
  DirectionalLight,
  Mesh,
  Scene,
  SphereGeometry,
  Vector3,
  type PerspectiveCamera,
} from 'three';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import {
  Fn,
  clamp,
  dot,
  float,
  max,
  mix,
  modelViewProjection,
  normalize,
  positionLocal,
  positionWorld,
  pow,
  smoothstep,
  uniform,
  vec3,
  vec4,
} from 'three/tsl';
import { createVolumetricCloudNodes } from './shaders/volumetricClouds';
import { logRenderDebugSky } from './renderDebugLog';

/** Sky dome scale; inner shell sits inside camera far plane. */
export const SKY_SCALE = 450;
export const CAMERA_FAR = 2000;
export const SKY_BACKGROUND = 0x08080f;

/** Clip-space z = w: sky/cloud shells draw at far plane without depth clipping. */
const farPlanePositionNode = Fn(() => {
  const clipPos = modelViewProjection.mul(vec4(positionLocal, 1.0));
  clipPos.z.assign(clipPos.w);
  return clipPos;
})();

const _sunWorld = new Vector3();
const _sunDir = new Vector3();

export interface SkySystemContext {
  clouds: Mesh;
  update: (sun: DirectionalLight, camera: PerspectiveCamera, elapsed: number) => void;
  setDaylight: (factor: number) => void;
  dispose: () => void;
}

export function initSkySystem(scene: Scene): SkySystemContext {
  scene.background = new Color(SKY_BACKGROUND);

  const sunDirection = uniform(new Vector3(0.4, 0.25, 0.35).normalize());
  const daylightUniform = uniform(0.12);
  const turbidity = uniform(7);
  const rayleigh = uniform(2);
  const skyIntensity = uniform(0.65);

  const skyColorNode = Fn(() => {
    const direction = normalize(positionWorld);
    const sunDir = normalize(sunDirection);
    const zenith = max(dot(direction, vec3(0, 1, 0)), 0);
    const sunDot = max(dot(direction, sunDir), 0);
    const horizon = float(1).sub(zenith);
    const sky = mix(vec3(0.02, 0.04, 0.1), vec3(0.45, 0.62, 0.95), pow(zenith, 0.45));
    const mie = pow(sunDot, float(8).sub(turbidity.mul(0.3))).mul(vec3(1.0, 0.95, 0.85));
    const sunDisc = smoothstep(0.985, 0.9985, sunDot).mul(vec3(2.2, 1.85, 1.4));
    const night = float(1).sub(clamp(rayleigh.div(3), 0, 1));
    const nightFade = mix(float(0.2), float(0.55), daylightUniform);
    const skyBase = sky.add(mie.mul(0.35)).mul(skyIntensity);
    const skyWithDisc = skyBase.add(sunDisc);
    const nightMix = night.mul(horizon.mul(0.35).mul(nightFade));
    return vec4(mix(skyWithDisc, vec3(0.01, 0.015, 0.04), nightMix), 1);
  });

  const skyMaterial = new MeshBasicNodeMaterial({
    side: BackSide,
    depthWrite: false,
    depthTest: false,
  });
  skyMaterial.colorNode = skyColorNode();
  skyMaterial.positionNode = farPlanePositionNode;
  const sky = new Mesh(new SphereGeometry(1, 32, 16), skyMaterial);
  sky.scale.setScalar(SKY_SCALE);
  sky.frustumCulled = false;
  sky.renderOrder = -2;
  scene.add(sky);

  const cloudNodes = createVolumetricCloudNodes();
  const cloudMaterial = new MeshBasicNodeMaterial({
    side: BackSide,
    transparent: true,
    depthWrite: false,
    // depthTest true: terrain/trees occlude clouds when looking down (correct sky behaviour).
    // Lower hemisphere density is already 0 from the y-mask, so this only affects edge cases.
    depthTest: true,
  });
  const cloudOutput = cloudNodes.cloudColorNode();
  cloudMaterial.colorNode = cloudOutput;
  cloudMaterial.opacityNode = cloudOutput.a;

  const clouds = new Mesh(new SphereGeometry(380, 64, 48), cloudMaterial);
  clouds.renderOrder = -1;
  clouds.frustumCulled = false;
  scene.add(clouds);

  let daylight = 0.12;
  let debugSkyLogged = false;

  const applyDaylight = () => {
    daylightUniform.value = daylight;
    cloudNodes.daylight.value = daylight;
    cloudNodes.cloudCoverage.value = 0.38 + daylight * 0.12;
    turbidity.value = 6 + daylight * 4;
    rayleigh.value = 1.2 + daylight * 1.8;
    skyIntensity.value = Math.max(0.65, 0.5 + daylight * 0.4);
  };

  const syncSunPosition = (sun: DirectionalLight) => {
    _sunDir.copy(sun.position).sub(sun.target.position).normalize();
    _sunWorld.copy(_sunDir).multiplyScalar(SKY_SCALE);
    sunDirection.value.copy(_sunDir);
    cloudNodes.sunDirection.value.copy(_sunDir);
  };

  applyDaylight();

  return {
    clouds,
    update(sun, camera, elapsed) {
      cloudNodes.time.value = elapsed;
      cloudNodes.uCloudCameraPos.value.copy(camera.position);
      syncSunPosition(sun);
      if (import.meta.env.DEV && !debugSkyLogged) {
        debugSkyLogged = true;
        logRenderDebugSky(clouds, sun, daylight);
      }
    },
    setDaylight(factor) {
      daylight = Math.max(0, Math.min(1, factor));
      applyDaylight();
    },
    dispose() {
      scene.remove(sky);
      scene.remove(clouds);
      sky.geometry.dispose();
      skyMaterial.dispose();
      clouds.geometry.dispose();
      cloudMaterial.dispose();
    },
  };
}
