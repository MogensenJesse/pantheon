// src/entities/guideLine/guideLineMesh.ts — fixed-capacity HDR glow ribbon
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  Mesh,
  type Scene,
  Vector3,
} from 'three';
import {
  abs,
  attribute,
  clamp,
  exp,
  float,
  mix,
  positionLocal,
  positionWorld,
  uniform,
  vec3,
} from 'three/tsl';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import type { GuideLineSettings } from '../../config/visual/guideLine';
import { GLOW_MESH_RENDER_ORDER, uHdrBloomScale } from '../../rendering/glowMaterial';
import { enableWaterReflectionLayer } from '../../rendering/layers/waterReflectionLayers';
import type { GuideSample } from './guidePolyline';
import {
  guideBreathFadeTsl,
  guideFloatOffsetTsl,
  guideNoiseDriftTsl,
  guidePathFadeTsl,
  guideTipGlowTsl,
  guideTravelColorTsl,
  guideTravelPacketTsl,
} from './guidePulseTsl';

type TslNode = any;

export interface GuideLineMesh {
  setVisible: (visible: boolean) => void;
  syncUniforms: (
    settings: GuideLineSettings,
    cam: Vector3,
    player: Vector3,
    closestAlong: number,
    maxAlong: number,
  ) => void;
  writePoints: (points: GuideSample[], width: number, softness: number) => void;
  dispose: () => void;
}

const _right = new Vector3();
const _tangent = new Vector3();
const _up = new Vector3(0, 1, 0);

