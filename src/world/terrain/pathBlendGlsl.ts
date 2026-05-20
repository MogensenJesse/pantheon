// src/world/terrain/pathBlendGlsl.ts — distance-to-polyline path weight (shared VS/FS)

import { JOURNEY_SHADER_MAX_SEGMENTS } from '../JourneyPath';

/** GLSL: distToJourneyPath + pathBlendWeight; requires path segment uniforms. */
export const pathBlendGlsl = /* glsl */`
  uniform int uPathSegCount;
  uniform vec2 uPathSegA[${JOURNEY_SHADER_MAX_SEGMENTS}];
  uniform vec2 uPathSegB[${JOURNEY_SHADER_MAX_SEGMENTS}];
  uniform float uPathBlendInner;
  uniform float uPathBlendOuter;

  float distToJourneyPath(vec2 xz) {
    float minD = 1e6;
    for (int i = 0; i < ${JOURNEY_SHADER_MAX_SEGMENTS}; i++) {
      if (i >= uPathSegCount) break;
      vec2 a = uPathSegA[i];
      vec2 b = uPathSegB[i];
      vec2 ab = b - a;
      float lenSq = dot(ab, ab);
      if (lenSq < 1e-6) {
        minD = min(minD, length(xz - a));
        continue;
      }
      float t = clamp(dot(xz - a, ab) / lenSq, 0.0, 1.0);
      vec2 closest = a + ab * t;
      minD = min(minD, length(xz - closest));
    }
    return minD;
  }

  float pathBlendWeight(vec2 xz) {
    float d = distToJourneyPath(xz);
    return 1.0 - smoothstep(uPathBlendInner, uPathBlendOuter, d);
  }
`;
