// src/world/water/tsl/waterWavesTsl.ts — the open-sea swell: a sum of Gerstner waves in the vertex shader, and its whitecaps
//
// The swell always travels toward the nearest shore: its phase is the distance to the shore (the baked field, see
// waves/shoreFieldBake.ts), so crests run parallel to the coast and bend around the island, and the horizontal shift and the
// slope follow the field's gradient. Twin of `swellHeightAt` in waves/waveMath.ts (same table, same fade, same shoaling; the
// CPU twin leaves out the horizontal shift). The phase runs on the wind clock, so the swell stops with the game.
import { cos, float, length, mix, sin, smoothstep, vec2, vec3 } from 'three/tsl';
import { WORLD } from '../../../config/world';
import { terrainGridUv } from '../../../map/mapUvTsl';
import { windUniforms } from '../../../rendering/ambience/windUniforms';
import { waterWaveUniforms } from '../material/waterWaveUniforms';
import { SHORE_FIELD_SIZE } from '../waves/shoreFieldBake';

type TslNode = any;

export interface SwellSample {
  /** World-space displacement (x, y up, z) in metres. */
  displacement: TslNode;
  /** Surface slope (d height / dx, d height / dz). */
  slope: TslNode;
  /** Height as a share of the full swell height, -1..1, zero where the water is too shallow for a swell. */
  crest: TslNode;
}

/**
 * The shore field at a world point: `along` is the coordinate the swell travels along (minus the distance to the shore, so it
 * grows toward the shore) and `toward` its gradient (the way to the shore, about unit length, shorter where two coasts meet).
 * Beyond the map the distance keeps growing along the nearest edge texel's direction.
 */
export function shoreFieldTsl(worldXZ: TslNode): {
  along: TslNode;
  distM: TslNode;
  toward: TslNode;
  lake: TslNode;
} {
  const half = WORLD.SIZE * 0.5;
  const inside = worldXZ.max(vec2(-half, -half)).min(vec2(half, half));
  const t = waterWaveUniforms.uShoreField.sample(
    terrainGridUv(float(WORLD.SIZE), inside, SHORE_FIELD_SIZE),
  );
  const distM = t.x.add(length(worldXZ.sub(inside)));
  return {
    along: distM.negate(),
    distM,
    toward: vec2(t.y, t.z),
    lake: t.w,
  };
}

/**
 * 0 on the open sea, 1 in enclosed water (lakes, ponds) at a world point, from the shore field's lake share (land takes the
 * nearest water's). An explicit mip level, so it is legal in any branch (the terrain's wet sand reads it inside an `If`).
 */
export function lakeShareTsl(worldXZ: TslNode): TslNode {
  const half = WORLD.SIZE * 0.5;
  const inside = worldXZ.max(vec2(-half, -half)).min(vec2(half, half));
  return waterWaveUniforms.uShoreField
    .sample(terrainGridUv(float(WORLD.SIZE), inside, SHORE_FIELD_SIZE))
    .level(0).w;
}

/** The open sea's value times `share` in enclosed water: `uLake*Share` at lake share 1, 1 at lake share 0. */
export function lakeMulTsl(lake: TslNode, share: TslNode): TslNode {
  return mix(float(1), share, lake);
}

/**
 * `worldXZ` is the undisplaced point, `radiusM` its distance from the camera (components the mesh cannot resolve
 * fade out with it), `depthM` the water depth there (the swell dies out in the shallows).
 */
export function swellAtTsl(worldXZ: TslNode, radiusM: TslNode, depthM: TslNode): SwellSample {
  const U = waterWaveUniforms.swell;
  const t = windUniforms.uWindClock;
  const field = shoreFieldTsl(worldXZ);
  // the open sea is taller than the coast: the height and its shoaling depth grow together with the distance to the nearest
  // shore (so the water over a point still stays at least 40 % of its depth), 1 within `uOpenFromM`
  const grow = float(1).add(
    U.uOpenGain.sub(1).mul(smoothstep(U.uOpenFromM, U.uOpenToM, field.distM)),
  );
  const shoal = smoothstep(float(0), U.uShoalM.mul(grow).max(1e-4), depthM);
  // enclosed water: a lower swell on the open sea's shoaling depth; the crest share is scaled too, so the whitecaps (which
  // start at a crest share) never form on a calm lake
  const calm = lakeMulTsl(field.lake, waterWaveUniforms.uLakeSwellShare);
  const total = U.uHeightM.mul(grow).mul(shoal).mul(calm);

  let h: TslNode = float(0);
  let shiftX: TslNode = float(0);
  let shiftZ: TslNode = float(0);
  let slopeX: TslNode = float(0);
  let slopeZ: TslNode = float(0);
  let crest: TslNode = float(0);
  for (const c of U.components) {
    const angle = c.uK.mul(field.along).sub(c.uOmega.mul(t)).add(c.uPhase);
    const share = c.uAmp.mul(float(1).sub(smoothstep(c.uFade.x, c.uFade.y, radiusM)));
    const s = sin(angle);
    const shareCos = share.mul(cos(angle));
    h = h.add(share.mul(s));
    crest = crest.add(share.mul(s));
    shiftX = shiftX.add(shareCos.mul(field.toward.x));
    shiftZ = shiftZ.add(shareCos.mul(field.toward.y));
    slopeX = slopeX.add(shareCos.mul(c.uK).mul(field.toward.x));
    slopeZ = slopeZ.add(shareCos.mul(c.uK).mul(field.toward.y));
  }
  const shift = total.mul(U.uSteepness);
  return {
    displacement: vec3(shiftX.mul(shift), h.mul(total), shiftZ.mul(shift)),
    slope: vec2(slopeX.mul(total), slopeZ.mul(total)),
    crest: crest.mul(shoal).mul(calm),
  };
}

/**
 * Foam on the crests, 0..1: a crest share above `uWhiteCrest.x`, broken up by the water's fine normal noise
 * (`breakup` is its normal, x in -1..1), scaled by the whitecap strength (which grows with the wind).
 */
export function swellWhitecapTsl(crest: TslNode, breakup: TslNode): TslNode {
  const U = waterWaveUniforms.swell;
  const speck = breakup.x.mul(0.5).add(0.5);
  const lit = crest.mul(mix(float(0.75), float(1.25), speck));
  return smoothstep(U.uWhiteCrest.x, U.uWhiteCrest.y, lit).mul(U.uWhiteAmount);
}
