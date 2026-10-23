// src/world/grass/tsl/grassWindTsl.ts — per-frame blade wind + trail lean (draw shader)
import { cos, float, hash, max, mix, PI2, sin, smoothstep, vec2, vec3 } from 'three/tsl';
import { uWetness } from '../../../rendering/tsl/wetLookTsl';
import { grassSharedUniforms } from '../config/grassUniforms';
import type { TslNode } from './tslNode';

/** Floor on the crush-ratio divisor so near-zero blades do not read as fully trampled. */
const MIN_TRAIL_BASE_SCALE = 0.02;

function windResponse(scaleY: TslNode): TslNode {
  const { uBladeMaxScale, uWindCurveP1, uWindCurveP2 } = grassSharedUniforms;
  const t = scaleY.div(uBladeMaxScale).clamp();
  const inverse = float(1).sub(t);
  const p1Term = inverse.mul(inverse).mul(t).mul(3).mul(uWindCurveP1);
  const p2Term = inverse.mul(t).mul(t).mul(3).mul(uWindCurveP2);
  return p1Term.add(p2Term).add(t.mul(t).mul(t));
}

/** Phase per metre along the wind of the far grass's gust wave (the nearer grass reads the wind atlas instead). */
const DISTANT_WAVE_PER_M = 0.043;

function distantWind(worldPos: TslNode): TslNode {
  const { uWindDirection, uWindStrength, uWindBoost, uWindSpeed, uWindLull, uWindClock } =
    grassSharedUniforms;
  const along = vec2(worldPos.x, worldPos.z).dot(uWindDirection);
  const phase = along.mul(-DISTANT_WAVE_PER_M).add(uWindClock.mul(uWindSpeed.mul(2.2)));
  const wave = sin(phase);
  const gust = wave.mul(0.5).add(0.5);
  const windFactor = uWindStrength.mul(uWindBoost).mul(mix(uWindLull, float(1), gust));
  return vec3(uWindDirection.mul(windFactor), gust);
}

function distantDeform(windXZ: TslNode, gust: TslNode, scaleY: TslNode): TslNode {
  const { uWindDirection, uBaseBending, uAmbientSwayStrength } = grassSharedUniforms;
  const scaleWindFactor = windResponse(scaleY);
  const perp = vec2(uWindDirection.y.negate(), uWindDirection.x);
  const broadSway = gust.sub(0.5).mul(uAmbientSwayStrength.mul(0.7));
  return windXZ
    .mul(uBaseBending.mul(scaleWindFactor))
    .add(perp.mul(broadSway.mul(scaleWindFactor)));
}

function detailedDeform(
  windXZ: TslNode,
  gust: TslNode,
  worldPos: TslNode,
  scaleY: TslNode,
  bladeSeed: TslNode,
): TslNode {
  const { uWindDirection, uBaseBending, uAmbientSwayStrength, uWindSpeed, uWindClock } =
    grassSharedUniforms;
  const instanceNoise = bladeSeed.mul(0.25).sub(0.125);
  const scaleWindFactor = windResponse(scaleY);
  const windBend = windXZ.dot(windXZ).mul(3.5).clamp();
  const windNoiseShade = smoothstep(float(0.2), float(1), gust);
  const windNoiseFactor = max(windBend, windNoiseShade.mul(0.45));
  const swayEnvelope = mix(float(0.75), float(1.35), windNoiseFactor);
  const randomPhase = instanceNoise.mul(25.13);
  const heightPhase = swayEnvelope.mul(0.55);
  const swayRate = bladeSeed.mul(31.7).fract().mul(0.75).add(0.7);
  const swayA = sin(uWindClock.mul(swayRate.mul(1.35)).add(randomPhase).add(heightPhase));
  const swayB = sin(
    uWindClock
      .mul(swayRate.mul(2.15))
      .add(worldPos.x.mul(0.17))
      .add(worldPos.z.mul(0.11))
      .add(randomPhase.mul(1.7))
      .add(heightPhase.mul(1.6)),
  ).mul(0.45);
  const ambientAngle = bladeSeed.mul(53.3).fract().mul(PI2);
  const ambientOffset = vec2(cos(ambientAngle), sin(ambientAngle)).mul(
    swayA.add(swayB).mul(uAmbientSwayStrength).mul(swayEnvelope),
  );
  const perp = vec2(uWindDirection.y.negate(), uWindDirection.x);
  const bendStrength = uBaseBending.mul(scaleWindFactor);
  const flutterPhase = bladeSeed
    .mul(97.13)
    .fract()
    .mul(PI2)
    .add(worldPos.x.mul(0.13))
    .add(worldPos.z.mul(0.07));
  const flutter = sin(
    uWindClock.mul(uWindSpeed.mul(1.7)).add(flutterPhase.mul(1.3)).add(heightPhase.mul(2.2)),
  )
    .mul(0.025)
    .mul(windNoiseFactor)
    .mul(bendStrength);
  return windXZ.mul(bendStrength).add(ambientOffset.mul(scaleWindFactor)).add(perp.mul(flutter));
}

/**
 * The wind a wheat blade is given (the twin of `life/plantWind.ts`): the wind modulated by a wave that travels along
 * it, a breeze that always rolls through, and the lean of a field that rain has lain down. Mask 0 = unchanged.
 */
