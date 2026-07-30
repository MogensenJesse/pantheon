// src/rendering/sunShadow/pcssShadowFilter.ts — PCSS: compare PCF filter + R32F blocker search
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
  positionWorld,
  reference,
  renderGroup,
  texture,
  vec2,
  vogelDiskSample,
} from 'three/tsl';
import { VISUAL } from '../../config/visualTuning';
import { contactShadowUniforms } from './contactShadowUniforms';

/** Compile-time Vogel counts from VISUAL — reload after changing pcss*Samples. */
const BLOCKER_SAMPLE_COUNT = VISUAL.shadows.lighting.pcssBlockerSamples;
const FILTER_SAMPLE_COUNT = VISUAL.shadows.lighting.pcssFilterSamples;
/** Blocker-search disk from VISUAL — independent of softMax. */
const BLOCKER_SEARCH_RADIUS_TEXELS = VISUAL.shadows.lighting.pcssBlockerSearchTexels;
/** Smoothly favors receiver-near blockers without the instability of selecting one closest tap. */
const BLOCKER_WEIGHT_SQUARE_SCALE = 0.01;
const TWO_PI = Math.PI * 2;

/**
 * Percentage-Closer Soft Shadows (near cascade ground receive).
 *
 * Filter taps sample the **compare** depth texture (hardware 2×2 PCF via `.compare()`).
 * Blocker search bilinear-samples a downsampled R32F min/max-reduced map
 * (`blockerDepthTexture`) — PCSS cannot read gaps through a compare sampler.
 *
 * World-anchored Vogel dither (`uVogelGridM` / `pcssVogelGridM`) rotates the kernel per
 * receiver cell to break soft-penumbra ring banding. Do not seed from shadowCoord.
 * Soft umbra fetches ≈ 1 + blockerSamples + filterSamples.
 */
export const PcssShadowFilter = /*@__PURE__*/ Fn(
  ({ depthTexture, blockerDepthTexture, shadowCoord, shadow, depthLayer }, builder) => {
    const mapSize = reference('mapSize', 'vec2', shadow).setGroup(renderGroup);
    const texelSize = vec2(1).div(mapSize);

    const uSoftMin = contactShadowUniforms.uSoftnessMin;
    const uSoftMax = contactShadowUniforms.uSoftnessMax;
    const uPenumbraScale = contactShadowUniforms.uPenumbraScale;
    const uVogelGridM = contactShadowUniforms.uVogelGridM;

    const reversed = builder.renderer.reversedDepthBuffer === true;

    // Anti-banding: rotate Vogel per world cell. 0 grid → fixed phi. Never hash shadowCoord.
    const cell = floor(positionWorld.xz.div(max(uVogelGridM, float(1e-6))));
    const vogelPhi = uVogelGridM
      .greaterThan(0)
      .select(fract(cell.dot(vec2(12.9898, 78.233)).sin().mul(43758.5453)).mul(TWO_PI), float(0));

    /** Raw depth from the R32F blocker map (or compare depth as fallback). */
    const sampleBlockerDepth = (uv) => {
      const src = blockerDepthTexture ?? depthTexture;
      let depth = texture(src, uv);
      if (src.isArrayTexture) {
        depth = depth.depth(depthLayer);
      }
      return depth.x;
    };

    /** Hardware percentage-closer sample — LinearFilter depth gives free 2×2 PCF. */
    const depthCompare = (uv, compare) => {
      let depth = texture(depthTexture, uv);
      if (depthTexture.isArrayTexture) {
        depth = depth.depth(depthLayer);
      }
      return depth.compare(compare);
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

    accumulateBlocker(sampleBlockerDepth(shadowCoord.xy));
    const searchRadiusUv = texelSize.mul(BLOCKER_SEARCH_RADIUS_TEXELS);
    for (let i = 0; i < BLOCKER_SAMPLE_COUNT; i++) {
      const offset = vogelDiskSample(float(i), float(BLOCKER_SAMPLE_COUNT), vogelPhi).mul(
        searchRadiusUv,
      );
      accumulateBlocker(sampleBlockerDepth(shadowCoord.xy.add(offset)));
    }

    // No blockers → softMin; never an unfiltered bright patch.
    const radiusTexels = min(
      max(weightedGapSum.div(max(blockerWeightSum, float(0.00001))).mul(uPenumbraScale), uSoftMin),
      uSoftMax,
    );
    const filterRadiusUv = texelSize.mul(radiusTexels);

    const softTaps = [];
    for (let i = 0; i < FILTER_SAMPLE_COUNT; i++) {
      softTaps.push(
        depthCompare(
          shadowCoord.xy.add(
            vogelDiskSample(float(i), float(FILTER_SAMPLE_COUNT), vogelPhi).mul(filterRadiusUv),
          ),
          shadowCoord.z,
        ),
      );
    }
    return add(...softTaps).mul(1 / FILTER_SAMPLE_COUNT);
  },
);
