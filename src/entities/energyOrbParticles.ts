// src/entities/energyOrbParticles.ts — idle halo + absorb burst sparkles for residue orbs
import {
  ClampToEdgeWrapping,
  DataTexture,
  DynamicDrawUsage,
  FloatType,
  InstancedBufferAttribute,
  NearestFilter,
  NoColorSpace,
  RGBAFormat,
  type Scene,
  Vector3,
} from 'three';
import {
  clamp,
  cos,
  cross,
  float,
  floor,
  instancedDynamicBufferAttribute,
  max,
  mix,
  normalize,
  select,
  sin,
  smoothstep,
  texture,
  uniform,
  vec2,
  vec3,
} from 'three/tsl';
import type { EnergyOrbParticleSettings } from '../config/visual/energyOrb';
import type { SparkleLookSettings } from '../config/visual/sparkleLook';
import { getLiveEnergyOrbParticleSettings } from './energyOrbParticleDevState';
import { createSparkleField } from './sparkleField';

export interface EnergyOrbSparkleSource {
  worldPos: Vector3;
  absorbed: boolean;
}

export interface EnergyOrbParticles {
  syncIdle: (orbs: readonly EnergyOrbSparkleSource[]) => void;
  burst: (origin: Vector3, playerPos: Vector3) => void;
  update: (elapsed: number, playerPos: Vector3) => void;
  dispose: () => void;
}

function lookFromIdle(p: EnergyOrbParticleSettings): SparkleLookSettings {
  return {
    sizeM: p.particleSizeM,
    spreadM: p.spreadM,
    idle: p.particleIdle,
    hdr: p.particleHdr,
    spin: p.particleSpin,
    breathAmount: p.breathAmount,
    breathSpeed: p.breathSpeed,
    colorAHex: p.emissiveHex,
    colorBHex: p.colorBHex,
    colorCHex: p.colorCHex,
    colorTravelM: p.colorTravelM,
    pulseSpeed: p.pulseSpeed,
    pulseSpacingM: p.pulseSpacingM,
    pulseLengthM: p.pulseLengthM,
  };
}

function lookFromBurst(p: EnergyOrbParticleSettings): SparkleLookSettings {
  return {
    sizeM: p.burstSizeM,
    spreadM: 0.04,
    idle: 1,
    hdr: p.burstHdr,
    spin: p.burstSpin,
    breathAmount: 0,
    breathSpeed: 1,
    colorAHex: p.emissiveHex,
    colorBHex: p.colorBHex,
    colorCHex: p.colorCHex,
    colorTravelM: p.colorTravelM,
    pulseSpeed: 1.15,
    pulseSpacingM: 0.7,
    pulseLengthM: 0.28,
  };
}

function fract(x: number): number {
  return x - Math.floor(x);
}

function fibonacciDir(i: number, n: number): { x: number; y: number; z: number } {
  const y = 1 - ((i + 0.5) / Math.max(n, 1)) * 2;
  const r = Math.sqrt(Math.max(0, 1 - y * y));
  const theta = i * 2.399963229728653;
  return { x: r * Math.cos(theta), y, z: r * Math.sin(theta) };
}

