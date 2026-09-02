// src/world/terrain/tsl/terrainMacroHeightTsl.ts — GPU macro height + knife-chisel face normals
//
// Height models: `chiseledWorldYAtWorldXZ` is walkable/visible (mesh, waterline, wetness,
// prop ground-contact, snow overlay). `macroWorldYAtWorldXZ` (bilinear sculpt) is |∇h| /
// foam AA and height-band weights only — not contact, not placement, not snow.
import {
  Fn,
  float,
  If,
  length,
  max,
  min,
  mix,
  normalize,
  smoothstep,
  step,
  vec2,
  vec3,
} from 'three/tsl';
import { terrainMapUv } from '../../../map/mapUvTsl';

type TslNode = any;

/** Uniforms needed to sample sculpt height and snap it onto mesh-grid facets. */
export interface MacroHeightUniformSource {
  uHeightTex: TslNode;
  uHeightScale: TslNode;
  uWorldSize: TslNode;
  uFacetStepM: TslNode;
  uHeightNormalStep: TslNode;
  uChiselEdgeSoft: TslNode;
}

/** World-space macro height sampling from the sculpt grid texture. */
export function createMacroHeightTsl(uniforms: MacroHeightUniformSource) {
  const { uHeightTex, uHeightScale, uWorldSize, uHeightNormalStep, uFacetStepM, uChiselEdgeSoft } =
    uniforms as any;

  const sampleHeightNormAtWorldXZ = Fn(
    ([worldXZ]: TslNode[]) => uHeightTex.sample(terrainMapUv(uWorldSize, worldXZ)).r,
  );

  const macroWorldYAtWorldXZ = Fn(([worldXZ]: TslNode[]) =>
    sampleHeightNormAtWorldXZ(worldXZ).mul(uHeightScale),
  );

  /**
   * Central-difference macro normal at height-grid spacing (~1 m).
   * Used by grass / surface helpers — lighting uses facet face N instead.
   */
  const macroNormalAtWorldXZ = Fn(([worldXZ]: TslNode[]) => {
    const gridStep = uHeightNormalStep;
    const twoStep = gridStep.mul(2);
    const hL = sampleHeightNormAtWorldXZ(worldXZ.sub(vec2(gridStep, 0)));
    const hR = sampleHeightNormAtWorldXZ(worldXZ.add(vec2(gridStep, 0)));
    const hD = sampleHeightNormAtWorldXZ(worldXZ.sub(vec2(0, gridStep)));
    const hU = sampleHeightNormAtWorldXZ(worldXZ.add(vec2(0, gridStep)));
    const dx = hR.sub(hL).mul(uHeightScale).div(twoStep);
    const dz = hU.sub(hD).mul(uHeightScale).div(twoStep);
    const raw = normalize(vec3(dx.negate(), float(1), dz.negate()));
    const up = vec3(0, 1, 0);
    const flatBlend = smoothstep(float(0.92), float(0.99), raw.y);
    return normalize(mix(raw, up, flatBlend));
  });

  /**
   * Interpolate the coarse PlaneGeometry surface (after rotateX(-π/2)):
   * each quad is (00, +Z, +X) | (+Z, +X+Z, +X). Bilinear over the quad does not
   * match that diagonal, and the height gap reads as a sky slit on slopes.
   */
  const meshGridWorldYAtStep = Fn(([worldXZ, stepM]: TslNode[]) => {
    const inv = float(1).div(stepM);
    const origin = worldXZ.mul(inv).floor().mul(stepM);
    const t = worldXZ.mul(inv).fract();
    const y00 = macroWorldYAtWorldXZ(origin);
    const y10 = macroWorldYAtWorldXZ(origin.add(vec2(stepM, 0)));
    const y01 = macroWorldYAtWorldXZ(origin.add(vec2(0, stepM)));
    const y11 = macroWorldYAtWorldXZ(origin.add(vec2(stepM, stepM)));
    const yLower = y00.mul(float(1).sub(t.x).sub(t.y)).add(y01.mul(t.y)).add(y10.mul(t.x));
    const yUpper = y01
      .mul(float(1).sub(t.x))
      .add(y11.mul(t.x.add(t.y).sub(float(1))))
      .add(y10.mul(float(1).sub(t.y)));
    return mix(yLower, yUpper, step(float(1), t.x.add(t.y)));
  });

  /** Constant normal per virtual triangle (not interpolated corner normals). */
  const meshGridFaceNormalAtStep = Fn(([worldXZ, stepM]: TslNode[]) => {
    const inv = float(1).div(stepM);
    const origin = worldXZ.mul(inv).floor().mul(stepM);
    const t = worldXZ.mul(inv).fract();
    const y00 = macroWorldYAtWorldXZ(origin);
    const y10 = macroWorldYAtWorldXZ(origin.add(vec2(stepM, 0)));
    const y01 = macroWorldYAtWorldXZ(origin.add(vec2(0, stepM)));
    const y11 = macroWorldYAtWorldXZ(origin.add(vec2(stepM, stepM)));
    const nLower = normalize(vec3(y00.sub(y10), stepM, y00.sub(y01)));
    const nUpper = normalize(vec3(y01.sub(y11), stepM, y10.sub(y11)));
    return normalize(mix(nLower, nUpper, step(float(1), t.x.add(t.y))));
  });

  /**
   * Triangle centroid XZ. Lower: (00, +Z, +X); upper: (+Z, +X+Z, +X).
   * Snow coverage samples here so the weight is constant on a facet.
   */
  const meshGridFaceCentroidXZAtStep = Fn(([worldXZ, stepM]: TslNode[]) => {
    const inv = float(1).div(stepM);
    const origin = worldXZ.mul(inv).floor().mul(stepM);
    const t = worldXZ.mul(inv).fract();
    const upperF = step(float(1), t.x.add(t.y));
    const third = stepM.div(3);
    return mix(
      origin.add(vec2(third, third)),
      origin.add(vec2(third.mul(2), third.mul(2))),
      upperF,
    );
  });

  /**
   * Face N with a lighting-only crease fillet. Near a triangle edge, blend toward
   * the adjacent face (any interior sample — N is constant). Vertex Y stays planar.
   */
  const meshGridCreaseFilletNormalAtStep = Fn(([worldXZ, stepM]: TslNode[]) => {
    const n0 = meshGridFaceNormalAtStep(worldXZ, stepM);
    const nOut = n0.toVar();
    If(uChiselEdgeSoft.greaterThan(float(1e-4)), () => {
      const inv = float(1).div(stepM);
      const origin = worldXZ.mul(inv).floor().mul(stepM);
      const t = worldXZ.mul(inv).fract();
      const tx = t.x;
      const ty = t.y;
      const upperF = step(float(1), tx.add(ty));
      const invSqrt2 = float(Math.SQRT1_2);

      const dW = tx;
      const dS = ty;
      const dHlower = float(1).sub(tx).sub(ty).mul(invSqrt2);
      const edgeDistLower = min(dW, min(dS, dHlower));

      const dE = float(1).sub(tx);
      const dN = float(1).sub(ty);
      const dHupper = tx.add(ty).sub(float(1)).mul(invSqrt2);
      const edgeDistUpper = min(dE, min(dN, dHupper));
      const edgeDist = mix(edgeDistLower, edgeDistUpper, upperF);

      const hL = step(dHlower, dW).mul(step(dHlower, dS));
      const wL = float(1).sub(hL).mul(step(dW, dS));
      const sL = float(1).sub(hL).sub(wL);
      const neighLower = origin.add(
        vec2(stepM.mul(0.7), stepM.mul(0.7))
          .mul(hL)
          .add(vec2(stepM.mul(-0.3), stepM.mul(0.7)).mul(wL))
          .add(vec2(stepM.mul(0.7), stepM.mul(-0.3)).mul(sL)),
      );

      const hU = step(dHupper, dE).mul(step(dHupper, dN));
      const eU = float(1).sub(hU).mul(step(dE, dN));
      const nU = float(1).sub(hU).sub(eU);
      const neighUpper = origin.add(
        vec2(stepM.mul(0.25), stepM.mul(0.25))
          .mul(hU)
          .add(vec2(stepM.mul(1.25), stepM.mul(0.25)).mul(eU))
          .add(vec2(stepM.mul(0.25), stepM.mul(1.25)).mul(nU)),
      );

      const n1 = meshGridFaceNormalAtStep(mix(neighLower, neighUpper, upperF), stepM);
      const soft = max(uChiselEdgeSoft, float(1e-5));
      const filletW = float(1).sub(smoothstep(float(0), soft, edgeDist));
      nOut.assign(normalize(mix(n0, n1, filletW.mul(0.5))));
    });
    return nOut;
  });

  const chiseledWorldYAtWorldXZ = Fn(([worldXZ]: TslNode[]) =>
    meshGridWorldYAtStep(worldXZ, uFacetStepM),
  );

  /**
   * Smooth |∇h| from bilinear sculpt Y. Do not use knife-facet face N here:
   * piecewise-constant slope makes shoreDistanceM jump on every 8 m crease,
   * and foam `fwidth` paints those creases as a white grid on the water.
   */
  const macroSlopeAtWorldXZ = Fn(([worldXZ, stepM]: TslNode[]) => {
    const two = stepM.mul(2);
    const yL = macroWorldYAtWorldXZ(worldXZ.sub(vec2(stepM, 0)));
    const yR = macroWorldYAtWorldXZ(worldXZ.add(vec2(stepM, 0)));
    const yD = macroWorldYAtWorldXZ(worldXZ.sub(vec2(0, stepM)));
    const yU = macroWorldYAtWorldXZ(worldXZ.add(vec2(0, stepM)));
    return length(vec2(yR.sub(yL).div(two), yU.sub(yD).div(two)));
  });

  const chiseledWorldNormalAtWorldXZ = Fn(([worldXZ]: TslNode[]) =>
    meshGridCreaseFilletNormalAtStep(worldXZ, uFacetStepM),
  );

  /** Knife face N — no crease fillet. Snow coverage is one weight per facet. */
  const knifeWorldNormalAtWorldXZ = Fn(([worldXZ]: TslNode[]) =>
    meshGridFaceNormalAtStep(worldXZ, uFacetStepM),
  );

  const chiseledFaceCentroidXZAtWorldXZ = Fn(([worldXZ]: TslNode[]) =>
    meshGridFaceCentroidXZAtStep(worldXZ, uFacetStepM),
  );

  return {
    sampleHeightNormAtWorldXZ,
    macroWorldYAtWorldXZ,
    meshGridWorldYAtStep,
    meshGridFaceNormalAtStep,
    meshGridFaceCentroidXZAtStep,
    meshGridCreaseFilletNormalAtStep,
    macroNormalAtWorldXZ,
    chiseledWorldYAtWorldXZ,
    macroSlopeAtWorldXZ,
    chiseledWorldNormalAtWorldXZ,
    knifeWorldNormalAtWorldXZ,
    chiseledFaceCentroidXZAtWorldXZ,
  };
}

export type MacroHeightTsl = ReturnType<typeof createMacroHeightTsl>;