export function createGuideLineMesh(scene: Scene, sampleCap: number): GuideLineMesh {
  const cap = Math.max(2, sampleCap);
  const vertCount = cap * 2;
  const maxIndexCount = (cap - 1) * 6;
  const positions = new Float32Array(vertCount * 3);
  const alongs = new Float32Array(vertCount);
  const across = new Float32Array(vertCount);
  for (let i = 0; i < cap; i++) {
    across[i * 2] = -1;
    across[i * 2 + 1] = 1;
  }
  const indices = new Uint32Array(maxIndexCount);
  for (let i = 0; i < cap - 1; i++) {
    const a = i * 2;
    const b = a + 1;
    const c = a + 2;
    const d = a + 3;
    const o = i * 6;
    indices[o] = a;
    indices[o + 1] = b;
    indices[o + 2] = c;
    indices[o + 3] = b;
    indices[o + 4] = d;
    indices[o + 5] = c;
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('along', new BufferAttribute(alongs, 1));
  geometry.setAttribute('across', new BufferAttribute(across, 1));
  geometry.setIndex(new BufferAttribute(indices, 1));
  geometry.setDrawRange(0, 0);

  const uCamPos = uniform(new Vector3());
  const uPlayerPos = uniform(new Vector3());
  const uFadeStart = uniform(16);
  const uFadeEnd = uniform(64);
  const uNearFadeStart = uniform(2.4);
  const uNearFadeEnd = uniform(5.5);
  const uClosestAlong = uniform(0);
  const uMaxAlong = uniform(1);
  const uIntensity = uniform(0.2);
  const uColorA = uniform(new Color(0xffcc44));
  const uColorB = uniform(new Color(0x44e8ff));
  const uColorC = uniform(new Color(0xd080ff));
  const uColorTravel = uniform(18);
  const uPulseSpeed = uniform(0.35);
  const uPulseAmplitude = uniform(0.42);
  const uPulseIdle = uniform(0.07);
  const uPulseSpacing = uniform(10);
  const uPulseLength = uniform(2.5);
  const uPulseSharpness = uniform(6);
  const uFloatAmp = uniform(0.12);
  const uFloatSpeed = uniform(2);
  const uFloatWave = uniform(32);
  const uSoftness = uniform(0.55);
  const uNoiseAmp = uniform(0.18);
  const uNoiseSpeed = uniform(0.35);
  const uNoiseScale = uniform(0.08);
  const uTipGlowM = uniform(6);
  const uTipGlowBoost = uniform(0.85);
  const uBreathSpeed = uniform(0.65);
  const uBreathAmount = uniform(1);

  const along = attribute('along', 'float') as TslNode;
  const acrossAttr = attribute('across', 'float') as TslNode;
  const packet = guideTravelPacketTsl(
    along,
    uClosestAlong,
    uPulseSpeed,
    uPulseSpacing,
    uPulseLength,
    uPulseSharpness,
  );
  const contrast = clamp(uPulseAmplitude, 0, 1);
  const trough = mix(float(1), clamp(uPulseIdle, 0, 1), contrast);
  const peak = mix(float(1), float(1).add(contrast.mul(0.5)), contrast);
  const brightness = mix(trough, peak, packet);
  const yWave = guideFloatOffsetTsl(along, uFloatAmp, uFloatSpeed, uFloatWave);
  const drift = guideNoiseDriftTsl(along, uMaxAlong, uNoiseAmp, uNoiseSpeed, uNoiseScale);
  const tip = guideTipGlowTsl(along, uMaxAlong, uTipGlowM, uTipGlowBoost);
  const breath = guideBreathFadeTsl(uBreathSpeed, uBreathAmount);
  const haloColor = guideTravelColorTsl(
    along,
    uPulseSpeed,
    uColorTravel,
    uColorA as TslNode,
    uColorB as TslNode,
    uColorC as TslNode,
  );

  const material = new MeshBasicNodeMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    side: DoubleSide,
  });
  material.fog = false;
  material.positionNode = positionLocal.add(vec3(0, 1, 0).mul(yWave)).add(drift);

  const pathFade = guidePathFadeTsl({
    worldPos: positionWorld,
    along,
    camPos: uCamPos,
    playerPos: uPlayerPos,
    closestAlong: uClosestAlong,
    fadeStart: uFadeStart,
    fadeEnd: uFadeEnd,
    nearFadeStart: uNearFadeStart,
    nearFadeEnd: uNearFadeEnd,
  });
  const r = abs(acrossAttr);
  const soft = clamp(uSoftness, 0, 2).div(2);
  const coreK = mix(float(18), float(8), soft);
  const haloK = mix(float(3.8), float(1.15), soft);
  const core = exp(r.mul(r).mul(coreK.mul(-1)));
  const halo = exp(r.mul(r).mul(haloK.mul(-1)));
  const hot = vec3(1.18, 1.1, 0.98);
  const rgb = mix(haloColor, hot, core);
  const edge = halo.add(core.mul(0.55));
  material.colorNode = rgb
    .mul(uIntensity)
    .mul(uHdrBloomScale)
    .mul(brightness)
    .mul(pathFade)
    .mul(edge)
    .mul(tip)
    .mul(breath);

  const mesh = new Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = GLOW_MESH_RENDER_ORDER;
  mesh.visible = false;
  enableWaterReflectionLayer(mesh);
  scene.add(mesh);

  const setVisible = (visible: boolean) => {
    mesh.visible = visible;
  };

  const syncUniforms = (
    settings: GuideLineSettings,
    cam: Vector3,
    player: Vector3,
    closestAlong: number,
    maxAlong: number,
  ) => {
    (uCamPos.value as Vector3).copy(cam);
    (uPlayerPos.value as Vector3).copy(player);
    uFadeStart.value = settings.fadeStartM;
    uFadeEnd.value = settings.fadeEndM;
    uNearFadeEnd.value = settings.playerNearFadeEndM;
    uNearFadeStart.value = Math.min(
      settings.playerNearFadeStartM,
      settings.playerNearFadeEndM * 0.5,
    );
    uClosestAlong.value = closestAlong;
    uMaxAlong.value = Math.max(maxAlong, 0.01);
    uIntensity.value = settings.hdrIntensity;
    (uColorA.value as Color).setHex(settings.emissiveHex);
    (uColorB.value as Color).setHex(settings.colorBHex);
    (uColorC.value as Color).setHex(settings.colorCHex);
    uColorTravel.value = settings.colorTravelM;
    uPulseSpeed.value = settings.pulseSpeed;
    uPulseAmplitude.value = settings.pulseAmplitude;
    uPulseIdle.value = settings.pulseIdle;
    uPulseSpacing.value = settings.pulseSpacingM;
    uPulseLength.value = settings.pulseLengthM;
    uPulseSharpness.value = settings.pulseSharpness;
    uFloatAmp.value = settings.floatAmp;
    uFloatSpeed.value = settings.floatSpeed;
    uFloatWave.value = settings.floatWaveM;
    uSoftness.value = settings.softness;
    uNoiseAmp.value = settings.noiseAmp;
    uNoiseSpeed.value = settings.noiseSpeed;
    uNoiseScale.value = settings.noiseScale;
    uTipGlowM.value = settings.tipGlowM;
    uTipGlowBoost.value = settings.tipGlowBoost;
    uBreathSpeed.value = settings.breathSpeed;
    uBreathAmount.value = settings.breathAmount;
  };

  const writePoints = (points: GuideSample[], width: number, softness: number) => {
    const n = Math.min(points.length, cap);
    if (n < 2) {
      geometry.setDrawRange(0, 0);
      mesh.visible = false;
      return;
    }
    const expand = 1 + Math.max(0, Math.min(2, softness)) * 1.4;
    const half = width * 0.5 * expand;
    const pos = geometry.getAttribute('position') as BufferAttribute;
    const alongAttr = geometry.getAttribute('along') as BufferAttribute;
    const arr = pos.array as Float32Array;
    const alongArr = alongAttr.array as Float32Array;
    for (let i = 0; i < n; i++) {
      const p = points[i]!;
      const prev = points[Math.max(0, i - 1)]!;
      const next = points[Math.min(n - 1, i + 1)]!;
      _tangent.set(next.x - prev.x, 0, next.z - prev.z);
      if (_tangent.lengthSq() < 1e-8) _tangent.set(1, 0, 0);
      _tangent.normalize();
      _right.crossVectors(_up, _tangent).normalize();
      const i0 = i * 6;
      const i1 = i0 + 3;
      arr[i0] = p.x - _right.x * half;
      arr[i0 + 1] = p.y;
      arr[i0 + 2] = p.z - _right.z * half;
      arr[i1] = p.x + _right.x * half;
      arr[i1 + 1] = p.y;
      arr[i1 + 2] = p.z + _right.z * half;
      alongArr[i * 2] = p.along;
      alongArr[i * 2 + 1] = p.along;
    }
    pos.needsUpdate = true;
    alongAttr.needsUpdate = true;
    geometry.setDrawRange(0, (n - 1) * 6);
    mesh.visible = true;
  };

  const dispose = () => {
    scene.remove(mesh);
    geometry.dispose();
    material.dispose();
  };

  return { setVisible, syncUniforms, writePoints, dispose };
}
