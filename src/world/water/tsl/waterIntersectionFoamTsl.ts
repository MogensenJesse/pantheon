// src/world/water/tsl/waterIntersectionFoamTsl.ts — seaward waterline foam + landward wet sand
import {
  Fn,
  float,
  fwidth,
  If,
  max,
  min,
  mix,
  sin,
  smoothstep,
  time,
  triNoise3D,
  vec3,
} from 'three/tsl';
import type { WaterWaveUniforms } from '../material/waterWaveUniforms';

type TslNode = any;

export const FOAM_AA_MIN_M = 0.008;

/** Slower patch field [0,1] — drives thick/opaque vs thin/translucent foam along the shore. */
function waterFoamPatchMaskTsl(worldXZ: TslNode, wave: WaterWaveUniforms) {
  const t = time.mul(wave.uFoamRippleSpeed.mul(0.28));
  const scale = wave.uFoamPatchScale;
  const blobA = sin(worldXZ.x.mul(scale).add(t.mul(0.65)))
    .mul(sin(worldXZ.y.mul(scale.mul(1.13)).add(t.mul(0.45))))
    .mul(0.6);
  const blobB = sin(worldXZ.x.mul(scale.mul(1.9)).sub(t.mul(0.9))).mul(0.25);
  const blobC = sin(worldXZ.y.mul(scale.mul(2.4)).add(t.mul(1.1))).mul(0.2);
  const raw = blobA.add(blobB).add(blobC).mul(0.5).add(0.5).clamp(0, 1);
  return mix(float(1), raw, wave.uFoamPatchVariation);
}

/** triNoise3D ~[0,1] → metres of waterline scallop. */
function waterFoamScallopOffsetTsl(worldXZ: TslNode, wave: WaterWaveUniforms): TslNode {
  const n = triNoise3D(
    vec3(worldXZ.x, float(0), worldXZ.y).mul(wave.uFoamRippleScale),
    float(0.25),
    time.mul(wave.uFoamRippleSpeed),
  );
  return n.sub(0.5).mul(2).mul(wave.uFoamRippleAmplitude);
}

/** Slow traveling sine along world XZ — advances and retreats the line. */
function waterFoamRunUpPhaseTsl(worldXZ: TslNode, wave: WaterWaveUniforms): TslNode {
  const period = max(wave.uRunUpPeriodSec, float(0.1));
  return worldXZ.x
    .add(worldXZ.y)
    .mul(0.08)
    .add(time.mul(float(Math.PI * 2)).div(period));
}

function waterFoamRunUpOffsetTsl(worldXZ: TslNode, wave: WaterWaveUniforms): TslNode {
  return sin(waterFoamRunUpPhaseTsl(worldXZ, wave)).mul(wave.uRunUpM);
}

/** [0,1] lagged behind tidal bob — peaks while the wave is receding. */
function waterWetSandTideFactorTsl(wave: WaterWaveUniforms): TslNode {
  return sin(time.mul(wave.uWaveSpeed).sub(wave.uWetSandPhaseLag))
    .mul(0.5)
    .add(0.5)
    .mul(wave.uTideEnabled);
}

function waterWetSandWidthTsl(wave: WaterWaveUniforms): TslNode {
  return mix(wave.uWetSandMinM, wave.uWetSandM, waterWetSandTideFactorTsl(wave));
}

function waterFoamWarpedDistanceTsl(
  distM: TslNode,
  worldXZ: TslNode,
  wave: WaterWaveUniforms,
): TslNode {
  const offset = waterFoamScallopOffsetTsl(worldXZ, wave)
    .add(waterFoamRunUpOffsetTsl(worldXZ, wave))
    .mul(wave.uTideEnabled);
  return distM.sub(offset);
}

function waterFoamWidthScaleTsl(worldXZ: TslNode, wave: WaterWaveUniforms): TslNode {
  return mix(wave.uFoamWidthMinRatio, float(1), waterFoamPatchMaskTsl(worldXZ, wave));
}

/**
 * [0,1] seaward foam from horizontal shore distance (positive = underwater).
 * `fwidth` runs in uniform control flow so AA stays legal inside later branches.
 *
 * Do not use `viewportLinearDepth` here: in this pass(scene) + transparent water path
 * the gap is ~0 on every water pixel and the disc goes white.
 */
export const waterSurfaceFoamMaskTsl = Fn(([worldXZ, wave, distM]: TslNode[]) => {
  const warped = waterFoamWarpedDistanceTsl(distM, worldXZ, wave);
  // Cap AA so a slope/height crease cannot widen the stripe across the disc.
  const aa = min(
    max(fwidth(warped), float(FOAM_AA_MIN_M)),
    max(wave.uFoamWidthM, float(FOAM_AA_MIN_M)),
  );
  const widthScale = waterFoamWidthScaleTsl(worldXZ, wave);
  const washW = max(wave.uFoamWidthM.mul(widthScale), float(1e-4));
  const foamOpacity = mix(wave.uFoamOpacityMin, float(1), waterFoamPatchMaskTsl(worldXZ, wave));

  const inland = smoothstep(aa.negate(), float(0), warped);
  const band = float(1)
    .sub(smoothstep(washW, washW.add(aa), warped))
    .mul(inland);

  return band.mul(foamOpacity).mul(wave.uTideEnabled);
});

/** Composite foam onto water albedo (after refraction so the stripe sits on the surface). */
export const applyWaterSurfaceFoamColorTsl = Fn(([baseColor, foamMask, wave]: TslNode[]) =>
  mix(baseColor, wave.uFoamColor, foamMask as TslNode),
);

/** Lift opacity toward 1 under foam so submerged terrain cannot show through the stripe. */
export const applyWaterSurfaceFoamOpacityTsl = Fn(([baseAlpha, foamMask]: TslNode[]) =>
  mix(baseAlpha, float(1), foamMask as TslNode),
);

/**
 * Landward wet-sand darken on terrain — no shore lace, only a smooth ramp inland from the waterline.
 * `aaM` must be `fwidth` of unwarped shore distance (or a height-based proxy) in uniform control
 * flow. Scallop noise runs only inside the near-shore branch.
 */
export const applyWaterTerrainWetnessTsl = Fn(
  ([baseColor, worldXZ, distM, wave, aaM]: TslNode[]) => {
    const aa = max(aaM, float(FOAM_AA_MIN_M));
    const wetWidthM = waterWetSandWidthTsl(wave);
    const result = baseColor.toVar();
    const gate = wave.uWetSandM.add(wave.uFoamRippleAmplitude).add(wave.uRunUpM).add(float(0.35));

    If(
      distM
        .abs()
        .lessThan(gate)
        .and(wave.uTideEnabled.greaterThan(float(0.5))),
      () => {
        const warped = waterFoamWarpedDistanceTsl(distM, worldXZ, wave);
        const landward = float(1).sub(smoothstep(float(0), aa, warped));
        const wet = smoothstep(wetWidthM.negate().sub(aa), float(0), warped).mul(landward);
        result.assign(
          mix(baseColor, baseColor.mul(float(1).sub(wave.uWetSandDarken)), wet as TslNode),
        );
      },
    );

    return result;
  },
);
