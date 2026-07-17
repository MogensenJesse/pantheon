// src/rendering/sunShadow/pcssShadowFilter.ts — PCSS Vogel filter on color-depth RT (no compare)
// @ts-nocheck — TSL node parameter typings incomplete in r185
import {
  add,
  Fn,
  float,
  floor,
  fract,
  If,
  max,
  min,
  mix,
  reference,
  renderGroup,
  step,
  texture,
  vec2,
  vogelDiskSample,
} from 'three/tsl';
import { contactShadowUniforms } from './contactShadowUniforms';

const BLOCKER_SAMPLE_COUNT = 24;
const FILTER_SAMPLE_COUNT = 16;
/** Fixed coverage for elevated/cloud blockers; intentionally independent of softMax. */
const BLOCKER_SEARCH_RADIUS_TEXELS = 64;
/** Smoothly favors receiver-near blockers without the instability of selecting one closest tap. */
const BLOCKER_WEIGHT_SQUARE_SCALE = 0.01;

/**
 * Percentage-Closer Soft Shadows on a non-compare color depth map (R32F).
 *
 * One deterministic blocker search estimates a receiver-near weighted mean gap.
 * Visibility uses 2×2 bilinear PCF (like hardware shadow compare) so shadow-map
 * texels do not appear as hard triangles that crawl with the follow light. The
 * same fixed Vogel kernel is used at every radius to avoid branch seams.
 */
export const PcssShadowFilter = /*@__PURE__*/ Fn(
  ({ depthTexture, shadowCoord, shadow, depthLayer }, builder) => {
    const mapSize = reference('mapSize', 'vec2', shadow).setGroup(renderGroup);
    const texelSize = vec2(1).div(mapSize);

    const uSoftMin = contactShadowUniforms.uSoftnessMin;
    const uSoftMax = contactShadowUniforms.uSoftnessMax;
    const uPenumbraScale = contactShadowUniforms.uPenumbraScale;

    const reversed = builder.renderer.reversedDepthBuffer === true;

    const sampleDepth = (uv) => {
      let depth = texture(depthTexture, uv);
      if (depthTexture.isArrayTexture) {
        depth = depth.depth(depthLayer);
      }
      return depth.x;
    };

    const depthVis = (d) => (reversed ? step(d, shadowCoord.z) : step(shadowCoord.z, d));

    /**
     * Bilinear percentage-closer filter — blends 2×2 binary depth tests.
     * Removes hard shadow-texel sawteeth that slid with the player-follow light.
     */
    const sampleVisibilityBilinear = (uv) => {
      const coord = uv.mul(mapSize).sub(0.5);
      const base = floor(coord);
      const f = fract(coord);
      const uv00 = base.add(vec2(0.5, 0.5)).div(mapSize);
      const uv10 = base.add(vec2(1.5, 0.5)).div(mapSize);
      const uv01 = base.add(vec2(0.5, 1.5)).div(mapSize);
      const uv11 = base.add(vec2(1.5, 1.5)).div(mapSize);
      const v00 = depthVis(sampleDepth(uv00));
      const v10 = depthVis(sampleDepth(uv10));
      const v01 = depthVis(sampleDepth(uv01));
      const v11 = depthVis(sampleDepth(uv11));
      return mix(mix(v00, v10, f.x), mix(v01, v11, f.x), f.y);
    };

    const isBlocker = (sampleD) =>
      reversed ? sampleD.greaterThan(shadowCoord.z) : sampleD.lessThan(shadowCoord.z);

    const blockerGap = (sampleD) =>
      reversed
        ? max(sampleD.sub(shadowCoord.z), float(0))
        : max(shadowCoord.z.sub(sampleD), float(0));

    const weightedGapSum = float(0).toVar();
    const blockerWeightSum = float(0).toVar();
    const accumulateBlocker = (sampleD) => {
      If(isBlocker(sampleD), () => {
        const gap = blockerGap(sampleD);
        const gapTexels = gap.mul(uPenumbraScale);
        const weight = float(1).div(
          float(1).add(gapTexels.mul(gapTexels).mul(BLOCKER_WEIGHT_SQUARE_SCALE)),
        );
        weightedGapSum.addAssign(gap.mul(weight));
        blockerWeightSum.addAssign(weight);
      });
    };

    // The center tap prevents a sparse search miss directly under a thin caster.
    accumulateBlocker(sampleDepth(shadowCoord.xy));
    const searchRadiusUv = texelSize.mul(BLOCKER_SEARCH_RADIUS_TEXELS);
    const fixedPhi = float(0);
    for (let i = 0; i < BLOCKER_SAMPLE_COUNT; i++) {
      const offset = vogelDiskSample(float(i), float(BLOCKER_SAMPLE_COUNT), fixedPhi).mul(
        searchRadiusUv,
      );
      accumulateBlocker(sampleDepth(shadowCoord.xy.add(offset)));
    }

    // No blockers yields gap=0 and therefore softMin filtering, never an unfiltered bright patch.
    const meanGap = weightedGapSum.div(max(blockerWeightSum, float(0.00001)));
    const radiusTexels = min(max(meanGap.mul(uPenumbraScale), uSoftMin), uSoftMax);
    const filterRadiusUv = texelSize.mul(radiusTexels);
    const filterTaps = [];
    for (let i = 0; i < FILTER_SAMPLE_COUNT; i++) {
      filterTaps.push(
        sampleVisibilityBilinear(
          shadowCoord.xy.add(
            vogelDiskSample(float(i), float(FILTER_SAMPLE_COUNT), fixedPhi).mul(filterRadiusUv),
          ),
        ),
      );
    }

    return add(...filterTaps).mul(1 / FILTER_SAMPLE_COUNT);
  },
);
