// src/entities/organicOrb/organicOrbTsl.ts — morph, viewport refraction fill, white fresnel rim
import {
  abs,
  atan,
  cameraPosition,
  clamp,
  dot,
  float,
  max,
  min,
  mix,
  modelWorldMatrix,
  normalize,
  normalLocal,
  positionLocal,
  pow,
  screenUV,
  sin,
  time,
  triNoise3D,
  vec2,
  vec3,
  vec4,
  viewportSafeUV,
  viewportSharedTexture,
} from 'three/tsl';
import { uHdrBloomScale } from '../../rendering/glowMaterial';
import { guideTravelLinearMaskTsl } from '../guideLine/guidePulseTsl';

type TslNode = any;

export interface OrganicOrbGraphUniforms {
  uFillOpacity: TslNode;
  uFillWhite: TslNode;
  uRefractStrength: TslNode;
  uRefractScale: TslNode;
  uNebula: TslNode;
  uCorePower: TslNode;
  uCoreAmount: TslNode;
  uRimPower: TslNode;
  uRimHdr: TslNode;
  uMorphAmp: TslNode;
  uMorphSpeed: TslNode;
  uMorphScale: TslNode;
  uMorphOriginMul: TslNode;
  uStretchDir: TslNode;
  uStretch: TslNode;
  uStretchAmp: TslNode;
  uStretchTrail: TslNode;
  uPulseSpeed: TslNode;
  uPulseSpacing: TslNode;
  uPulseLength: TslNode;
  uPulseIdle: TslNode;
  uPulseAmplitude: TslNode;
  uMeridianAmount: TslNode;
  uMeridianCount: TslNode;
}

export function buildOrganicOrbGraph(u: OrganicOrbGraphUniforms): {
  positionNode: TslNode;
  colorNode: TslNode;
  opacityNode: TslNode;
} {
  const {
    uFillOpacity,
    uFillWhite,
    uRefractStrength,
    uRefractScale,
    uNebula,
    uCorePower,
    uCoreAmount,
    uRimPower,
    uRimHdr,
    uMorphAmp,
    uMorphSpeed,
    uMorphScale,
    uMorphOriginMul,
    uStretchDir,
    uStretch,
    uStretchAmp,
    uStretchTrail,
    uPulseSpeed,
    uPulseSpacing,
    uPulseLength,
    uPulseIdle,
    uPulseAmplitude,
    uMeridianAmount,
    uMeridianCount,
  } = u;
  const viewportScene = viewportSharedTexture();

  const origin = modelWorldMatrix.mul(vec4(0, 0, 0, 1)).xyz;
  const originXZ = vec3(origin.x, float(0), origin.z).mul(uMorphOriginMul);
  const morphSeed = positionLocal.mul(uMorphScale).add(originXZ);
  const morphN = triNoise3D(morphSeed, float(0.25), time.mul(uMorphSpeed));
  const refractSeed = positionLocal.mul(uRefractScale).add(originXZ);

  const stretchDir = vec3(uStretchDir);
  const stretchAmt = float(uStretch);
  const along = dot(positionLocal, stretchDir);
  const stretch = float(1).add(stretchAmt.mul(uStretchAmp));
  const squash = float(1).div(max(stretch, float(0.001)).sqrt());
  const alongVec = stretchDir.mul(along);
  const body = alongVec.mul(stretch).add(positionLocal.sub(alongVec).mul(squash));
  const trail = stretchDir.mul(stretchAmt.mul(uStretchTrail).mul(-1));

  const nAlong = dot(normalLocal, stretchDir);
  const nAlongVec = stretchDir.mul(nAlong);
  const invStretch = float(1).div(max(stretch, float(0.001)));
  const invSquash = float(1).div(max(squash, float(0.001)));
  const nBody = normalize(nAlongVec.mul(invStretch).add(normalLocal.sub(nAlongVec).mul(invSquash)));
  const morphOff = nBody.mul(morphN.sub(0.5).mul(uMorphAmp));
  const localPos = body.add(trail).add(morphOff);
  const positionNode = localPos;

  const posWorld = modelWorldMatrix.mul(vec4(localPos, float(1))).xyz;
  const viewDir = normalize(cameraPosition.sub(posWorld));
  const nWorld = normalize(modelWorldMatrix.mul(vec4(nBody, float(0))).xyz);
  const nDotV = abs(dot(nWorld, viewDir)).clamp(0, 1);

  const nLocal = normalize(normalLocal);
  const equator = atan(nLocal.z, nLocal.x);
  const along01 = equator.div(6.283185307179586).add(0.5);
  const pulseAlong = along01.mul(max(uPulseSpacing, float(0.4)).mul(2));

  const packet = guideTravelLinearMaskTsl(
    pulseAlong,
    float(0),
    uPulseSpeed,
    uPulseSpacing,
    uPulseLength,
  );
  const contrast = clamp(uPulseAmplitude, 0, 1);
  const trough = mix(float(1), clamp(uPulseIdle, 0, 1), contrast);
  const rimPulse = mix(trough, float(1), packet);

  const rim = pow(float(1).sub(nDotV), max(uRimPower, float(0.4)));
  const core = pow(nDotV, max(uCorePower, float(1))).mul(uCoreAmount);

  const n1 = triNoise3D(refractSeed, float(0.3), time.mul(uMorphSpeed));
  const n2 = triNoise3D(
    refractSeed.add(vec3(17.2, 9.1, 4.3)),
    float(0.3),
    time.mul(uMorphSpeed).mul(1.13),
  );
  const offset = vec2(n1.sub(0.5), n2.sub(0.5)).mul(uRefractStrength);
  const sceneRgb = viewportScene.sample(viewportSafeUV(screenUV.add(offset))).rgb;
  const ldr = min(sceneRgb, vec3(1));

  const wisp = triNoise3D(refractSeed.mul(1.7), float(0.4), time.mul(uMorphSpeed).mul(0.7));
  const nebulaRgb = mix(vec3(0.06), vec3(0.14), wisp);
  const fillBase = mix(
    mix(ldr, nebulaRgb, clamp(uNebula, 0, 1).mul(wisp.mul(0.55).add(0.45))),
    vec3(1),
    clamp(uFillWhite, 0, 1),
  );
  const mer = pow(float(1).sub(abs(sin(equator.mul(max(uMeridianCount, float(1)))))), float(6)).mul(
    uMeridianAmount,
  );
  const fill = fillBase
    .mul(float(1).add(core))
    .add(vec3(1).mul(mer).mul(0.4))
    .mul(float(1).sub(rim.mul(0.35)));

  const rimRgb = vec3(1).mul(rim).mul(rimPulse).mul(uRimHdr).mul(uHdrBloomScale);
  const colorNode = fill.add(rimRgb);
  const opacityNode = mix(clamp(uFillOpacity, 0, 1), float(1), rim.saturate());

  return { positionNode, colorNode, opacityNode };
}
