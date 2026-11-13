#!/usr/bin/env node
// Per-channel albedo multipliers to turn a measured render colour into a target colour, through the Khronos PBR Neutral tone map.
// node crank_fit.mjs <current hex> <target hex> [<current hex> <target hex> ...]  -> multiplier per R,G,B (linear, pre-tonemap)
const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
function inverse(c) { // tone-mapped linear -> pre-tonemap linear (dark colours, peak < 0.76 only)
  const o = Math.min(...c);
  const x = o < 0.04 ? Math.sqrt(o / 6.25) : o + 0.04;
  const off = x < 0.08 ? x - 6.25 * x * x : 0.04;
  return c.map((v) => v + off);
}
const a = process.argv.slice(2);
for (let i = 0; i < a.length; i += 2) {
  const cur = inverse(hex(a[i]).map(lin)), tar = inverse(hex(a[i + 1]).map(lin));
  const m = tar.map((v, k) => v / cur[k]);
  console.log(a[i], '->', a[i + 1], 'pre cur', cur.map((v) => v.toFixed(4)).join(','), 'tar', tar.map((v) => v.toFixed(4)).join(','), 'mult', m.map((v) => v.toFixed(3)).join(','), 'norm', m.map((v) => (v / Math.max(...m)).toFixed(3)).join(','), 'max', Math.max(...m).toFixed(3));
}
