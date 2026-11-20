// src/world/snow/cpu/snowBrushRects.ts — the part of the toroidal tracks field a brush can touch, as texel rectangles
//
// A brush is a few decimetres wide on a 64 m window: drawing it over the whole texture would fill a million texels for
// nothing. The window wraps, so a brush near the edge is up to four rectangles. Pure: no imports.

/**
 * A rectangle of field pixels as a scissor wants it: x, y, width, height, with y counted from the TOP row. three's
 * `QuadMesh` has uv.y = 0 at the top (uv runs down the target), so world z with fract(z / windowM) = f sits at row f * res.
 */
export type TexelRect = readonly [x: number, y: number, w: number, h: number];

/** The wrapped runs `[start, length]` of an interval of `span` texels starting at `from` on a ring of `res` texels. */
function runs(from: number, span: number, res: number): [number, number][] {
  if (span >= res) return [[0, res]];
  const s = ((from % res) + res) % res;
  return s + span <= res
    ? [[s, span]]
    : [
        [s, res - s],
        [0, span - (res - s)],
      ];
}

/** Every texel within `reachM` of world (x, z), with two texels of slack, as at most four rectangles. */
export function brushRects(
  x: number,
  z: number,
  reachM: number,
  windowM: number,
  res: number,
): TexelRect[] {
  const texelM = windowM / res;
  const span = Math.min(res, Math.ceil((2 * reachM) / texelM) + 2);
  const fx = x / windowM - Math.floor(x / windowM);
  const fz = z / windowM - Math.floor(z / windowM);
  const xs = runs(Math.floor(fx * res - span / 2), span, res);
  const zs = runs(Math.floor(fz * res - span / 2), span, res);
  const out: TexelRect[] = [];
  for (const [zy, zh] of zs) for (const [xx, xw] of xs) out.push([xx, zy, xw, zh]);
  return out;
}
