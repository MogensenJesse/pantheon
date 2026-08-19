// src/entities/guideLine/guidePulseTsl.ts — chasing packets, traveling color, hover, noise drift, breath
import {
  clamp,
  cos,
  Fn,
  float,
  fract,
  If,
  max,
  min,
  mix,
  pow,
  select,
  sin,
  smoothstep,
  time,
  triNoise3D,
  vec3,
} from 'three/tsl';
import { glowFromMask } from '../../rendering/playerGlowTsl';
import { GUIDE_GLOW_ACTIVE_EPS, guideGlowLiveUniforms } from './guideGlowUniforms';

type TslNode = any;

/**
 * Shared wrap-distance envelope. `lengthM` is half-width in metres.
 * `t01` is 1 at the peak and 0 at ±lengthM — ribbon sharpness is applied separately.
 */
function guideTravelEnvelopeTsl(
  along: TslNode,
  closestAlong: TslNode,
  speed: TslNode,
  spacingM: TslNode,
  lengthM: TslNode,
): { t01: TslNode; towardOrb: TslNode } {
  const ahead = along.sub(closestAlong);
  const spacing = max(spacingM, float(0.75));
  const t = fract(time.mul(speed).sub(ahead.div(spacing)));
  const d = min(t, float(1).sub(t));
  const dM = d.mul(spacing);
  const half = max(lengthM, float(0.2));
  const t01 = float(1).sub(clamp(dM.div(half), 0, 1));
  const towardOrb = smoothstep(float(-0.6), float(1.8), ahead);
  return { t01, towardOrb };
}

/**
 * Linear along-path envelope (no sharpness). Sparkles and cobble glow share this
 * so a 9 m pulse length stays a 9 m node instead of a crushed FWHM.
 */
export function guideTravelLinearMaskTsl(
  along: TslNode,
  closestAlong: TslNode,
  speed: TslNode,
  spacingM: TslNode,
  lengthM: TslNode,
): TslNode {
  const { t01, towardOrb } = guideTravelEnvelopeTsl(along, closestAlong, speed, spacingM, lengthM);
  return t01.mul(towardOrb);
}

/**
 * 0–1 pulse packets that travel toward increasing `along` (the energy orb).
 * Ribbon uses a sharpness exponent so nodes stay hot and short.
 */
export function guideTravelPacketTsl(
  along: TslNode,
  closestAlong: TslNode,
  speed: TslNode,
  spacingM: TslNode,
  lengthM: TslNode,
  sharpness: TslNode,
): TslNode {
  const { t01, towardOrb } = guideTravelEnvelopeTsl(along, closestAlong, speed, spacingM, lengthM);
  const packet = pow(t01, max(sharpness, float(1)));
  return packet.mul(towardOrb);
}

/** Whole-ribbon 0–1 opacity; cosine ease so it dwells at on and off. */
export function guideBreathFadeTsl(speed: TslNode, amount: TslNode): TslNode {
  const wave = float(0.5).sub(cos(time.mul(max(speed, float(0)))).mul(0.5));
  return mix(float(1), wave, clamp(amount, 0, 1));
}

/**
 * Dim corridor with chasing peaks — shared by terrain/prop receive glow.
 * Along-path extent follows `lengthM` (no ribbon sharpness), so cobble matches pulse length.
 */
export function guideTravelGlowMulTsl(
  along: TslNode,
  closestAlong: TslNode,
  speed: TslNode,
  spacingM: TslNode,
  amplitude: TslNode,
  idle: TslNode,
  lengthM: TslNode,
  breathSpeed: TslNode,
  breathAmount: TslNode,
): TslNode {
  const packet = guideTravelLinearMaskTsl(along, closestAlong, speed, spacingM, lengthM);
  const contrast = clamp(amplitude, 0, 1);
  const trough = clamp(idle, 0, 1);
  const pulse = mix(float(1), mix(trough, float(1), packet), contrast);
  return pulse.mul(guideBreathFadeTsl(breathSpeed, breathAmount));
}

