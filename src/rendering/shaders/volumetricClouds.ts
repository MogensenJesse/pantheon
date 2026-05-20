/* eslint-disable @typescript-eslint/ban-ts-comment -- TSL Fn typings incomplete in r176 */
// @ts-nocheck — TSL Fn parameter typings incomplete in r176
// src/rendering/shaders/volumetricClouds.ts — cloud shell density (TSL / WebGPU)
import {
  Fn,
  Loop,
  dot,
  float,
  floor,
  fract,
  max,
  mix,
  normalize,
  positionWorld,
  pow,
  sin,
  smoothstep,
  uniform,
  vec3,
  vec4,
} from 'three/tsl';
import { Vector3 } from 'three';

// Cloud band: Y range (world units). Island terrain tops out around y=200.
// Clouds live above that in the sky portion of the sphere.
const CLOUD_Y_MIN = 50;   // fade in from y=50
const CLOUD_Y_PEAK = 130; // full opacity from y=130
const CLOUD_Y_TOP = 340;  // fade out toward top of shell

const hash = Fn(([p]) => fract(sin(dot(p, vec3(127.1, 311.7, 74.7))).mul(43758.5453)));

const noise = Fn(([p]) => {
  const i = floor(p);
  const f = fract(p);
  const u = f.mul(f).mul(float(3).sub(f.mul(2)));
  const n000 = hash(i);
  const n100 = hash(i.add(vec3(1, 0, 0)));
  const n010 = hash(i.add(vec3(0, 1, 0)));
  const n110 = hash(i.add(vec3(1, 1, 0)));
  const n001 = hash(i.add(vec3(0, 0, 1)));
  const n101 = hash(i.add(vec3(1, 0, 1)));
  const n011 = hash(i.add(vec3(0, 1, 1)));
  const n111 = hash(i.add(vec3(1, 1, 1)));
  const nx00 = mix(n000, n100, u.x);
  const nx10 = mix(n010, n110, u.x);
  const nx01 = mix(n001, n101, u.x);
  const nx11 = mix(n011, n111, u.x);
  return mix(mix(nx00, nx10, u.y), mix(nx01, nx11, u.y), u.z);
});

const fbm = Fn(([p]) => {
  const v = float(0).toVar();
  const a = float(0.5).toVar();
  const q = p.toVar();
  Loop({ start: 0, end: 3, type: 'int', condition: '<' }, () => {
    v.addAssign(a.mul(noise(q)));
    q.mulAssign(2.02);
    a.mulAssign(0.5);
  });
  return v;
});

export function createVolumetricCloudNodes() {
  const sunDirection = uniform(new Vector3(0.4, 0.25, 0.35).normalize());
  const uCloudCameraPos = uniform(new Vector3());
  const time = uniform(0);
  const daylight = uniform(0.12);
  const cloudCoverage = uniform(0.42);

  const cloudColorNode = Fn(() => {
    const p = positionWorld;

    // Only show clouds in the sky — fade in above CLOUD_Y_MIN, fade out near top of shell.
    // This completely zeros out all fragments on the lower hemisphere.
    const yFadeIn = smoothstep(float(CLOUD_Y_MIN), float(CLOUD_Y_PEAK), p.y);
    const yFadeOut = float(1).sub(smoothstep(float(CLOUD_Y_TOP), float(CLOUD_Y_TOP + 40), p.y));
    const skyMask = yFadeIn.mul(yFadeOut);

    // Noise-driven cloud density
    const wind = time.mul(0.01);
    const q = p.mul(0.005).add(vec3(wind, wind.mul(0.25), wind.mul(0.55)));
    const n = fbm(q);
    // Sharp threshold gives distinct cloud shapes rather than uniform haze
    const density = smoothstep(cloudCoverage, cloudCoverage.add(0.18), n).mul(skyMask);

    // Sun scattering / phase
    const sunDir = normalize(sunDirection);
    const rd = normalize(p.sub(uCloudCameraPos));
    const phase = float(0.45).add(float(0.55).mul(pow(max(dot(rd, sunDir), 0), 5)));

    // Brighter whites for daylight, dimmer grays at night
    const cloudLight = mix(vec3(0.72, 0.74, 0.78), vec3(1.0, 0.98, 0.95), phase);
    const cloudNight = vec3(0.18, 0.20, 0.26);
    const scatter = mix(cloudNight, cloudLight, max(daylight, float(0.25)));

    // Alpha: pure density — no floor, so lower hemisphere is fully transparent
    const alpha = density.mul(max(daylight, float(0.35)));
    return vec4(scatter, alpha);
  });

  return {
    sunDirection,
    uCloudCameraPos,
    time,
    daylight,
    cloudCoverage,
    cloudColorNode,
  };
}
