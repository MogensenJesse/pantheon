// src/entities/guideLine/guidePulseTsl.ts — chasing packets + orb-like ribbon hover
import { clamp, float, fract, max, min, mix, sin, smoothstep, time } from 'three/tsl';

type TslNode = any;

/**
 * 0–1 pulse packets that travel toward increasing `along` (the energy orb).
 * `closestAlong` is the player’s nearest point on the ribbon — packets spawn there.
 */
export function guideTravelPacketTsl(
  along: TslNode,
  closestAlong: TslNode,
  speed: TslNode,
  spacingM: TslNode,
): TslNode {
  const ahead = along.sub(closestAlong);
  const spacing = max(spacingM, float(0.75));
  const t = fract(time.mul(speed).sub(ahead.div(spacing)));
  const d = min(t, float(1).sub(t));
  const packet = float(1).sub(smoothstep(float(0), float(0.14), d));
  const towardOrb = smoothstep(float(-0.6), float(1.8), ahead);
  return packet.mul(towardOrb);
}

/** Dim corridor with chasing peaks — shared by terrain/prop receive glow. */
export function guideTravelGlowMulTsl(
  along: TslNode,
  closestAlong: TslNode,
  speed: TslNode,
  spacingM: TslNode,
  amplitude: TslNode,
  idle: TslNode,
): TslNode {
  const packet = guideTravelPacketTsl(along, closestAlong, speed, spacingM);
  const contrast = clamp(amplitude, 0, 1);
  const trough = clamp(idle, 0, 1);
  return mix(float(1), mix(trough, float(1), packet), contrast);
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
