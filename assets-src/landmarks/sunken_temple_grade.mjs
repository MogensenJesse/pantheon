// assets-src/landmarks/sunken_temple_grade.mjs — the pack's folded stone maps repainted toward the game's stone look
//
// The pack's stone is neutral grey with photographic speckle; the game's stone (village kit strip, the old temple's painted
// stone, the stone pack) is flatter and painted: soft facets that run warm or cool, a slow colour drift, muted olive moss. This
// reads stone1.png / stone2.png (made by sunken_temple_textures.mjs, kept as they are: the shipped model still uses them) and
// writes hall_stone1.png / hall_stone2.png beside them:
//   1. the fine speckle is halved (DETAIL), the soft shading (the baked AO) stays;
//   2. soft facets: a jittered grid of cells (CELL px), each with its own value, warm/cool and pink/green shift and a slight ramp
//      across it, like brush patches; a second, larger layer (DRIFT px) moves the colour slowly;
//   3. split toning: highlights a little warm, shadows a little cool;
//   4. the pack's bright green specks become the game's muted olive moss.
// It also paints hall_ivy.png, the one small texture of the ivy the build script grows (stem and leaf share it).
//   node assets-src/landmarks/sunken_temple_grade.mjs [tex dir]       (dir defaults to sunken_temple_tex next to this file)
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const here = dirname(fileURLToPath(import.meta.url));
const dir = resolve(process.argv[2] ?? join(here, 'sunken_temple_tex'));

const P = {
  DETAIL: 0.5, // share of the fine speckle kept
  CELL: 56, // facet size, px of the 2048 atlas (a 2.5 m wall panel is about 240 px wide)
  DRIFT: 220, // size of the slow colour layer
  FACET_VALUE: 0.04, // per-facet brightness, standard deviation
  FACET_WARM: 0.012, // per-facet red/blue tilt
  FACET_PINK: 0.006, // per-facet red/green tilt
  RAMP: 0.025, // brightness ramp across a facet
  DRIFT_VALUE: 0.035,
  DRIFT_WARM: 0.014,
  GAIN: 1.04,
  WARM_HI: [1.04, 1.0, 0.95], // multiplier at full highlight
  COOL_LO: [0.95, 0.99, 1.06], // multiplier in the deepest shade
  MOSS: [80, 93, 60], // the muted olive at the mean stone brightness
  MOSS_COVER: 0.85,
};

const hash = (x, y, s) => {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 2246822519)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
const gauss = (x, y, s) => {
  const u = hash(x, y, s * 2 + 1) || 1e-9;
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * hash(x, y, s * 2 + 2));
};

/** Per pixel: the cell of a jittered grid it falls in (nearest of the 3 x 3 neighbours' points) -> [cx, cy] */
function cellOf(x, y, size, seed) {
  const gx = Math.floor(x / size);
  const gy = Math.floor(y / size);
  let best = 1e30;
  let bx = 0;
  let by = 0;
  for (let j = -1; j <= 1; j++) {
    for (let i = -1; i <= 1; i++) {
      const cx = gx + i;
      const cy = gy + j;
      const px = (cx + 0.15 + 0.7 * hash(cx, cy, seed)) * size;
      const py = (cy + 0.15 + 0.7 * hash(cx, cy, seed + 7)) * size;
      const d = (px - x) ** 2 + (py - y) ** 2;
      if (d < best) {
        best = d;
        bx = cx;
        by = cy;
      }
    }
  }
  return [bx, by, Math.sqrt(best)];
}

