// @ts-nocheck — TSL node parameter typings incomplete in r185
// src/rendering/atmosphere/volumetricClouds/tsl/cloudMarchTsl.ts — view + light march (Simon Dev port, no SDF in Phase 2)
import type { PerspectiveCamera } from 'three';
import { Vector3 } from 'three';
import {
  bool,
  cameraPosition,
  cameraProjectionMatrixInverse,
  cameraViewMatrix,
  clamp,
  distance,
  dot,
  exp,
  Fn,
  float,
  fract,
  getViewPosition,
  If,
  int,
  interleavedGradientNoise,
  Loop,
  max,
  min,
  mix,
  normalize,
  not,
  PI,
  pow,
  reference,
  screenUV,
  smoothstep,
  transformDirection,
  uniform,
  vec2,
  vec3,
  vec4,
} from 'three/tsl';
import { VISUAL } from '../../../../config/visualTuning';
import type { createSampleCloudDensityFn } from './cloudDensityTsl';

const GOLDEN_RATIO = 1.61803398875;
const EXTINCTION = vec3(0.8, 0.8, 1.0);
const DUAL_LOBE_WEIGHT = 0.7;
const PHASE_G = 0.3;
const MAX_VIEW_STEPS = 48;
const MAX_LIGHT_STEPS = 8;

export interface CloudMarchUniforms {
  uBoundsMin: ReturnType<typeof uniform>;
  uBoundsMax: ReturnType<typeof uniform>;
  uSunDirection: ReturnType<typeof uniform>;
  uSunColor: ReturnType<typeof uniform>;
  uSunIntensity: ReturnType<typeof uniform>;
  uAmbientStrength: ReturnType<typeof uniform>;
  uViewSteps: ReturnType<typeof uniform>;
  uLightSteps: ReturnType<typeof uniform>;
  uLightDistance: ReturnType<typeof uniform>;
  uFrame: ReturnType<typeof uniform>;
}

export function createCloudMarchUniforms(): CloudMarchUniforms {
  const c = VISUAL.sky.volumetricClouds;
  return {
    uBoundsMin: uniform(new Vector3(-c.volumeHalfExtentM, c.baseHeightM, -c.volumeHalfExtentM)),
    uBoundsMax: uniform(new Vector3(c.volumeHalfExtentM, c.topHeightM, c.volumeHalfExtentM)),
    uSunDirection: uniform(new Vector3(-1, 0.2, 0)),
    uSunColor: uniform(new Vector3(1, 1, 1)),
    uSunIntensity: uniform(1),
    uAmbientStrength: uniform(0.12),
    uViewSteps: uniform(c.viewStepsMax),
    uLightSteps: uniform(c.lightSteps),
    uLightDistance: uniform(80),
    uFrame: uniform(0),
  };
}

export function syncCloudMarchUniforms(
  uniforms: CloudMarchUniforms,
  boundsMin: Vector3,
  boundsMax: Vector3,
  sunDirection: Vector3,
  sunColor: Vector3,
  sunIntensity: number,
  ambientStrength: number,
  frame: number,
): void {
  uniforms.uBoundsMin.value.copy(boundsMin);
  uniforms.uBoundsMax.value.copy(boundsMax);
  uniforms.uSunDirection.value.copy(sunDirection).normalize();
  uniforms.uSunColor.value.copy(sunColor);
  uniforms.uSunIntensity.value = sunIntensity;
  uniforms.uAmbientStrength.value = ambientStrength;
  uniforms.uFrame.value = frame;
}

export interface CloudMarchGraphInputs {
  sceneDepth: any;
  camera: PerspectiveCamera;
  sampleCloudDensity: ReturnType<typeof createSampleCloudDensityFn>;
  marchUniforms: CloudMarchUniforms;
}

