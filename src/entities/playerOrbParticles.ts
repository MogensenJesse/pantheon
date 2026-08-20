// src/entities/playerOrbParticles.ts — sparkle sprites around the player orb
import { DynamicDrawUsage, type Group, InstancedBufferAttribute, type Vector3 } from 'three';
import {
  cos,
  cross,
  float,
  instancedDynamicBufferAttribute,
  max,
  normalize,
  sin,
  time,
  triNoise3D,
  uniform,
  vec3,
} from 'three/tsl';
import type { PlayerParticleSettings } from '../config/visual/player';
import type { SparkleLookSettings } from '../config/visual/sparkleLook';
import { getEnergyRatio } from '../core/energy';
import { getLivePlayerParticleSettings } from './playerParticleDevState';
import { createSparkleField } from './sparkleField';

export interface PlayerOrbParticles {
  syncUniforms: () => void;
  follow: (worldPos: Vector3) => void;
  setShellScale: (scale: number) => void;
  dispose: () => void;
}

function lookFromPlayer(p: PlayerParticleSettings): SparkleLookSettings {
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

function fract(x: number): number {
  return x - Math.floor(x);
}

function drawnCount(capacity: number, enabled: boolean): number {
  if (!enabled) return 0;
  return Math.max(0, Math.min(capacity, Math.round(getEnergyRatio() * capacity)));
}

export function createPlayerOrbParticles(parent: Group): PlayerOrbParticles {
  const settings = getLivePlayerParticleSettings();
  const capacity = Math.max(1, settings.count);
  const uRadius = uniform(settings.radiusM);
  const uOrbitM = uniform(Math.max(settings.pulseSpacingM * 2, 1.2));
  const uShake = uniform(0);
  const uShakeAmp = uniform(settings.shakeAmpM);
  const uShakeSpeed = uniform(settings.shakeHz);
  let shellScale = 1;

  const dragArray = new Float32Array(capacity * 3);
  const dragAttr = new InstancedBufferAttribute(dragArray, 3);
  dragAttr.setUsage(DynamicDrawUsage);
  const dragOffset = instancedDynamicBufferAttribute(dragAttr, 'vec3') as any;
  const lagged = new Float32Array(capacity * 3);
  let primed = false;
  let lastMs = 0;
  let lastX = 0;
  let lastY = 0;
  let lastZ = 0;
  let shake = 0;

  const field = createSparkleField({
    parent,
    count: capacity,
    name: 'playerOrbSparkles',
    visible: settings.enabled,
    look: lookFromPlayer(settings),
    place: ({ id, alongFrac, h1, h2, h3, uSpread, tubeOffset }) => {
      const along = alongFrac.mul(max(uOrbitM, float(0.01)));
      const y = float(1).sub(alongFrac.mul(2));
      const rXZ = max(float(1).sub(y.mul(y)), 0).sqrt();
      const theta0 = id.mul(2.399963229728653);
      const shell = normalize(
        vec3(rXZ.mul(cos(theta0)), y, rXZ.mul(sin(theta0))).add(vec3(0.0002, 0, 0)),
      );
      const tangent = normalize(cross(shell, vec3(0, 1, 0)).add(vec3(0.0002, 0, 0)));
      const bitangent = normalize(cross(tangent, shell));
      const amp = uShake.mul(uShakeAmp).mul(h3.mul(0.55).add(0.45));
      const npos = vec3(id.mul(0.19), h1.mul(7.3), h2.mul(5.1));
      const n = triNoise3D(npos, float(0.45), time.mul(uShakeSpeed));
      const n2 = triNoise3D(
        npos.add(vec3(11.7, 3.9, 8.2)),
        float(0.45),
        time.mul(uShakeSpeed).mul(1.61),
      );
      const chaos = vec3(n.sub(0.5), n2.sub(0.5), n.sub(0.5).mul(-0.75)).mul(amp).mul(2);
      const tumbleAng = time.mul(uShakeSpeed).mul(h1.add(0.35)).mul(6.283185);
      const swirl = tangent
        .mul(cos(tumbleAng))
        .add(bitangent.mul(sin(tumbleAng)))
        .mul(amp);
      const puff = shell.mul(amp.mul(h2.mul(0.4).add(0.2)));
      return {
        along,
        position: shell
          .mul(uRadius)
          .add(tubeOffset(tangent, bitangent).mul(uSpread))
          .add(shell.mul(h3.sub(0.5).mul(uSpread).mul(0.35)))
          .add(dragOffset)
          .add(chaos)
          .add(swirl)
          .add(puff),
      };
    },
  });

  const applyDrawnCount = (enabled: boolean) => {
    field.mesh.count = drawnCount(capacity, enabled);
  };
  applyDrawnCount(settings.enabled);

  const applyRadius = (live: PlayerParticleSettings) => {
    uRadius.value = live.radiusM * shellScale;
  };

  const setShellScale = (scale: number) => {
    shellScale = Math.max(0.05, scale);
    applyRadius(getLivePlayerParticleSettings());
  };

  const snapTo = (worldPos: Vector3) => {
    for (let i = 0; i < capacity; i++) {
      const o = i * 3;
      lagged[o] = worldPos.x;
      lagged[o + 1] = worldPos.y;
      lagged[o + 2] = worldPos.z;
      dragArray[o] = 0;
      dragArray[o + 1] = 0;
      dragArray[o + 2] = 0;
    }
    dragAttr.needsUpdate = true;
  };

  const follow = (worldPos: Vector3) => {
    const now = performance.now();
    const dt = lastMs === 0 ? 0 : Math.min(0.05, (now - lastMs) * 0.001);
    lastMs = now;

    const live = getLivePlayerParticleSettings();
    uShakeAmp.value = live.shakeAmpM;
    uShakeSpeed.value = live.shakeHz;
    applyRadius(live);
    applyDrawnCount(live.enabled);

    if (!primed || dt <= 0) {
      snapTo(worldPos);
      lastX = worldPos.x;
      lastY = worldPos.y;
      lastZ = worldPos.z;
      primed = true;
      return;
    }

    const speed = Math.hypot(worldPos.x - lastX, worldPos.y - lastY, worldPos.z - lastZ) / dt;
    lastX = worldPos.x;
    lastY = worldPos.y;
    lastZ = worldPos.z;
    const ref = Math.max(live.shakeSpeedRef, 0.25);
    const target = Math.min(1, speed / ref);
    const respond = target > shake ? 16 : 5;
    shake += (target - shake) * (1 - Math.exp(-respond * dt));
    uShake.value = shake;

    const maxTau = Math.max(live.dragLagSec, 0);
    if (maxTau < 1e-4) {
      snapTo(worldPos);
      return;
    }

    const minTau = maxTau * (1 - Math.max(0, Math.min(1, live.dragVariation)));
    const px = worldPos.x;
    const py = worldPos.y;
    const pz = worldPos.z;
    for (let i = 0; i < capacity; i++) {
      const h = fract(i * 0.61803398875 + 0.37);
      const tau = Math.max(minTau + (maxTau - minTau) * h, 0.02);
      const k = 1 - Math.exp(-dt / tau);
      const o = i * 3;
      lagged[o] += (px - lagged[o]) * k;
      lagged[o + 1] += (py - lagged[o + 1]) * k;
      lagged[o + 2] += (pz - lagged[o + 2]) * k;
      dragArray[o] = lagged[o] - px;
      dragArray[o + 1] = lagged[o + 1] - py;
      dragArray[o + 2] = lagged[o + 2] - pz;
    }
    dragAttr.needsUpdate = true;
  };

  const syncUniforms = () => {
    const live = getLivePlayerParticleSettings();
    field.mesh.visible = live.enabled;
    field.applyLook(lookFromPlayer(live));
    applyRadius(live);
    uOrbitM.value = Math.max(live.pulseSpacingM * 2, 1.2);
    uShakeAmp.value = live.shakeAmpM;
    uShakeSpeed.value = live.shakeHz;
    applyDrawnCount(live.enabled);
  };

  return { syncUniforms, follow, setShellScale, dispose: field.dispose };
}