/**
 * Terrain/prop cobble glow. `If` + `toVar` so hidden lines and empty texels skip
 * the pulse graph (`select`/`mix` would still evaluate both sides).
 */
export function guideReceiveGlowTsl(glowMap: TslNode, mapUv: TslNode, intensity: TslNode): TslNode {
  return Fn(() => {
    const out = float(0).toVar();
    If(intensity.greaterThan(GUIDE_GLOW_ACTIVE_EPS), () => {
      const guideSample = glowMap.sample(mapUv);
      If(guideSample.r.greaterThan(GUIDE_GLOW_ACTIVE_EPS), () => {
        const guideAlong = guideSample.g.mul(guideGlowLiveUniforms.uGuideAlongScale);
        const guidePulse = guideTravelGlowMulTsl(
          guideAlong,
          guideGlowLiveUniforms.uGuideClosestAlong,
          guideGlowLiveUniforms.uGuidePulseSpeed,
          guideGlowLiveUniforms.uGuidePulseSpacing,
          guideGlowLiveUniforms.uGuidePulseAmplitude,
          guideGlowLiveUniforms.uGuidePulseIdle,
          guideGlowLiveUniforms.uGuidePulseLength,
          guideGlowLiveUniforms.uGuideBreathSpeed,
          guideGlowLiveUniforms.uGuideBreathAmount,
        );
        out.assign(glowFromMask(guideSample.r.mul(guidePulse), intensity));
      });
    });
    return out;
  })();
}

/** 3-stop gradient that scrolls along the ribbon (gold → B → C → gold). */
export function guideTravelColorTsl(
  along: TslNode,
  speed: TslNode,
  travelM: TslNode,
  colorA: TslNode,
  colorB: TslNode,
  colorC: TslNode,
): TslNode {
  const scale = max(travelM, float(4));
  const p = fract(along.div(scale).sub(time.mul(speed).mul(0.35)));
  const ab = mix(colorA, colorB, clamp(p.div(0.333), 0, 1));
  const bc = mix(colorB, colorC, clamp(p.sub(0.333).div(0.333), 0, 1));
  const ca = mix(colorC, colorA, clamp(p.sub(0.666).div(0.334), 0, 1));
  return select(p.lessThan(0.333), ab, select(p.lessThan(0.666), bc, ca));
}

/** Orb-like Y bob for the whole ribbon; phase travels slowly along the path. */
export function guideFloatOffsetTsl(
  along: TslNode,
  amp: TslNode,
  speed: TslNode,
  waveM: TslNode,
): TslNode {
  const wave = max(waveM, float(8));
  const phase = along.mul(float(Math.PI * 2)).div(wave);
  return sin(time.mul(speed).add(phase)).mul(amp);
}

/** Small organic offset; weighted toward the orb end so the path stay is tighter near the player. */
export function guideNoiseDriftTsl(
  along: TslNode,
  maxAlong: TslNode,
  amp: TslNode,
  speed: TslNode,
  scale: TslNode,
): TslNode {
  const alongW = clamp(along.div(max(maxAlong, float(8))), 0, 1);
  const s = max(scale, float(0.02));
  const npos = vec3(along.mul(s), float(0), along.mul(s).mul(0.71));
  const n = triNoise3D(npos, float(0.25), time.mul(speed));
  const n2 = triNoise3D(npos.add(vec3(17.2, 9.1, 4.3)), float(0.25), time.mul(speed).mul(1.13));
  const weight = alongW.add(0.25);
  return vec3(n.sub(0.5), n2.sub(0.5).mul(0.45), n.sub(0.5).mul(-0.7)).mul(amp).mul(weight);
}

/** Brightness / halo boost on the last metres of the ribbon (the energy orb). */
export function guideTipGlowTsl(
  along: TslNode,
  maxAlong: TslNode,
  tipM: TslNode,
  boost: TslNode,
): TslNode {
  const span = max(tipM, float(0.5));
  const tip = smoothstep(maxAlong.sub(span), maxAlong, along);
  return mix(float(1), float(1).add(max(boost, float(0))), tip);
}
