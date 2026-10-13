// @ts-nocheck — TSL node parameter typings incomplete in r184
// src/world/terrain/tsl/fineDeltaTsl.ts — GPU twin of fineDelta.ts: the levelling offset at a world point
import type { DataTexture } from 'three';
import { Fn, float, ivec2, mix, step, textureLoad, vec2 } from 'three/tsl';
import type { FineDelta } from '../cpu/fineDelta';

/**
 * Offset (m) at a world XZ, 0 outside the region. Same triangle interpolation as the CPU
 * (`sampleFineDelta`), with integer texel loads so it needs no sampler or derivatives and can run in
 * compute and vertex stages (grass). Every call that adds it keeps the 16-texture fragment budget in
 * mind: only the grass height path reads this, never the terrain fragment shader.
 */
export function createFineDeltaTsl(fd: FineDelta, texture: DataTexture) {
  const cells = fd.nodes - 1;
  const limit = float(cells - 1e-3);
  return Fn(([worldXZ]) => {
    const p = worldXZ.sub(vec2(fd.originX, fd.originZ)).div(fd.stepM);
    const inside = step(float(0), p.x)
      .mul(step(p.x, limit))
      .mul(step(float(0), p.y))
      .mul(step(p.y, limit));
    const pc = p.clamp(vec2(0, 0), vec2(limit, limit));
    const cell = pc.floor();
    const t = pc.sub(cell);
    const at = (dx, dz) => textureLoad(texture, ivec2(cell.x.add(dx), cell.y.add(dz))).r;
    const d00 = at(0, 0);
    const d10 = at(1, 0);
    const d01 = at(0, 1);
    const d11 = at(1, 1);
    const lower = d00.mul(float(1).sub(t.x).sub(t.y)).add(d01.mul(t.y)).add(d10.mul(t.x));
    const upper = d01
      .mul(float(1).sub(t.x))
      .add(d11.mul(t.x.add(t.y).sub(float(1))))
      .add(d10.mul(float(1).sub(t.y)));
    return mix(lower, upper, step(float(1), t.x.add(t.y))).mul(inside);
  });
}
