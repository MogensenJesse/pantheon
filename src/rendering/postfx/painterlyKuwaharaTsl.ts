// src/rendering/postfx/painterlyKuwaharaTsl.ts — anisotropic Kuwahara (Kyprianidis polynomial weights) + canvas grain
import {
  abs,
  clamp,
  dot,
  exp,
  Fn,
  float,
  fract,
  If,
  int,
  Loop,
  max,
  pow,
  screenUV,
  sin,
  sqrt,
  vec2,
  vec3,
  vec4,
} from 'three/tsl';
import type { TslNode } from './tslNode';

const SECTORS = 8;

export interface KuwaharaUniforms {
  /** Filter radius in full-res pixels. */
  radius: TslNode;
  /** Ellipse flattening on edges (smaller = longer, thinner strokes). */
  anisotropy: TslNode;
  /** Sector variance gate: higher = harder, more watercolour-flat regions. */
  hardness: TslNode;
  /** Sector weight falloff exponent. */
  sharpness: TslNode;
}

/** Sobel structure tensor of `src`; rgb of the result holds (E, F, G) = (gx·gx, gx·gy, gy·gy). */
export const structureTensor = (src: TslNode) =>
  Fn(() => {
    const px = vec2(1).div(vec2(src.size(int(0))));
    const s = (dx: number, dy: number) => src.sample(screenUV.add(px.mul(vec2(dx, dy)))).rgb;
    const gx = s(1, -1)
      .add(s(1, 0).mul(2))
      .add(s(1, 1))
      .sub(s(-1, -1))
      .sub(s(-1, 0).mul(2))
      .sub(s(-1, 1))
      .mul(0.25);
    const gy = s(-1, 1)
      .add(s(0, 1).mul(2))
      .add(s(1, 1))
      .sub(s(-1, -1))
      .sub(s(0, -1).mul(2))
      .sub(s(1, -1))
      .mul(0.25);
    return vec4(dot(gx, gx), dot(gx, gy), dot(gy, gy), 1);
  })();

/**
 * Anisotropic Kuwahara filter. `src` = LDR colour texture node, `tensor` = smoothed structureTensor.
 * Strokes follow the local edge tangent: the sampling ellipse is stretched along it.
 */
export const anisotropicKuwahara = (src: TslNode, tensor: TslNode, u: KuwaharaUniforms) =>
  Fn(() => {
    const px = vec2(1).div(vec2(src.size(int(0))));
    const g = tensor.sample(screenUV).rgb;
    const [E, F, G] = [g.x, g.y, g.z];
    const root = sqrt(G.sub(E).mul(G.sub(E)).add(F.mul(F).mul(4)));
    const l1 = E.add(G).add(root).mul(0.5);
    const l2 = E.add(G).sub(root).mul(0.5);
    // Eigenvector of the smaller eigenvalue = direction of least change = edge tangent.
    const dir = vec2(l1.sub(E), F.negate());
    const len = dir.length();
    const t = len.greaterThan(1e-5).select(dir.div(len), vec2(0, 1));
    const sum = l1.add(l2);
    const A = sum.greaterThan(1e-6).select(l1.sub(l2).div(sum), float(0));
    const a = u.radius.mul(clamp(u.anisotropy.add(A).div(u.anisotropy), 0.1, 2)).toVar();
    const b = u.radius.mul(clamp(u.anisotropy.div(u.anisotropy.add(A)), 0.1, 2)).toVar();
    const cs = t.x;
    const sn = t.y;
    const maxX = int(sqrt(a.mul(a).mul(cs).mul(cs).add(b.mul(b).mul(sn).mul(sn)))).toVar();
    const maxY = int(sqrt(a.mul(a).mul(sn).mul(sn).add(b.mul(b).mul(cs).mul(cs)))).toVar();

    const m = Array.from({ length: SECTORS }, () => vec4(0).toVar());
    const s2 = Array.from({ length: SECTORS }, () => vec3(0).toVar());
    const sq = (z: TslNode) => max(z, 0).mul(max(z, 0));

    Loop(
      { start: maxY.negate(), end: maxY, type: 'int', condition: '<=' },
      { start: maxX.negate(), end: maxX, type: 'int', condition: '<=' },
      // Multi-param Loop names its variables i (outer, y) and j (inner, x).
      ({ i: iy, j: ix }: { i: TslNode; j: TslNode }) => {
        const x = float(ix);
        const y = float(iy);
        // Offset in the ellipse frame, scaled so the ellipse edge sits at |v| = 0.5.
        const v = vec2(
          cs.mul(x).add(sn.mul(y)).div(a.mul(2)),
          cs.mul(y).sub(sn.mul(x)).div(b.mul(2)),
        ).toVar();
        const d2 = dot(v, v);
        If(d2.lessThanEqual(0.25), () => {
          const c = src.sample(screenUV.add(px.mul(vec2(x, y)))).rgb;
          const w: TslNode[] = [];
          // Four polynomial sector windows per ring; second ring is rotated 45°.
          const ring = (p: TslNode, off: number) => {
            const xx = float(0.33).sub(p.x.mul(p.x).mul(0.84));
            const yy = float(0.33).sub(p.y.mul(p.y).mul(0.84));
            w[off] = sq(p.y.add(xx)).toVar();
            w[off + 2] = sq(p.x.negate().add(yy)).toVar();
            w[off + 4] = sq(p.y.negate().add(xx)).toVar();
            w[off + 6] = sq(p.x.add(yy)).toVar();
          };
          ring(v, 0);
          ring(vec2(v.x.sub(v.y), v.x.add(v.y)).mul(Math.SQRT1_2), 1);
          const g0 = exp(d2.mul(-3.125)).div(
            max(
              w.reduce((p, q) => p.add(q)),
              1e-6,
            ),
          );
          for (let k = 0; k < SECTORS; k++) {
            const wk = w[k].mul(g0);
            m[k].addAssign(vec4(c.mul(wk), wk));
            s2[k].addAssign(c.mul(c).mul(wk));
          }
        });
      },
    );

    const out = vec4(0).toVar();
    for (let k = 0; k < SECTORS; k++) {
      const wsum = max(m[k].w, 1e-5);
      const mean = m[k].rgb.div(wsum);
      const v = abs(s2[k].div(wsum).sub(mean.mul(mean)));
      const sigma2 = v.x.add(v.y).add(v.z);
      const wk = float(1).div(pow(u.hardness.mul(1000).mul(sigma2), u.sharpness.mul(0.5)).add(1));
      out.addAssign(vec4(mean.mul(wk), wk));
    }
    // 1e-30: sector weights can reach ~1e-29 on hard edges at high sharpness.
    return vec4(out.rgb.div(max(out.w, 1e-30)), 1);
  })();

/** Static paper weave + fine tooth in [-1, 1]. `p` = pixel coordinate. */
export const canvasGrain = Fn(([p]: [TslNode]) => {
  // Hoskins hash12: stable at large pixel coordinates (sin-hash is not).
  const p3 = fract(vec3(p.x, p.y, p.x).mul(0.1031)).toVar();
  p3.addAssign(dot(p3, p3.yzx.add(33.33)));
  const tooth = fract(p3.x.add(p3.y).mul(p3.z));
  const weave = sin(p.x.mul(1.3)).mul(sin(p.y.mul(1.3)));
  return tooth.sub(0.5).add(weave.mul(0.5));
});
