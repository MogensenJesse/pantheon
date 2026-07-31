// src/rendering/sunShadow/vogelCoverageFilterTsl.ts — shared Vogel PCF builder for far + cloud-cast
// @ts-nocheck — TSL node parameter typings incomplete in r185
import { add, Fn, float, reference, renderGroup, texture, vec2, vogelDiskSample } from 'three/tsl';

type FilterArgs = {
  depthTexture: any;
  shadowCoord: any;
  shadow: any;
  depthLayer: any;
};

/**
 * Fixed-phi Vogel-disk compare PCF. `radiusTexels` is a TSL node in shadow-map texels,
 * or a factory that builds one from the filter args (e.g. `shadow.radius`).
 */
export function createVogelCoverageFilter(
  sampleCount: number,
  radiusTexels: any | ((args: FilterArgs) => any),
) {
  return /*@__PURE__*/ Fn((args: FilterArgs) => {
    const { depthTexture, shadowCoord, shadow, depthLayer } = args;
    const depthCompare = (uv, compare) => {
      let depth = texture(depthTexture, uv);
      if (depthTexture.isArrayTexture) {
        depth = depth.depth(depthLayer);
      }
      return depth.compare(compare);
    };

    const mapSize = reference('mapSize', 'vec2', shadow).setGroup(renderGroup);
    const texelSize = vec2(1).div(mapSize);
    const radiusNode = typeof radiusTexels === 'function' ? radiusTexels(args) : radiusTexels;
    const radiusScaled = radiusNode.mul(texelSize.x);
    const phi = float(0);

    const taps = [];
    for (let i = 0; i < sampleCount; i++) {
      taps.push(
        depthCompare(
          shadowCoord.xy.add(vogelDiskSample(float(i), float(sampleCount), phi).mul(radiusScaled)),
          shadowCoord.z,
        ),
      );
    }

    return add(...taps).mul(1 / sampleCount);
  });
}
