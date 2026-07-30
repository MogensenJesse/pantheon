// src/rendering/sunShadow/coverageShadowFilter.ts — cheap far-cascade Vogel PCF
// @ts-nocheck — TSL node parameter typings incomplete in r185
import { add, Fn, float, reference, renderGroup, texture, vec2, vogelDiskSample } from 'three/tsl';
import { farCoverageUniforms } from './farCoverageUniforms';

const SAMPLE_COUNT = 8;

/**
 * Small-radius Vogel PCF for the wide/far sun map (godrays, cloud receive, ground beyond near).
 * Radius from `farCoverageRadiusTexels` (live). Avoids stacking far soft PCSS over near contact.
 */
export const CoverageShadowFilter = /*@__PURE__*/ Fn(
  ({ depthTexture, shadowCoord, shadow, depthLayer }) => {
    const depthCompare = (uv, compare) => {
      let depth = texture(depthTexture, uv);
      if (depthTexture.isArrayTexture) {
        depth = depth.depth(depthLayer);
      }
      return depth.compare(compare);
    };

    const mapSize = reference('mapSize', 'vec2', shadow).setGroup(renderGroup);
    const texelSize = vec2(1).div(mapSize);
    const radiusScaled = farCoverageUniforms.uFarCoverageRadiusTexels.mul(texelSize.x);
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
