// @ts-nocheck — TSL node typings incomplete in three r186
// src/rendering/weather/rainStreaks.ts — falling rain: thin streaks animated entirely in the shader
//
// A box of `COUNT` streaks follows the camera. Each streak has a fixed random seed; where it is comes from
// the seed, the time and the box centre, so a streak stays put in the world while the camera moves and falls
// at `FALL_MPS`. `uDensity` (the rain) shows the first share of them. Nothing is uploaded after the start.
import {
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedMesh,
  PlaneGeometry,
  Vector3,
} from 'three';
import {
  attribute,
  cameraPosition,
  distance,
  float,
  fract,
  length,
  mix,
  smoothstep,
  step,
  time,
  uniform,
  vec2,
  vec3,
} from 'three/tsl';
import { SpriteNodeMaterial } from 'three/webgpu';
import { WEATHER } from '../../config/weather';
import { propShadowUniforms } from '../../world/mapProps/config/mapPropShadowUniforms';

const S = WEATHER.LOOK.STREAKS;

export interface RainStreaks {
  readonly mesh: InstancedMesh;
  /** Rain 0..1 and the centre of the box (the camera, pushed a little ahead). */
  update: (rain01: number, center: Vector3) => void;
  dispose: () => void;
}

export function createRainStreaks(): RainStreaks {
  const uCenter = uniform(new Vector3());
  const uDensity = uniform(0);
  const iSeed = attribute('iSeed', 'vec4');

  const box = float(S.BOX_M);
  const height = float(S.HEIGHT_M);
  // a lattice fixed in the world: the box follows the camera, the streaks do not
  const u = fract(iSeed.x.sub(uCenter.x.div(box)));
  const w = fract(iSeed.z.sub(uCenter.z.div(box)));
  const v = fract(iSeed.y.sub(time.mul(float(S.FALL_MPS).div(height))));
  const x = uCenter.x.add(u.sub(0.5).mul(box));
  const z = uCenter.z.add(w.sub(0.5).mul(box));
  const y = uCenter.y.add(v.sub(0.5).mul(height));
  const position = vec3(x, y, z);

  const fromCentre = length(vec2(u.sub(0.5), w.sub(0.5)).mul(2));
  const edge = float(1).sub(smoothstep(float(0.55), float(1), fromCentre));
  const near = smoothstep(float(1.5), float(5), distance(position, cameraPosition));
  const shown = step(iSeed.w, uDensity);
  const { uDaylight, uNightSkyDaylight } = propShadowUniforms;
  const day = smoothstep(uNightSkyDaylight, float(1), uDaylight);

  const material = new SpriteNodeMaterial();
  material.name = 'weather_rain';
  material.transparent = true;
  material.depthWrite = false;
  material.fog = false;
  material.positionNode = position;
  material.scaleNode = vec3(float(S.WIDTH_M), float(S.LENGTH_M), 1);
  material.colorNode = mix(vec3(0.07, 0.08, 0.11), vec3(0.78, 0.84, 0.92), day);
  material.opacityNode = shown.mul(edge).mul(near).mul(float(S.ALPHA));

  const seeds = new InstancedBufferAttribute(new Float32Array(S.COUNT * 4), 4);
  seeds.setUsage(DynamicDrawUsage);
  // a fixed, well-spread set of seeds (a golden-ratio sequence in each channel)
  for (let i = 0; i < S.COUNT; i++) {
    const g = (k: number) => (0.5 + i * k) % 1;
    seeds.setXYZW(
      i,
      g(0.7548776662466927),
      g(0.5698402909980532),
      g(0.8191725133961645),
      (i + 0.5) / S.COUNT,
    );
  }
  seeds.needsUpdate = true;

  const geometry = new PlaneGeometry(1, 1);
  geometry.setAttribute('iSeed', seeds);
  const mesh = new InstancedMesh(geometry, material, S.COUNT);
  mesh.name = 'weatherRain';
  mesh.count = S.COUNT;
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.renderOrder = 6;
  mesh.visible = false;

  return {
    mesh,
    update: (rain01, center) => {
      uDensity.value = rain01;
      uCenter.value.copy(center);
      mesh.visible = rain01 > 0.01;
    },
    dispose: () => {
      geometry.dispose();
      material.dispose();
    },
  };
}
