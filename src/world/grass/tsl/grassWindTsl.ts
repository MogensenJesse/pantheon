// src/world/grass/tsl/grassWindTsl.ts — per-frame blade wind + trail lean (draw shader)
import { cos, float, hash, max, mix, PI2, sin, smoothstep, vec2, vec3 } from 'three/tsl';
import { grassSharedUniforms } from '../config/grassUniforms';
import type { TslNode } from './tslNode';

const MIN_TRAIL_SCALE = 0.15;

function windResponse(scaleY: TslNode): TslNode {
  const { uBladeMaxScale, uWindCurveP1, uWindCurveP2 } = grassSharedUniforms as any;
  const t = scaleY.div(uBladeMaxScale).clamp();
  const inverse = float(1).sub(t);
  const p1Term = inverse.mul(inverse).mul(t).mul(3).mul(uWindCurveP1);
  const p2Term = inverse.mul(t).mul(t).mul(3).mul(uWindCurveP2);
  return p1Term.add(p2Term).add(t.mul(t).mul(t));
}

function distantWind(worldPos: TslNode): TslNode {
  const { uWindDirection, uWindStrength, uWindSpeed, uWindLull, uTime } =
    grassSharedUniforms as any;
  const phase = worldPos.x
    .mul(0.035)
    .add(worldPos.z.mul(0.025))
    .add(uTime.mul(uWindSpeed.mul(2.2)));
  const wave = sin(phase);
  const gust = wave.mul(0.5).add(0.5);
  const windFactor = uWindStrength.mul((mix as any)(uWindLull, float(1), gust));
  return vec3(uWindDirection.mul(windFactor), gust);
}

function distantDeform(windXZ: TslNode, gust: TslNode, scaleY: TslNode): TslNode {
  const { uWindDirection, uBaseBending, uAmbientSwayStrength } = grassSharedUniforms as any;
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
  const { uWindDirection, uBaseBending, uAmbientSwayStrength, uWindSpeed, uTime } =
    grassSharedUniforms as any;
  const instanceNoise = bladeSeed.mul(0.25).sub(0.125);
  const scaleWindFactor = windResponse(scaleY);
  const windBend = windXZ.dot(windXZ).mul(3.5).clamp();
  const windNoiseShade = (smoothstep as any)(float(0.2), float(1), gust);
  const windNoiseFactor = max(windBend, windNoiseShade.mul(0.45));
  const swayEnvelope = (mix as any)(float(0.75), float(1.35), windNoiseFactor);
  const randomPhase = instanceNoise.mul(25.13);
  const heightPhase = swayEnvelope.mul(0.55);
  const swayRate = bladeSeed.mul(31.7).fract().mul(0.75).add(0.7);
  const swayA = sin(uTime.mul(swayRate.mul(1.35)).add(randomPhase).add(heightPhase));
  const swayB = sin(
    uTime
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
    uTime.mul(uWindSpeed.mul(1.7)).add(flutterPhase.mul(1.3)).add(heightPhase.mul(2.2)),
  )
    .mul(0.025)
    .mul(windNoiseFactor)
    .mul(bendStrength);
  return windXZ.mul(bendStrength).add(ambientOffset.mul(scaleWindFactor)).add(perp.mul(flutter));
}

function liveWindTarget(worldPos: TslNode, sampleWindAtlas: (uv: TslNode) => TslNode): TslNode {
  const {
    uWindDirection,
    uWindStrength,
    uWindSpeed,
    uWindUvScale,
    uWindLull,
    uWindEddyStrength,
    uWindGustCoverage,
    uTime,
  } = grassSharedUniforms as any;
  const baseDir = uWindDirection;
  const perp = vec2(baseDir.y.negate(), baseDir.x);
  const scrollDir = perp.mul(0.3717).sub(baseDir);
  const uv = vec2(worldPos.x, worldPos.z)
    .mul(uWindUvScale.mul(0.01))
    .add(scrollDir.mul(uWindSpeed.mul(uTime)));
  const noise = sampleWindAtlas(uv);
  const gustStart = float(1).sub(uWindGustCoverage);
  const gust = (smoothstep as any)(gustStart, gustStart.add(0.25), noise.r);
  const windFactor = uWindStrength.mul((mix as any)(uWindLull, float(1), gust));
  const veer = noise.g.sub(0.5).mul(2).mul(uWindEddyStrength);
  const windXZ = baseDir.add(perp.mul(veer)).mul(windFactor).min(2).max(-2);
  return vec3(windXZ, gust);
}

export interface GrassLiveWindBendParams {
  worldPos: TslNode;
  scaleY: TslNode;
  sourceIndex: TslNode;
  /** LOD0/1: atlas wind. LOD2: omit — cheap sine only. */
  sampleWindAtlas?: ((uv: TslNode) => TslNode) | null;
}

/** Wind lean XZ (metres). LOD2 skips atlas + detailed deform. */
export function grassLiveWindBendXZ(params: GrassLiveWindBendParams): TslNode {
  if (!params.sampleWindAtlas) {
    const distant = distantWind(params.worldPos);
    const distantXZ = distant.xy.min(2).max(-2);
    return distantDeform(distantXZ, distant.z, params.scaleY);
  }
  const bladeSeed = hash(params.sourceIndex);
  const target = liveWindTarget(params.worldPos, params.sampleWindAtlas);
  return detailedDeform(target.xy, target.z, params.worldPos, params.scaleY, bladeSeed);
}

/** Player-trail lean from packed scale (crush still integrates in compact). */
export function grassTrailBendXZ(
  offsetX: TslNode,
  offsetZ: TslNode,
  distanceSquared: TslNode,
  currentScale: TslNode,
  baseScale: TslNode,
): TslNode {
  const { uTrailRadius, uTrailRadiusSquared, uTrailBendStrength } = grassSharedUniforms as any;
  const trailDirection = vec2(offsetX, offsetZ)
    .mul(uTrailRadius)
    .div(max(distanceSquared, uTrailRadiusSquared));
  const trailAmount = float(1)
    .sub(currentScale.div(max(baseScale, float(MIN_TRAIL_SCALE))))
    .clamp();
  return trailDirection.mul(trailAmount.mul(uTrailBendStrength));
}