function createOrbTexture(orbCount: number): DataTexture {
  const width = Math.max(2, orbCount);
  const data = new Float32Array(width * 4);
  const tex = new DataTexture(data, width, 1, RGBAFormat, FloatType);
  tex.minFilter = NearestFilter;
  tex.magFilter = NearestFilter;
  tex.wrapS = ClampToEdgeWrapping;
  tex.wrapT = ClampToEdgeWrapping;
  tex.colorSpace = NoColorSpace;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

export function createEnergyOrbParticles(scene: Scene, orbCount: number): EnergyOrbParticles {
  const settings = getLiveEnergyOrbParticleSettings();
  const perOrb = Math.max(1, settings.idleCountPerOrb);
  const idleCount = Math.max(8, perOrb * Math.max(orbCount, 1));
  const burstCount = Math.max(8, settings.burstCount);
  const concurrent = Math.max(1, settings.burstConcurrent);
  const burstCapacity = burstCount * concurrent;
  const texWidth = Math.max(2, orbCount);

  const orbTex = createOrbTexture(orbCount);
  const orbData = orbTex.image.data as Float32Array;
  const uPerOrb = float(perOrb);
  const uIdleRadius = uniform(settings.idleRadiusM);
  const uOrbitM = uniform(Math.max(settings.pulseSpacingM * 2, 0.8));
  const uOrbCount = uniform(orbCount);

  const pathMap = texture(orbTex);
  const idle = createSparkleField({
    parent: scene,
    count: idleCount,
    name: 'energyOrbIdleSparkles',
    visible: settings.enabled,
    look: lookFromIdle(settings),
    place: ({ id, h1, h2, h3, uSpread, tubeOffset }) => {
      const orbIndex = floor(id.div(max(uPerOrb, float(1))));
      const localId = id.sub(orbIndex.mul(uPerOrb));
      const orbU = orbIndex.add(0.5).div(float(texWidth));
      const sample = pathMap.sample(vec2(orbU, float(0.5)));
      const center = vec3(sample.x, sample.y, sample.z);
      const alongFrac = localId.div(max(uPerOrb, float(1)));
      const along = alongFrac.mul(max(uOrbitM, float(0.01)));
      const y = float(1).sub(alongFrac.mul(2));
      const rXZ = max(float(1).sub(y.mul(y)), 0).sqrt();
      const theta0 = localId.mul(2.399963229728653).add(h1.mul(0.7));
      const shell = normalize(
        vec3(rXZ.mul(cos(theta0)), y, rXZ.mul(sin(theta0))).add(vec3(0.0002, 0, 0)),
      );
      const tangent = normalize(cross(shell, vec3(0, 1, 0)).add(vec3(0.0002, 0, 0)));
      const bitangent = normalize(cross(tangent, shell));
      const inRange = select(orbIndex.lessThan(uOrbCount), float(1), float(0));
      return {
        along,
        extraMul: sample.w.mul(inRange),
        position: center
          .add(shell.mul(uIdleRadius))
          .add(tubeOffset(tangent, bitangent).mul(uSpread))
          .add(shell.mul(h3.sub(0.5).mul(uSpread).mul(0.35)))
          .add(vec3(0, h2.sub(0.5).mul(0.04), 0)),
      };
    },
  });

  const originArray = new Float32Array(burstCapacity * 3);
  const dirArray = new Float32Array(burstCapacity * 3);
  const birthArray = new Float32Array(burstCapacity);
  birthArray.fill(-1);
  const originAttr = new InstancedBufferAttribute(originArray, 3);
  const dirAttr = new InstancedBufferAttribute(dirArray, 3);
  const birthAttr = new InstancedBufferAttribute(birthArray, 1);
  originAttr.setUsage(DynamicDrawUsage);
  dirAttr.setUsage(DynamicDrawUsage);
  birthAttr.setUsage(DynamicDrawUsage);
  const originNode = instancedDynamicBufferAttribute(originAttr, 'vec3') as any;
  const dirNode = instancedDynamicBufferAttribute(dirAttr, 'vec3') as any;
  const birthNode = instancedDynamicBufferAttribute(birthAttr, 'float') as any;

  const uNow = uniform(0);
  const uBurstDuration = uniform(settings.burstDuration);
  const uBurstRadius = uniform(settings.burstRadiusM);
  const uBurstLift = uniform(settings.burstLiftM);
  const uBurstPop = uniform(settings.burstPop);
  const uBurstStagger = uniform(settings.burstStagger);
  const uBurstOrbit = uniform(1.4);
  const uPlayerPos = uniform(new Vector3());

  const burstField = createSparkleField({
    parent: scene,
    count: burstCapacity,
    name: 'energyOrbBurstSparkles',
    visible: settings.enabled,
    look: lookFromBurst(settings),
    place: ({ alongFrac, h1, h2 }) => {
      const along = alongFrac.mul(max(uBurstOrbit, float(0.01)));
      const age = uNow.sub(birthNode).div(max(uBurstDuration, float(0.05)));
      const t = clamp(age, 0, 1);
      const popEnd = clamp(uBurstPop, 0.08, 0.85);
      const popT = clamp(t.div(max(popEnd, float(0.05))), 0, 1);
      const popEase = popT.mul(float(2).sub(popT));
      const delay = h2.mul(clamp(uBurstStagger, 0, 1)).mul(float(1).sub(popEnd));
      const pullStart = popEnd.add(delay);
      const pullT = clamp(t.sub(pullStart).div(max(float(1).sub(pullStart), float(0.05))), 0, 1);
      const pullEase = pullT.mul(pullT).mul(float(3).sub(pullT.mul(2)));
      const fade = float(1).sub(smoothstep(float(0.5), float(1), pullEase));
      const live = select(
        birthNode.lessThan(float(0)),
        float(0),
        select(age.greaterThanEqual(float(1)), float(0), fade),
      );
      const radial = mix(float(0.05), uBurstRadius, popEase);
      const popPos = originNode
        .add(dirNode.mul(radial))
        .add(vec3(0, popEase.mul(popEase).mul(uBurstLift), 0))
        .add(dirNode.mul(h1.mul(0.04)));
      return {
        along,
        extraMul: live,
        position: mix(popPos, uPlayerPos, pullEase),
      };
    },
  });

  let nextSlot = 0;
  let now = 0;

  const applyIdleLook = (live: EnergyOrbParticleSettings) => {
    idle.mesh.visible = live.enabled;
    idle.applyLook(lookFromIdle(live));
    uIdleRadius.value = live.idleRadiusM;
    uOrbitM.value = Math.max(live.pulseSpacingM * 2, 0.8);
  };

  const applyBurstLook = (live: EnergyOrbParticleSettings) => {
    burstField.mesh.visible = live.enabled;
    burstField.applyLook(lookFromBurst(live));
    uBurstDuration.value = live.burstDuration;
    uBurstRadius.value = live.burstRadiusM;
    uBurstLift.value = live.burstLiftM;
    uBurstPop.value = live.burstPop;
    uBurstStagger.value = live.burstStagger;
  };

  const syncIdle = (orbs: readonly EnergyOrbSparkleSource[]) => {
    const n = Math.min(orbs.length, texWidth);
    for (let i = 0; i < texWidth; i++) {
      const o = i * 4;
      if (i < n) {
        const orb = orbs[i]!;
        orbData[o] = orb.worldPos.x;
        orbData[o + 1] = orb.worldPos.y;
        orbData[o + 2] = orb.worldPos.z;
        orbData[o + 3] = orb.absorbed ? 0 : 1;
      } else {
        orbData[o + 3] = 0;
      }
    }
    orbTex.needsUpdate = true;
  };

  const burstAt = (origin: Vector3, playerPos: Vector3) => {
    const live = getLiveEnergyOrbParticleSettings();
    if (!live.enabled) return;
    (uPlayerPos.value as Vector3).copy(playerPos);
    const slot = nextSlot % concurrent;
    nextSlot += 1;
    const start = slot * burstCount;

    for (let i = 0; i < burstCount; i++) {
      const idx = start + i;
      const o = idx * 3;
      const fib = fibonacciDir(i, burstCount);
      const scale = 0.55 + fract(i * 0.73 + 0.17) * 0.45;
      originArray[o] = origin.x;
      originArray[o + 1] = origin.y;
      originArray[o + 2] = origin.z;
      dirArray[o] = fib.x * scale;
      dirArray[o + 1] = fib.y * scale;
      dirArray[o + 2] = fib.z * scale;
      birthArray[idx] = now;
    }
    originAttr.needsUpdate = true;
    dirAttr.needsUpdate = true;
    birthAttr.needsUpdate = true;
  };

  const update = (elapsed: number, playerPos: Vector3) => {
    now = elapsed;
    uNow.value = elapsed;
    (uPlayerPos.value as Vector3).copy(playerPos);
    if (import.meta.env.DEV) {
      const live = getLiveEnergyOrbParticleSettings();
      applyIdleLook(live);
      applyBurstLook(live);
    }
  };

  return {
    syncIdle,
    burst: burstAt,
    update,
    dispose: () => {
      idle.dispose();
      burstField.dispose();
      orbTex.dispose();
    },
  };
}
