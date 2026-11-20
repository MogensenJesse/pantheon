// @ts-nocheck — TSL node typings incomplete in three r186
// src/rendering/weather/rainStreaks.ts — falling rain: thin streaks animated entirely in the shader
//
// A box of `COUNT` streaks follows the camera. Each streak has a fixed random seed; where it is comes from
// the seed, the time and the box centre, so a streak stays put in the world while the camera moves and falls
// at `FALL_MPS`. `uDensity` (the rain) shows the first share of them. Above the snow line `uSnow` turns that share of the
// streaks into slow, swaying white flakes. Nothing is uploaded after the start.
import { InstancedBufferAttribute, InstancedMesh, PlaneGeometry, Vector3 } from 'three';
import {
  attribute,
  cameraPosition,
  cos,
  distance,
  float,
  fract,
  length,
  mix,
  sin,
  smoothstep,
  step,
  time,
  uniform,
  uv,
  vec2,
  vec3,
} from 'three/tsl';
import { SpriteNodeMaterial } from 'three/webgpu';
import { WEATHER } from '../../config/weather';
import { propShadowUniforms } from '../../world/mapProps/config/mapPropShadowUniforms';

const S = WEATHER.LOOK.STREAKS;
const F = WEATHER.LOOK.FLAKES;

export interface RainStreaks {
  readonly mesh: InstancedMesh;
  /**
   * Rain 0..1, the centre of the box (the camera, pushed a little ahead) and the share of the precipitation that is snow
   * (0..1): that share of the streaks are flakes, chosen per streak so a mixed sky shows both.
   */
  update: (rain01: number, center: Vector3, snowShare01: number) => void;
  dispose: () => void;
}

export function createRainStreaks(): RainStreaks {
  const uCenter = uniform(new Vector3());
  const uDensity = uniform(0);
  const uSnow = uniform(0);
  const iSeed = attribute('iSeed', 'vec4');
  // this streak is a flake while the snow share is above its own number (not the density one: that would show flakes first)
  const flake = step(fract(iSeed.x.mul(9.1).add(iSeed.z.mul(4.7))), uSnow);

  const box = float(S.BOX_M);
  const height = float(S.HEIGHT_M);
  // a lattice fixed in the world: the box follows the camera, the streaks do not
  const u = fract(iSeed.x.sub(uCenter.x.div(box)));
  const w = fract(iSeed.z.sub(uCenter.z.div(box)));
  const fall = mix(float(S.FALL_MPS), float(F.FALL_MPS), flake);
  const v = fract(iSeed.y.sub(time.mul(fall.div(height))));
  // flakes drift a little from side to side as they fall
  const sway = flake.mul(F.SWAY_M);
  const x = uCenter.x
    .add(u.sub(0.5).mul(box))
    .add(sin(time.mul(0.8).add(iSeed.y.mul(40))).mul(sway));
  const z = uCenter.z
    .add(w.sub(0.5).mul(box))
    .add(cos(time.mul(0.7).add(iSeed.x.mul(40))).mul(sway));
  const y = uCenter.y.add(v.sub(0.5).mul(height));
  const position = vec3(x, y, z);

  const fromCentre = length(vec2(u.sub(0.5), w.sub(0.5)).mul(2));
  const edge = float(1).sub(smoothstep(float(0.55), float(1), fromCentre));
  const near = smoothstep(float(1.5), float(5), distance(position, cameraPosition));
  // the mesh holds `COUNT_MUL` times the rain's streaks for the flakes: rain shows the first `COUNT` of them
  const shown = mix(step(iSeed.w, uDensity.div(F.COUNT_MUL)), step(iSeed.w, uDensity), flake);
  const { uDaylight, uNightSkyDaylight } = propShadowUniforms;
  const day = smoothstep(uNightSkyDaylight, float(1), uDaylight);

  const material = new SpriteNodeMaterial();
  material.name = 'weather_rain';
  material.transparent = true;
  material.depthWrite = false;
  material.fog = false;
  material.positionNode = position;
  material.scaleNode = vec3(
    mix(float(S.WIDTH_M), float(F.SIZE_M), flake),
    mix(float(S.LENGTH_M), float(F.SIZE_M), flake),
    1,
  );
  const rainColour = mix(vec3(0.07, 0.08, 0.11), vec3(0.78, 0.84, 0.92), day);
  const flakeColour = mix(vec3(0.26, 0.29, 0.36), vec3(0.96, 0.98, 1), day);
  material.colorNode = mix(rainColour, flakeColour, flake);
  // a flake is a soft round dot, not the square sprite
  const round = float(1).sub(smoothstep(float(0.3), float(0.5), length(uv().sub(0.5))));
  const shape = mix(float(1), round, flake);
  material.opacityNode = shown
    .mul(edge)
    .mul(near)
    .mul(shape)
    .mul(mix(float(S.ALPHA), float(F.ALPHA), flake));

  const count = Math.round(S.COUNT * F.COUNT_MUL);
  const seeds = new InstancedBufferAttribute(new Float32Array(count * 4), 4);
  // a fixed, well-spread set of seeds (a golden-ratio sequence in each channel)
  for (let i = 0; i < count; i++) {
    const g = (k: number) => (0.5 + i * k) % 1;
    seeds.setXYZW(
      i,
      g(0.7548776662466927),
      g(0.5698402909980532),
      g(0.8191725133961645),
      (i + 0.5) / count,
    );
  }
  seeds.needsUpdate = true;

  const geometry = new PlaneGeometry(1, 1);
  geometry.setAttribute('iSeed', seeds);
  const mesh = new InstancedMesh(geometry, material, count);
  mesh.name = 'weatherRain';
  mesh.count = count;
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.renderOrder = 6;
  mesh.visible = false;

  return {
    mesh,
    update: (rain01, center, snowShare01) => {
      uDensity.value = rain01;
      uSnow.value = snowShare01;
      uCenter.value.copy(center);
      mesh.visible = rain01 > 0.01;
    },
    dispose: () => {
      geometry.dispose();
      material.dispose();
    },
  };
}
