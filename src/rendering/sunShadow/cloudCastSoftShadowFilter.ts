// src/rendering/sunShadow/cloudCastSoftShadowFilter.ts — fixed-radius Vogel soft for cloud cast map
// @ts-nocheck — TSL node parameter typings incomplete in r185
import { add, Fn, float, reference, renderGroup, texture, vec2, vogelDiskSample } from 'three/tsl';

/** Dense enough for castShadowSoftness ≈ 96 texels without sparse ring banding. */
const SAMPLE_COUNT = 24;

/**
 * Compare-sampler Vogel PCF at `shadow.radius` (cloud cast softness — not PCSS / contact uniforms).
 * Fixed phi — temporal rotation would shimmer under wind drift.
 */
export const CloudCastSoftShadowFilter = /*@__PURE__*/ Fn(
  ({ depthTexture, shadowCoord, shadow, depthLayer }) => {
    const depthCompare = (uv, compare) => {
      let depth = texture(depthTexture, uv);
      if (depthTexture.isArrayTexture) {
        depth = depth.depth(depthLayer);
      }
      return depth.compare(compare);
    };

    const mapSize = reference('mapSize', 'vec2', shadow).setGroup(renderGroup);
    const radius = reference('radius', 'float', shadow).setGroup(renderGroup);
    const texelSize = vec2(1).div(mapSize);
    const radiusScaled = radius.mul(texelSize.x);
    const phi = float(0);

    const taps = [];
    for (let i = 0; i < SAMPLE_COUNT; i++) {
      taps.push(
        depthCompare(
          shadowCoord.xy.add(vogelDiskSample(float(i), float(SAMPLE_COUNT), phi).mul(radiusScaled)),
          shadowCoord.z,
        ),
      );
    }

    return add(...taps).mul(1 / SAMPLE_COUNT);
  },
);
