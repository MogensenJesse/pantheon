// src/rendering/sunShadow/widePcfShadowFilter.ts — Vogel PCF with more taps for large-radius soft umbras
// @ts-nocheck — TSL node parameter typings incomplete in r185
import {
  add,
  Fn,
  float,
  interleavedGradientNoise,
  reference,
  renderGroup,
  screenCoordinate,
  texture,
  vec2,
  vogelDiskSample,
} from 'three/tsl';

const SAMPLE_COUNT = 16;

/**
 * Wider Vogel-disk PCF than Three's built-in 5-tap filter.
 * Large shadow.radius (20–48 texels) needs more taps or soft umbras look sparse/hard.
 */
export const WidePCFShadowFilter = /*@__PURE__*/ Fn(
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
    const phi = interleavedGradientNoise(screenCoordinate.xy).mul(6.28318530718);

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
