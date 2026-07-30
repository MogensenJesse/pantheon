// src/rendering/sunShadow/pcssShadowFilter.ts — PCSS: compare PCF filter + R32F blocker search
// @ts-nocheck — TSL node parameter typings incomplete in r185
import {
  add,
  dot,
  Fn,
  float,
  floor,
  fract,
  If,
  max,
  min,
  mix,
  positionWorld,
  reference,
  renderGroup,
  screenCoordinate,
  sin,
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
/**
 * World-XZ cell size (m) for Vogel rotation when pcssVogelSeed === 'world'.
 * 0 with world seed → fixed phi (same as seed 'fixed').
 */
const VOGEL_GRID_M = VISUAL.shadows.lighting.pcssVogelGridM;
/** Compile-time Vogel rotation seed — reload after change. */
const VOGEL_SEED = VISUAL.shadows.lighting.pcssVogelSeed;
/** Compile-time radius source — reload after change. */
const RADIUS_MODE = VISUAL.shadows.lighting.pcssRadiusMode;
const FIXED_RADIUS_TEXELS = VISUAL.shadows.lighting.pcssFixedRadiusTexels;
/** Blocker search only needed when radius comes from contact gap. */
const USE_BLOCKER_SEARCH = RADIUS_MODE === 'contact';
/** Smoothly favors receiver-near blockers without the instability of selecting one closest tap. */
const BLOCKER_WEIGHT_SQUARE_SCALE = 0.01;
const TWO_PI = Math.PI * 2;

/**
 * Drei SoftShadows high-pass noise (spawner64 / N8Programs): hp = noise − 3×3 low-pass + 0.5.
 * Screen-pixel seed stays fixed while the camera is still, so Vogel rotation does not re-roll
 * when shadow UVs drift under a slow day-cycle sun. Grain crawls in screen space when looking.
 */
function highPassScreenVogelPhi() {
  const pixel = floor(screenCoordinate.xy);
  const randR = (uv) => fract(sin(dot(uv, vec2(12.75613, 38.12123))).mul(13234.76575));

  let lowPass = float(0);
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      lowPass = lowPass.add(randR(pixel.add(vec2(dx, dy))));
    }
  }
  lowPass = lowPass.mul(1 / 9);
  const highPass = randR(pixel).sub(lowPass).add(0.5);
  return highPass.mul(TWO_PI);
}

function worldAnchoredVogelPhi() {
  if (!(VOGEL_GRID_M > 0)) return float(0);
  const cellX = floor(positionWorld.x.div(VOGEL_GRID_M));
  const cellZ = floor(positionWorld.z.div(VOGEL_GRID_M));
  return fract(cellX.mul(12.9898).add(cellZ.mul(78.233)).sin().mul(43758.5453)).mul(TWO_PI);
}

/**
 * Percentage-Closer Soft Shadows.
 *
 * Filter taps sample the **compare** depth texture (hardware 2×2 PCF via `.compare()`).
 * Blocker search bilinear-samples a downsampled R32F min/max-reduced map
 * (`blockerDepthTexture`) — PCSS cannot read gaps through a compare sampler.
 *
 * Vogel rotation seed (`pcssVogelSeed`):
 * - `screenHp` — drei high-pass from screen pixels (stable under sun UV drift; camera look crawls)
 * - `world` — quantized `positionWorld.xz` (stable under camera; UV-stable under walk)
 * - `fixed` — phi = 0 (banded, perfectly stable A/B)
 *
 * Radius mode (`pcssRadiusMode`):
 * - `contact` — blocker gap → penumbra (normal PCSS)
 * - `softMin` / `fixed` / `softMax` — constant radius; skips blocker search (radius-thrash A/B)
 *
 * Fetch cost (approx):
 * - Soft umbra: 1 + blockerSamples + filterSamples (contact mode)
 * - Constant-radius / force softMax receive: filterSamples only
 * Toggle `usePcss: false` for the WidePCF baseline (~16 compare taps) when profiling.
 */
export const PcssShadowFilter = /*@__PURE__*/ Fn(
  ({ depthTexture, blockerDepthTexture, shadowCoord, shadow, depthLayer }, builder) => {
    const mapSize = reference('mapSize', 'vec2', shadow).setGroup(renderGroup);
    const texelSize = vec2(1).div(mapSize);

    const uSoftMin = contactShadowUniforms.uSoftnessMin;
    const uSoftMax = contactShadowUniforms.uSoftnessMax;
    const uPenumbraScale = contactShadowUniforms.uPenumbraScale;
    const uForceSoftMax = contactShadowUniforms.uForceSoftMax;

    const reversed = builder.renderer.reversedDepthBuffer === true;

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

    const vogelPhi =
      VOGEL_SEED === 'fixed'
        ? float(0)
        : VOGEL_SEED === 'screenHp'
          ? highPassScreenVogelPhi()
          : worldAnchoredVogelPhi();

    // Contact mode + non-cloud: search blockers for penumbra radius.
    // softMin/fixed/softMax skip this — isolates radius thrash from filter sampling.
    if (USE_BLOCKER_SEARCH) {
      If(uForceSoftMax.equal(0), () => {
        accumulateBlocker(sampleBlockerDepth(shadowCoord.xy));
        const searchRadiusUv = texelSize.mul(BLOCKER_SEARCH_RADIUS_TEXELS);
        for (let i = 0; i < BLOCKER_SAMPLE_COUNT; i++) {
          const offset = vogelDiskSample(float(i), float(BLOCKER_SAMPLE_COUNT), vogelPhi).mul(
            searchRadiusUv,
          );
          accumulateBlocker(sampleBlockerDepth(shadowCoord.xy.add(offset)));
        }
      });
    }

    const radiusFromMode =
      RADIUS_MODE === 'softMin'
        ? uSoftMin
        : RADIUS_MODE === 'softMax'
          ? uSoftMax
          : RADIUS_MODE === 'fixed'
            ? float(FIXED_RADIUS_TEXELS)
            : // contact — no blockers → softMin; never an unfiltered bright patch.
              min(
                max(
                  weightedGapSum.div(max(blockerWeightSum, float(0.00001))).mul(uPenumbraScale),
                  uSoftMin,
                ),
                uSoftMax,
              );

    // Clouds (FORCE_MAX_SHADOW_SOFTNESS) always filter at softMax.
    const radiusTexels = mix(radiusFromMode, uSoftMax, uForceSoftMax);
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
