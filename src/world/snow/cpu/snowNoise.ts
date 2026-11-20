// src/world/snow/cpu/snowNoise.ts — CPU port of three's `triNoise3D` (TSL), so the snow bake matches the terrain splat's snow line
//
// Same four iterations and constants as three/src/nodes/math/TriNoise3D.js; the splat calls it with speed 0.2, time 0.
// Pure: no imports, so the node checks can run it.

const tri = (x: number): number => Math.abs(x - Math.floor(x) - 0.5);

/** Triangle-wave noise in [0, ~1.1], the value `triNoise3D(vec3(px, py, pz), speed, time)` gives on the GPU. */
export function triNoise3D(px: number, py: number, pz: number, speed = 0.2, time = 0): number {
  let x = px;
  let y = py;
  let z = pz;
  let bx = px;
  let by = py;
  let bz = pz;
  let scale = 1.4;
  let sum = 0;
  const drift = time * 0.1 * speed;
  for (let i = 0; i < 4; i++) {
    const qx = bx * 2;
    const qy = by * 2;
    const qz = bz * 2;
    x += tri(qz + tri(qy)) + drift;
    y += tri(qz + tri(qx)) + drift;
    z += tri(qy + tri(qx)) + drift;
    bx *= 1.8;
    by *= 1.8;
    bz *= 1.8;
    scale *= 1.5;
    x *= 1.2;
    y *= 1.2;
    z *= 1.2;
    sum += tri(z + tri(x + tri(y))) / scale;
    bx += 0.14;
    by += 0.14;
    bz += 0.14;
  }
  return sum;
}
