// src/rendering/sunShadow/coverageShadowFilter.ts — hard/cheap far-cascade PCF (texel radius ~1.5)
// @ts-nocheck — TSL node parameter typings incomplete in r185
import { add, Fn, float, reference, renderGroup, texture, vec2, vogelDiskSample } from 'three/tsl';

const SAMPLE_COUNT = 8;
/** Fixed texel radius — far map is coverage only when the near cascade owns soft PCSS. */
const COVERAGE_RADIUS_TEXELS = 1.5;

/**
 * Small-radius Vogel PCF for the wide/far sun map when a dense near cascade is active.
 * Avoids min(near PCSS, far PCSS) stacking a multi-meter soft halo over sharp near contact.
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
    const radiusScaled = float(COVERAGE_RADIUS_TEXELS).mul(texelSize.x);
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
