// src/rendering/sky/aurora/auroraWgsl.ts — Nimitz Auroras (Shadertoy XtGGRt) via wgslFn
import { wgsl, wgslFn } from 'three/tsl';

/** Helper library included by the entry fn (not parsed as the TSL signature). */
const auroraHelpers = wgsl(`
fn mm2(angle: f32) -> mat2x2f {
  let c = cos(angle);
  let s = sin(angle);
  return mat2x2f(vec2f(c, s), vec2f(-s, c));
}

fn tri(x: f32) -> f32 {
  return clamp(abs(fract(x) - 0.5), 0.01, 0.49);
}

fn tri2(p: vec2f) -> vec2f {
  return vec2f(tri(p.x) + tri(p.y), tri(p.y + tri(p.x)));
}

fn triNoise2d(pIn: vec2f, spd: f32, t: f32) -> f32 {
  var p = pIn;
  var z = 1.8;
  var z2 = 2.5;
  var rz = 0.0;
  p = mm2(p.x * 0.06) * p;
  var bp = p;
  for (var i = 0; i < 5; i = i + 1) {
    var dg = tri2(bp * 1.85) * 0.75;
    dg = mm2(t * spd) * dg;
    p = p - dg / z2;
    bp = bp * 1.3;
    z2 = z2 * 0.45;
    z = z * 0.42;
    p = p * (1.21 + (rz - 1.0) * 0.02);
    rz = rz + tri(p.x + tri(p.y)) * z;
    let m2 = mat2x2f(vec2f(0.95534, 0.29552), vec2f(-0.29552, 0.95534));
    p = -(m2 * p);
  }
  return clamp(1.0 / pow(rz * 29.0, 1.3), 0.0, 0.55);
}

fn hash21(n: vec2f) -> f32 {
  return fract(sin(dot(n, vec2f(12.9898, 4.1414))) * 43758.5453);
}

fn aurora(ro: vec3f, rd: vec3f, t: f32, starRes: f32) -> vec4f {
  var col = vec4f(0.0);
  var avgCol = vec4f(0.0);
  for (var i = 0; i < 24; i = i + 1) {
    let fi = f32(i);
    let ptOff = 0.006 * hash21(vec2f(starRes, starRes * 0.37)) * smoothstep(0.0, 15.0, fi);
    var pt = ((0.8 + pow(fi, 1.4) * 0.002) - ro.y) / (rd.y * 2.0 + 0.4);
    pt = pt - ptOff;
    let bpos = ro + pt * rd;
    let p = bpos.zx;
    let rzt = triNoise2d(p, 0.06, t);
    var col2 = vec4f(0.0, 0.0, 0.0, rzt);
    col2 = vec4f((sin(1.0 - vec3f(2.15, -0.5, 1.2) + fi * 0.043) * 0.5 + 0.5) * rzt, rzt);
    avgCol = mix(avgCol, col2, 0.5);
    col = col + avgCol * exp2(-fi * 0.065 - 2.5) * smoothstep(0.0, 5.0, fi);
  }
  col = col * clamp(rd.y * 15.0 + 0.4, 0.0, 1.0);
  return col * 1.8;
}

fn hash33(pIn: vec3f) -> vec3f {
  var p = fract(pIn * vec3f(443.8975, 397.2973, 491.1871));
  p = p + dot(p.zxy, p.yxz + 19.27);
  return fract(vec3f(p.x * p.y, p.z * p.x, p.y * p.z));
}

fn stars(pIn: vec3f, starRes: f32) -> vec3f {
  var p = pIn;
  var c = vec3f(0.0);
  let res = starRes;
  for (var i = 0; i < 4; i = i + 1) {
    let fi = f32(i);
    let q = fract(p * (0.15 * res)) - 0.5;
    let id = floor(p * (0.15 * res));
    let rn = hash33(id).xy;
    var c2 = 1.0 - smoothstep(0.0, 0.6, length(q));
    c2 = c2 * step(rn.x, 0.0005 + fi * fi * 0.001);
    c = c + c2 * (mix(vec3f(1.0, 0.49, 0.1), vec3f(0.75, 0.9, 1.0), rn.y) * 0.1 + 0.9);
    p = p * 1.3;
  }
  return c * c * 0.8;
}

fn bg(rd: vec3f) -> vec3f {
  var sd = dot(normalize(vec3f(-0.5, -0.6, 0.9)), rd) * 0.5 + 0.5;
  sd = pow(sd, 5.0);
  let col = mix(vec3f(0.05, 0.1, 0.2), vec3f(0.1, 0.05, 0.2), sd);
  return col * 0.63;
}
`);

/**
 * Procedural night sky entry. Helpers live in auroraHelpers include so Three
 * parses this signature (not mm2(a)) as the TSL Fn inputs.
 */
export const auroraSkyWgsl = wgslFn(
  `
fn auroraSky(rd: vec3f, t: f32, intensity: f32, auroraStrength: f32, starStrength: f32, starRes: f32) -> vec4f {
  let dir = normalize(rd);
  let ro = vec3f(0.0, 0.0, -6.7);
  let fade = smoothstep(0.0, 0.01, abs(dir.y)) * 0.1 + 0.9;

  var col = bg(dir) * fade;

  if (dir.y > 0.0) {
    let aurRaw = aurora(ro, dir, t, starRes);
    let aur = smoothstep(vec4f(0.0), vec4f(1.5), aurRaw) * fade;
    let aurRgb = aur.rgb * auroraStrength;
    let aurA = clamp(aur.a * auroraStrength, 0.0, 1.0);
    col = col + stars(dir, starRes) * starStrength;
    col = col * (1.0 - aurA) + aurRgb;
  } else {
    col = bg(dir) * fade * 0.6;
  }

  col = col * intensity;
  return vec4f(col, 1.0);
}
`,
  [auroraHelpers],
);