function shapeWheatWind(windXZ: TslNode, worldPos: TslNode, mask: TslNode): TslNode {
  const {
    uWindDirection,
    uWindClock,
    uWheatWaveGain,
    uWheatWaveBase,
    uWheatWaveK,
    uWheatWaveOmega,
    uWheatLodge,
  } = grassSharedUniforms;
  const along = vec2(worldPos.x, worldPos.z).dot(uWindDirection);
  const wave = sin(along.mul(uWheatWaveK).sub(uWindClock.mul(uWheatWaveOmega))).mul(0.5);
  const gain = float(1).add(uWheatWaveGain.mul(wave).mul(mask));
  const breeze = wave.add(0.5).mul(uWheatWaveBase).mul(mask);
  const lodge = uWheatLodge.mul(uWetness).mul(mask);
  return windXZ.mul(gain).add(uWindDirection.mul(breeze.add(lodge)));
}

/** The wind's push on a blade or flower at a place (xz, metres of wind units): direction × strength × gust, with the veer. */
export function grassWindPushXZ(
  worldPos: TslNode,
  sampleWindAtlas: (uv: TslNode) => TslNode,
): TslNode {
  return liveWindTarget(worldPos, sampleWindAtlas).xy;
}

/**
 * Grass near the orb rustles (plants answer the orb whatever the phase): a quick random-direction lean that
 * fades out with distance (metres; the twin is `plantWind.orbNear`) and grows with the blade's height.
 */
export function grassOrbRustleXZ(distM: TslNode, scaleY: TslNode, bladeSeed: TslNode): TslNode {
  const { uOrbRustleRadius, uOrbRustleStrength, uOrbRustleRate, uWindClock, uBladeMaxScale } =
    grassSharedUniforms;
  const near = float(1).sub(smoothstep(float(0), uOrbRustleRadius, distM));
  const angle = bladeSeed.mul(PI2);
  const wiggle = sin(uWindClock.mul(uOrbRustleRate).add(bladeSeed.mul(40)));
  const response = scaleY.div(uBladeMaxScale).clamp();
  return vec2(cos(angle), sin(angle)).mul(wiggle.mul(near).mul(uOrbRustleStrength).mul(response));
}

function liveWindTarget(worldPos: TslNode, sampleWindAtlas: (uv: TslNode) => TslNode): TslNode {
  const {
    uWindDirection,
    uWindStrength,
    uWindBoost,
    uWindSpeed,
    uWindUvScale,
    uWindLull,
    uWindEddyStrength,
    uWindGustCoverage,
    uWindClock,
  } = grassSharedUniforms;
  const baseDir = uWindDirection;
  const perp = vec2(baseDir.y.negate(), baseDir.x);
  const scrollDir = perp.mul(0.3717).sub(baseDir);
  const uv = vec2(worldPos.x, worldPos.z)
    .mul(uWindUvScale.mul(0.01))
    .add(scrollDir.mul(uWindSpeed.mul(uWindClock)));
  const noise = sampleWindAtlas(uv);
  const gustStart = float(1).sub(uWindGustCoverage);
  const gust = smoothstep(gustStart, gustStart.add(0.25), noise.r);
  const windFactor = uWindStrength.mul(uWindBoost).mul(mix(uWindLull, float(1), gust));
  const veer = noise.g.sub(0.5).mul(2).mul(uWindEddyStrength);
  const windXZ = baseDir.add(perp.mul(veer)).mul(windFactor).min(2).max(-2);
  return vec3(windXZ.x, windXZ.y, gust);
}

export interface GrassLiveWindBendParams {
  worldPos: TslNode;
  scaleY: TslNode;
  sourceIndex: TslNode;
  /** LOD0/1: atlas wind. LOD2: omit — cheap sine only. */
  sampleWindAtlas?: ((uv: TslNode) => TslNode) | null;
  /** Wheat mask 0..1 at the blade: wheat rolls in waves and lies down when wet (every tier). */
  wheatMask?: TslNode | null;
}

/** Wind lean XZ (metres). LOD2 skips atlas + detailed deform. */
export function grassLiveWindBendXZ(params: GrassLiveWindBendParams): TslNode {
  const { worldPos, wheatMask } = params;
  const shape = (windXZ: TslNode): TslNode =>
    wheatMask ? shapeWheatWind(windXZ, worldPos, wheatMask) : windXZ;
  if (!params.sampleWindAtlas) {
    const distant = distantWind(worldPos);
    const distantXZ = distant.xy.min(2).max(-2);
    return distantDeform(shape(distantXZ), distant.z, params.scaleY);
  }
  const bladeSeed = hash(params.sourceIndex);
  const target = liveWindTarget(worldPos, params.sampleWindAtlas);
  return detailedDeform(shape(target.xy), target.z, worldPos, params.scaleY, bladeSeed);
}

/** Player-trail lean from packed scale (crush still integrates in compact). */
export function grassTrailBendXZ(
  offsetX: TslNode,
  offsetZ: TslNode,
  distanceSquared: TslNode,
  currentScale: TslNode,
  baseScale: TslNode,
): TslNode {
  const { uTrailRadius, uTrailRadiusSquared, uTrailBendStrength } = grassSharedUniforms;
  const trailDirection = vec2(offsetX, offsetZ)
    .mul(uTrailRadius)
    .div(max(distanceSquared, uTrailRadiusSquared));
  const trailAmount = float(1)
    .sub(currentScale.div(max(baseScale, float(MIN_TRAIL_BASE_SCALE))))
    .clamp();
  return trailDirection.mul(trailAmount.mul(uTrailBendStrength));
}