/** Full-screen cloud march — outputs vec4(scatter rgb, mean transmittance). */
export function createCloudMarchColorNode(inputs: CloudMarchGraphInputs) {
  const { sceneDepth, camera, marchUniforms, sampleCloudDensity } = inputs;
  const {
    uBoundsMin,
    uBoundsMax,
    uSunDirection,
    uSunColor,
    uSunIntensity,
    uAmbientStrength,
    uViewSteps,
    uLightSteps,
    uLightDistance,
    uFrame,
  } = marchUniforms;

  const henyeyGreenstein = Fn(([g, mu]) => {
    const gg = g.mul(g);
    const denom = float(1.0).add(gg).sub(g.mul(2.0).mul(mu));
    return float(1.0)
      .div(float(4.0).mul(PI))
      .mul(
        float(1.0)
          .sub(gg)
          .div(pow(denom, float(1.5))),
      );
  });

  const dualHenyeyGreenstein = Fn(([g, mu]) =>
    mix(henyeyGreenstein(g.negate(), mu), henyeyGreenstein(g, mu), float(DUAL_LOBE_WEIGHT)),
  );

  const multipleOctaveScattering = Fn(([density, mu]) => {
    const a = float(1.0).toVar();
    const b = float(1.0).toVar();
    const cPhase = float(1.0).toVar();
    const luminance = vec3(0).toVar();

    for (let octave = 0; octave < 4; octave += 1) {
      const phase = dualHenyeyGreenstein(float(PHASE_G).mul(cPhase), mu);
      const beers = exp(density.negate().mul(EXTINCTION).mul(a));
      luminance.addAssign(b.mul(phase).mul(beers));
      a.mulAssign(float(0.2));
      b.mulAssign(float(0.2));
      cPhase.mulAssign(float(0.5));
    }

    return luminance;
  });

  const intersectAabb = Fn(([origin, dir, bMin, bMax]) => {
    const invDir = vec3(float(1.0)).div(dir);
    const t0 = bMin.sub(origin).mul(invDir);
    const t1 = bMax.sub(origin).mul(invDir);
    const tMin = min(t0, t1);
    const tMax = max(t0, t1);
    const tNear = max(max(tMin.x, tMin.y), tMin.z);
    const tFar = min(min(tMax.x, tMax.y), tMax.z);
    return vec2(tNear, tFar);
  });

  const insideAabb = Fn(([origin, bMin, bMax]) => {
    const inMin = origin.x
      .greaterThanEqual(bMin.x)
      .and(origin.y.greaterThanEqual(bMin.y))
      .and(origin.z.greaterThanEqual(bMin.z));
    const inMax = origin.x
      .lessThan(bMax.x)
      .and(origin.y.lessThan(bMax.y))
      .and(origin.z.lessThan(bMax.z));
    return inMin.and(inMax);
  });

  const calculateLightEnergy = Fn(([lightOrigin, lightDir, mu]) => {
    const stepLength = uLightDistance.div(uLightSteps);
    const lightRayDensity = float(0).toVar();
    const distAccumulated = float(0).toVar();
    const lightDone = bool(false).toVar();

    Loop({ start: int(0), end: int(MAX_LIGHT_STEPS), type: 'int', condition: '<' }, ({ i }) => {
      If(lightDone.not().and(i.lessThan(uLightSteps)), () => {
        const lightSamplePos = lightOrigin.add(lightDir.mul(distAccumulated));
        lightRayDensity.addAssign(sampleCloudDensity(lightSamplePos).mul(stepLength));
        distAccumulated.addAssign(stepLength);
        If(distAccumulated.greaterThanEqual(uLightDistance), () => {
          lightDone.assign(true);
        });
      });
    });

    const beersLaw = multipleOctaveScattering(lightRayDensity, mu);
    const powder = float(1.0).sub(exp(lightRayDensity.negate().mul(2.0).mul(EXTINCTION)));
    const muRemap = smoothstep(float(-1.0), float(1.0), mu);
    return beersLaw.mul(mix(powder.mul(2.0), vec3(1.0), muRemap));
  });

  const cameraMatrixWorld = reference('matrixWorld', 'mat4', camera);
  const cameraProjectionInverse = reference('projectionMatrixInverse', 'mat4', camera);
  const skyDepthCutoff = float(VISUAL.bloom.SKY_DEPTH_START);

  const cloudMarch = Fn(() => {
    const uv = screenUV;
    const depthSample = sceneDepth.sample(uv).r;
    const isSkyPixel = depthSample.greaterThanEqual(skyDepthCutoff);
    const sceneViewPos = getViewPosition(uv, depthSample, cameraProjectionInverse);
    const sceneWorldPos = cameraMatrixWorld.mul(sceneViewPos).xyz;
    const sceneHitDist = distance(cameraPosition, sceneWorldPos);

    const ndc = vec4(uv.x.mul(2.0).sub(1.0), uv.y.mul(2.0).sub(1.0), float(1.0), float(1.0));
    const viewPoint = cameraProjectionMatrixInverse.mul(ndc);
    const viewDir = normalize(viewPoint.xyz.div(viewPoint.w));
    const rayDir = normalize(transformDirection(viewDir, cameraViewMatrix));

    const hit = intersectAabb(cameraPosition, rayDir, uBoundsMin, uBoundsMax);
    const tNear = hit.x;
    const tFar = hit.y;

    const scatter = vec3(0).toVar();
    const transmittance = vec3(1).toVar();
    const outColor = vec4(0).toVar();

    If(tNear.greaterThanEqual(tFar), () => {
      outColor.assign(vec4(scatter, float(1.0)));
    }).Else(() => {
      const startT = float(0).toVar();
      If(not(insideAabb(cameraPosition, uBoundsMin, uBoundsMax)), () => {
        startT.assign(max(tNear, float(0)));
      });

      const span = tFar.sub(startT);
      const stepLen = span.div(uViewSteps);
      const blueNoise = fract(
        interleavedGradientNoise(uv.mul(vec2(1.0).add(uv))).add(uFrame.mul(GOLDEN_RATIO)),
      );
      const distTravelled = startT.add(stepLen.mul(blueNoise)).toVar();
      const marchDone = bool(false).toVar();

      const mu = dot(rayDir, uSunDirection);
      const sunLight = uSunColor.mul(uSunIntensity.mul(8.0));
      const ambient = vec3(uAmbientStrength).mul(uSunColor);

      Loop({ start: int(0), end: int(MAX_VIEW_STEPS), type: 'int', condition: '<' }, ({ i }) => {
        If(
          marchDone
            .not()
            .and(i.lessThan(uViewSteps))
            .and(distTravelled.lessThanEqual(tFar)),
          () => {
            If(isSkyPixel.not().and(distTravelled.greaterThan(sceneHitDist)), () => {
              marchDone.assign(true);
            }).Else(() => {
              const samplePos = cameraPosition.add(rayDir.mul(distTravelled));
              const extinction = sampleCloudDensity(samplePos);
              If(extinction.lessThan(float(0.01)), () => {
                distTravelled.addAssign(stepLen);
              }).Else(() => {
                const luminance = ambient.add(
                  sunLight.mul(calculateLightEnergy(samplePos, uSunDirection, mu)),
                );
                const stepExt = extinction.mul(stepLen);
                const sampleTrans = exp(stepExt.negate().mul(EXTINCTION));
                const integScatt = luminance.mul(float(1.0).sub(sampleTrans));
                scatter.addAssign(transmittance.mul(integScatt));
                transmittance.mulAssign(sampleTrans);

                If(transmittance.x.lessThan(float(0.01)), () => {
                  transmittance.assign(vec3(0));
                  marchDone.assign(true);
                }).Else(() => {
                  distTravelled.addAssign(stepLen);
                });
              });
            });
          },
        );
      });

      const meanTrans = transmittance.x.add(transmittance.y).add(transmittance.z).div(3.0);
      outColor.assign(vec4(scatter, clamp(meanTrans, float(0), float(1))));
    });

    return outColor;
  });

  return cloudMarch;
}
