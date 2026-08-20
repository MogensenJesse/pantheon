// src/entities/energyOrbParticles.ts — idle halo + absorb burst sparkles for residue orbs
import {
  DynamicDrawUsage,
  InstancedBufferAttribute,
  NearestFilter,
  type Scene,
  Vector3,
} from 'three';
import {
  clamp,
  float,
  floor,
  instancedDynamicBufferAttribute,
  max,
  mix,
  select,
  smoothstep,
  texture,
  uniform,
  vec2,
  vec3,
} from 'three/tsl';
import type { EnergyOrbParticleSettings } from '../config/visual/energyOrb';
import { type SparkleLookSettings, toSparkleLook } from '../config/visual/sparkleLook';
import {
  getEnergyOrbParticleDevRevision,
  getLiveEnergyOrbParticleSettings,
} from './energyOrbParticleDevState';
import { createSparkleField } from './sparkleField';
import { createSparklePathTexture } from './sparklePathTexture';
import {
  SPARKLE_GOLDEN_ANGLE,
  sparkleFibonacciDir,
  sparkleFract,
  sparkleShellPlacementTsl,
  sparkleShellTubeOffsetTsl,
} from './sparkleShell';

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

const burstLookScratch = {} as SparkleLookSettings;
const burstLookOverrides: Partial<SparkleLookSettings> = {
  idle: 1,
  breathAmount: 0,
  breathSpeed: 1,
};

function lookFromBurst(p: EnergyOrbParticleSettings) {
  burstLookOverrides.sizeM = p.burstSizeM;
  burstLookOverrides.spreadM = p.burstSpreadM;
  burstLookOverrides.hdr = p.burstHdr;
  burstLookOverrides.spin = p.burstSpin;
  burstLookOverrides.pulseSpeed = p.burstPulseSpeed;
  burstLookOverrides.pulseSpacingM = p.burstPulseSpacingM;
  burstLookOverrides.pulseLengthM = p.burstPulseLengthM;
  return toSparkleLook(p, burstLookOverrides, burstLookScratch);
}

export function createEnergyOrbParticles(scene: Scene, orbCount: number): EnergyOrbParticles {
  const settings = getLiveEnergyOrbParticleSettings();
  const perOrb = Math.max(1, settings.idleCountPerOrb);
  const idleCount = Math.max(8, perOrb * Math.max(orbCount, 1));
  const burstCount = Math.max(8, settings.burstCount);
  const concurrent = Math.max(1, settings.burstConcurrent);
  const burstCapacity = burstCount * concurrent;
  const texWidth = Math.max(2, orbCount);

  const orbTex = createSparklePathTexture(orbCount, NearestFilter);
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
    look: toSparkleLook(settings),
    place: ({ id, h1, h2, h3, uSpread, tubeOffset }) => {
      const orbIndex = floor(id.div(max(uPerOrb, float(1))));
      const localId = id.sub(orbIndex.mul(uPerOrb));
      const orbU = orbIndex.add(0.5).div(float(texWidth));
      const sample = pathMap.sample(vec2(orbU, float(0.5)));
      const center = vec3(sample.x, sample.y, sample.z);
      const alongFrac = localId.div(max(uPerOrb, float(1)));
      const { along, shell, tangent, bitangent } = sparkleShellPlacementTsl({
        alongFrac,
        theta: localId.mul(SPARKLE_GOLDEN_ANGLE).add(h1.mul(0.7)),
        orbitM: uOrbitM,
      });
      const inRange = select(orbIndex.lessThan(uOrbCount), float(1), float(0));
      return {
        along,
        extraMul: sample.w.mul(inRange),
        position: center
          .add(shell.mul(uIdleRadius))
          .add(sparkleShellTubeOffsetTsl(shell, tangent, bitangent, tubeOffset, uSpread, h3))
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
  const uBurstOrbit = uniform(settings.burstOrbitM);
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

  const idleLookScratch = {} as SparkleLookSettings;
  let lastLookRev = getEnergyOrbParticleDevRevision();

  const applyIdleLook = (live: EnergyOrbParticleSettings) => {
    idle.mesh.visible = live.enabled;
    idle.applyLook(toSparkleLook(live, undefined, idleLookScratch));
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
    uBurstOrbit.value = live.burstOrbitM;
  };

  const POS_EPS = 1e-4;
  const syncIdle = (orbs: readonly EnergyOrbSparkleSource[]) => {
    const n = Math.min(orbs.length, texWidth);
    let dirty = false;
    for (let i = 0; i < texWidth; i++) {
      const o = i * 4;
      if (i < n) {
        const orb = orbs[i]!;
        const x = orb.worldPos.x;
        const y = orb.worldPos.y;
        const z = orb.worldPos.z;
        const w = orb.absorbed ? 0 : 1;
        if (
          Math.abs(orbData[o]! - x) > POS_EPS ||
          Math.abs(orbData[o + 1]! - y) > POS_EPS ||
          Math.abs(orbData[o + 2]! - z) > POS_EPS ||
          orbData[o + 3] !== w
        ) {
          orbData[o] = x;
          orbData[o + 1] = y;
          orbData[o + 2] = z;
          orbData[o + 3] = w;
          dirty = true;
        }
      } else if (orbData[o + 3] !== 0) {
        orbData[o + 3] = 0;
        dirty = true;
      }
    }
    if (dirty) orbTex.needsUpdate = true;
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
      const fib = sparkleFibonacciDir(i, burstCount);
      const scale = 0.55 + sparkleFract(i * 0.73 + 0.17) * 0.45;
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
      const rev = getEnergyOrbParticleDevRevision();
      if (rev !== lastLookRev) {
        lastLookRev = rev;
        const live = getLiveEnergyOrbParticleSettings();
        applyIdleLook(live);
        applyBurstLook(live);
      }
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
