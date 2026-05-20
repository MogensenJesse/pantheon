// @ts-nocheck — TSL Loop/If node typings incomplete in r176
// src/world/terrain/pathBlendTsl.ts — distance-to-polyline path weight (TSL / WebGPU)
import { Fn, If, Loop, clamp, dot, float, int, length, min, smoothstep } from 'three/tsl';
import { JOURNEY_SHADER_MAX_SEGMENTS } from '../JourneyPath';

export interface PathBlendUniforms {
  uPathSegCount: { value: number };
  uPathSegA: { element: (index: number) => { x: unknown; y: unknown } };
  uPathSegB: { element: (index: number) => { x: unknown; y: unknown } };
  uPathBlendInner: { value: number };
  uPathBlendOuter: { value: number };
}

export function createPathBlendNodes(uniforms: PathBlendUniforms) {
  const { uPathSegCount, uPathSegA, uPathSegB, uPathBlendInner, uPathBlendOuter } = uniforms;

  const distToJourneyPath = Fn(([xz]) => {
    const minD = float(1e6).toVar();
    Loop({ start: int(0), end: int(JOURNEY_SHADER_MAX_SEGMENTS), type: 'int', condition: '<' }, ({ i }) => {
      If(i.lessThan(uPathSegCount), () => {
        const a = uPathSegA.element(i);
        const b = uPathSegB.element(i);
        const ab = b.sub(a);
        const lenSq = dot(ab, ab);
        If(lenSq.lessThan(float(1e-6)), () => {
          minD.assign(min(minD, length(xz.sub(a))));
        }).Else(() => {
          const t = clamp(dot(xz.sub(a), ab).div(lenSq), 0, 1);
          const closest = a.add(ab.mul(t));
          minD.assign(min(minD, length(xz.sub(closest))));
        });
      });
    });
    return minD;
  });

  const pathBlendWeight = Fn(([xz]) => {
    const d = distToJourneyPath(xz);
    return float(1).sub(smoothstep(uPathBlendInner, uPathBlendOuter, d));
  });

  return { distToJourneyPath, pathBlendWeight };
}
