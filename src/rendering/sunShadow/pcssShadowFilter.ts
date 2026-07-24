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
import { VISUAL } from '../../config/visualTuning';
import { contactShadowUniforms } from './contactShadowUniforms';

/** Compile-time Vogel counts from VISUAL — reload after changing pcss*Samples. */
const BLOCKER_SAMPLE_COUNT = VISUAL.shadows.lighting.pcssBlockerSamples;
const FILTER_SAMPLE_COUNT = VISUAL.shadows.lighting.pcssFilterSamples;
/**
 * Near-contact Vogel taps (each 2×2 bilinear). Kept small — softMin radii do not need
 * a dense soft-umbra disk.
 */
const CONTACT_FILTER_SAMPLE_COUNT = 8;
/** Treat radii up to softMin+this as contact (bilinear path). */
const CONTACT_RADIUS_SLACK_TEXELS = 2;
/** Blocker-search disk from VISUAL — independent of softMax. */
const BLOCKER_SEARCH_RADIUS_TEXELS = VISUAL.shadows.lighting.pcssBlockerSearchTexels;
/** Smoothly favors receiver-near blockers without the instability of selecting one closest tap. */
const BLOCKER_WEIGHT_SQUARE_SCALE = 0.01;
const TWO_PI = Math.PI * 2;

/**
 * Percentage-Closer Soft Shadows on a non-compare color depth map (R32F).
 *
 * Blocker search is skipped when `uForceSoftMax` (cloud *receive*). Cloud *cast* uses a
 * dedicated soft map. Near-contact radii use 2×2 bilinear Vogel taps (crawl-free);
 * mid/large penumbrae use point-sampled Vogel taps (no ×4). Vogel phi is hashed from
 * shadow UV (stable, no temporal shimmer).
 *
 * Fetch cost (approx):
 * - Contact: 1 + blockerSamples + contactTaps×4
 * - Soft umbra: 1 + blockerSamples + filterSamples
 * - Force softMax receive: filterSamples only
 * Toggle `usePcss: false` for the WidePCF baseline (~16 compare taps) when profiling.
 */
export const PcssShadowFilter = /*@__PURE__*/ Fn(
  ({ depthTexture, shadowCoord, shadow, depthLayer }, builder) => {
    const mapSize = reference('mapSize', 'vec2', shadow).setGroup(renderGroup);
    const texelSize = vec2(1).div(mapSize);

    const uSoftMin = contactShadowUniforms.uSoftnessMin;
    const uSoftMax = contactShadowUniforms.uSoftnessMax;
    const uPenumbraScale = contactShadowUniforms.uPenumbraScale;
    const uForceSoftMax = contactShadowUniforms.uForceSoftMax;

    const reversed = builder.renderer.reversedDepthBuffer === true;

    const sampleDepth = (uv) => {
      let depth = texture(depthTexture, uv);
      if (depthTexture.isArrayTexture) {
        depth = depth.depth(depthLayer);
      }
      return depth.x;
    };

    const depthVis = (d) => (reversed ? step(d, shadowCoord.z) : step(shadowCoord.z, d));

    /** Point percentage-closer sample — one depth fetch. */
    const sampleVisibilityPoint = (uv) => depthVis(sampleDepth(uv));

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

    // Shadow-UV hash → stable Vogel rotation (breaks ring banding without temporal shimmer).
    const vogelPhi = fract(
      shadowCoord.x.mul(12.9898).add(shadowCoord.y.mul(78.233)).sin().mul(43758.5453),
    ).mul(TWO_PI);

    // Clouds (FORCE_MAX_SHADOW_SOFTNESS) already filter at softMax — skip blocker search.
    If(uForceSoftMax.equal(0), () => {
      // Center tap prevents a sparse search miss directly under a thin caster.
      accumulateBlocker(sampleDepth(shadowCoord.xy));
      const searchRadiusUv = texelSize.mul(BLOCKER_SEARCH_RADIUS_TEXELS);
      for (let i = 0; i < BLOCKER_SAMPLE_COUNT; i++) {
        const offset = vogelDiskSample(float(i), float(BLOCKER_SAMPLE_COUNT), vogelPhi).mul(
          searchRadiusUv,
        );
        accumulateBlocker(sampleDepth(shadowCoord.xy.add(offset)));
      }
    });

    // No blockers yields gap=0 and therefore softMin filtering, never an unfiltered bright patch.
    // Materials with FORCE_MAX_SHADOW_SOFTNESS always filter at softMax.
    const meanGap = weightedGapSum.div(max(blockerWeightSum, float(0.00001)));
    const radiusFromGap = min(max(meanGap.mul(uPenumbraScale), uSoftMin), uSoftMax);
    const radiusTexels = mix(radiusFromGap, uSoftMax, uForceSoftMax);
    const filterRadiusUv = texelSize.mul(radiusTexels);
    const contactRadiusMax = uSoftMin.add(float(CONTACT_RADIUS_SLACK_TEXELS));

    const visibility = float(0).toVar();
    If(radiusTexels.lessThanEqual(contactRadiusMax), () => {
      const contactTaps = [];
      for (let i = 0; i < CONTACT_FILTER_SAMPLE_COUNT; i++) {
        contactTaps.push(
          sampleVisibilityBilinear(
            shadowCoord.xy.add(
              vogelDiskSample(float(i), float(CONTACT_FILTER_SAMPLE_COUNT), vogelPhi).mul(
                filterRadiusUv,
              ),
            ),
          ),
        );
      }
      visibility.assign(add(...contactTaps).mul(1 / CONTACT_FILTER_SAMPLE_COUNT));
    }).Else(() => {
      const softTaps = [];
      for (let i = 0; i < FILTER_SAMPLE_COUNT; i++) {
        softTaps.push(
          sampleVisibilityPoint(
            shadowCoord.xy.add(
              vogelDiskSample(float(i), float(FILTER_SAMPLE_COUNT), vogelPhi).mul(filterRadiusUv),
            ),
          ),
        );
      }
      visibility.assign(add(...softTaps).mul(1 / FILTER_SAMPLE_COUNT));
    });

    return visibility;
  },
);