async function grade(name, seed) {
  const src = join(dir, `${name}.png`);
  const { data: base, info } = await sharp(src).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const smooth = await sharp(src).removeAlpha().blur(1.4).raw().toBuffer();
  const { width: w, height: h } = info;
  const out = Buffer.alloc(base.length);
  // the facet field, rendered at full size then softened so the cell borders are painted, not cut
  const field = new Float32Array(w * h * 3); // value, warm, pink
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [cx, cy, d] = cellOf(x, y, P.CELL, seed);
      const [dx, dy] = cellOf(x, y, P.DRIFT, seed + 31);
      const ang = hash(cx, cy, seed + 3) * 2 * Math.PI;
      const ramp = ((x - (cx + 0.5) * P.CELL) * Math.cos(ang) + (y - (cy + 0.5) * P.CELL) * Math.sin(ang)) / P.CELL;
      const o = (y * w + x) * 3;
      field[o] = gauss(cx, cy, seed) * P.FACET_VALUE + ramp * P.RAMP + gauss(dx, dy, seed + 5) * P.DRIFT_VALUE;
      field[o + 1] = gauss(cx, cy, seed + 11) * P.FACET_WARM + gauss(dx, dy, seed + 13) * P.DRIFT_WARM;
      field[o + 2] = gauss(cx, cy, seed + 17) * P.FACET_PINK;
      void d;
    }
  }
  const soft = await sharp(Buffer.from(new Uint8Array(field.length).map((_, i) => Math.max(0, Math.min(255, Math.round(128 + field[i] * 600))))), {
    raw: { width: w, height: h, channels: 3 },
  })
    .blur(3.5)
    .raw()
    .toBuffer();
  for (let p = 0; p < w * h; p++) {
    const o = p * 3;
    const rgb = [0, 1, 2].map((c) => smooth[o + c] + (base[o + c] - smooth[o + c]) * P.DETAIL);
    const lum = (rgb[0] * 0.299 + rgb[1] * 0.587 + rgb[2] * 0.114) / 255;
    const value = (soft[o] - 128) / 600;
    const warm = (soft[o + 1] - 128) / 600;
    const pink = (soft[o + 2] - 128) / 600;
    // split toning: t = 0 in the shade, 1 in the light
    const t = Math.max(0, Math.min(1, (lum - 0.25) / 0.45));
    const mul = [
      (1 + value + warm + pink) * (P.COOL_LO[0] + (P.WARM_HI[0] - P.COOL_LO[0]) * t),
      (1 + value - pink) * (P.COOL_LO[1] + (P.WARM_HI[1] - P.COOL_LO[1]) * t),
      (1 + value - warm) * (P.COOL_LO[2] + (P.WARM_HI[2] - P.COOL_LO[2]) * t),
    ];
    let col = rgb.map((v, c) => v * mul[c] * P.GAIN);
    // the pack's green specks -> muted olive moss at the local brightness
    const green = rgb[1] - Math.max(rgb[0], rgb[2]);
    if (green > 5) {
      const m = Math.min(1, (green - 5) / 28) * P.MOSS_COVER;
      const k = lum / 0.5;
      col = col.map((v, c) => v * (1 - m) + P.MOSS[c] * Math.min(1.4, Math.max(0.5, k)) * m);
    }
    for (let c = 0; c < 3; c++) out[o + c] = Math.max(0, Math.min(255, Math.round(col[c])));
  }
  await sharp(out, { raw: { width: w, height: h, channels: 3 } }).png().toFile(join(dir, `hall_${name}.png`));
}

/** hall_ivy.png, 256 x 256: the stem colour on the left 40 %, the leaf (u = 0.45 + 0.5 x along it, v = 0.5 + 0.55 y across it, the
 *  outline of the build script's ivy leaf) on the right: darker at the stalk, lighter and a little warm at the tip, a pale midrib,
 *  muted olive like the old temple's moss. Two painted patches of value so a mass of leaves does not read as one flat green. */
async function ivy() {
  const n = 256;
  const out = Buffer.alloc(n * n * 3);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const u = (i + 0.5) / n;
      const v = (j + 0.5) / n;
      const o = (j * n + i) * 3;
      const patch = 1 + 0.07 * (hash(Math.floor(i / 18), Math.floor(j / 18), 9) - 0.5) * 2;
      let col;
      if (u < 0.4) col = [74, 62, 42].map((c) => c * patch); // stem: dry olive-brown
      else {
        const x = (u - 0.45) / 0.5;
        const y = (v - 0.5) / 0.55;
        const t = Math.max(0, Math.min(1, x));
        const vein = Math.max(0, 1 - Math.abs(y) / 0.07) * 0.22 + Math.max(0, 1 - Math.abs(Math.abs(y) - 0.45 * t) / 0.04) * 0.08;
        col = [0, 1, 2].map((c) => ([66, 86, 46][c] + ([104, 124, 62][c] - [66, 86, 46][c]) * t) * patch * (1 + vein));
      }
      for (let c = 0; c < 3; c++) out[o + c] = Math.max(0, Math.min(255, Math.round(col[c])));
    }
  }
  await sharp(out, { raw: { width: n, height: n, channels: 3 } }).png().toFile(join(dir, 'hall_ivy.png'));
}

await grade('stone1', 1);
await grade('stone2', 2);
await ivy();
console.log(`wrote hall_stone1.png, hall_stone2.png and hall_ivy.png to ${dir}`);
