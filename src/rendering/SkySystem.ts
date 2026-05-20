// src/rendering/SkySystem.ts — Preetham sky + raymarched volumetric clouds
import {
  BackSide,
  DirectionalLight,
  Mesh,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
  type PerspectiveCamera,
  type WebGLRenderer,
} from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import {
  volumetricCloudFragment,
  volumetricCloudVertex,
} from './shaders/volumetricClouds';

const SKY_SCALE = 450000;
const _sunWorld = new Vector3();
const _sunDir = new Vector3();

export interface SkySystemContext {
  update: (sun: DirectionalLight, camera: PerspectiveCamera, elapsed: number) => void;
  setDaylight: (factor: number) => void;
  dispose: () => void;
}

function patchSkyIntensity(sky: Sky): void {
  const material = sky.material;
  const previous = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    previous?.call(material, shader, renderer);
    shader.uniforms.skyIntensity = { value: 0.55 };
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <tonemapping_fragment>',
      `
        gl_FragColor.rgb *= skyIntensity;
        #include <tonemapping_fragment>
      `,
    );
    shader.fragmentShader = `uniform float skyIntensity;\n${shader.fragmentShader}`;
    material.userData.skyIntensityUniform = shader.uniforms.skyIntensity;
  };
  material.needsUpdate = true;
}

export function initSkySystem(scene: Scene, _renderer: WebGLRenderer): SkySystemContext {
  scene.background = null;

  const sky = new Sky();
  sky.scale.setScalar(SKY_SCALE);
  sky.renderOrder = -2;
  scene.add(sky);
  patchSkyIntensity(sky);

  const skyUniforms = sky.material.uniforms;
  skyUniforms['turbidity'].value = 7;
  skyUniforms['rayleigh'].value = 2;
  skyUniforms['mieCoefficient'].value = 0.003;
  skyUniforms['mieDirectionalG'].value = 0.8;

  const cloudMaterial = new ShaderMaterial({
    uniforms: {
      sunDirection: { value: new Vector3(0.4, 0.25, 0.35).normalize() },
      uCloudCameraPos: { value: new Vector3() },
      time: { value: 0 },
      daylight: { value: 0.12 },
      cloudCoverage: { value: 0.42 },
    },
    vertexShader: volumetricCloudVertex,
    fragmentShader: volumetricCloudFragment,
    side: BackSide,
    transparent: true,
    depthWrite: false,
  });

  const clouds = new Mesh(new SphereGeometry(380, 32, 24), cloudMaterial);
  clouds.renderOrder = -1;
  clouds.frustumCulled = false;
  scene.add(clouds);

  let daylight = 0.12;
  const skyIntensityUniform = sky.material.userData.skyIntensityUniform as
    | { value: number }
    | undefined;

  const syncSunPosition = (sun: DirectionalLight) => {
    _sunDir.copy(sun.position).sub(sun.target.position).normalize();
    _sunWorld.copy(_sunDir).multiplyScalar(SKY_SCALE);
    skyUniforms['sunPosition'].value.copy(_sunWorld);
    cloudMaterial.uniforms['sunDirection'].value.copy(_sunDir);
  };

  const applyDaylight = () => {
    cloudMaterial.uniforms['daylight'].value = daylight;
    skyUniforms['turbidity'].value = 6 + daylight * 4;
    skyUniforms['rayleigh'].value = 1.2 + daylight * 1.8;
    if (skyIntensityUniform) {
      skyIntensityUniform.value = 0.5 + daylight * 0.4;
    }
  };

  applyDaylight();

  return {
    update(sun, camera, elapsed) {
      cloudMaterial.uniforms['time'].value = elapsed;
      cloudMaterial.uniforms['uCloudCameraPos'].value.copy(camera.position);
      syncSunPosition(sun);
    },
    setDaylight(factor) {
      daylight = Math.max(0, Math.min(1, factor));
      applyDaylight();
    },
    dispose() {
      scene.remove(sky);
      scene.remove(clouds);
      sky.geometry.dispose();
      sky.material.dispose();
      clouds.geometry.dispose();
      cloudMaterial.dispose();
    },
  };
}
