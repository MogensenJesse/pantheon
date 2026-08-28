// src/optimizer/pipeline/gutterInfill.ts — island dilation + optional miss fill
export function dilateAndInfill(
  maps: { color: Uint8Array; normal: Uint8Array; orm: Uint8Array; coverage: Uint8Array },
  width: number,
  height: number,
  gutterPx: number,
  alphaHoles: boolean,
): void {
  const covered = maps.coverage;
  const dilateOnce = (src: Uint8Array, dst: Uint8Array) => {
    dst.set(src);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = y * width + x;
        if (src[i]) continue;
        let found = 0xff;
        for (let oy = -1; oy <= 1 && found === 0xff; oy++) {
          const ny = y + oy;
          if (ny < 0 || ny >= height) continue;
          for (let ox = -1; ox <= 1; ox++) {
            const nx = x + ox;
            if (nx < 0 || nx >= width) continue;
            const ni = ny * width + nx;
            if (src[ni]) {
              found = ni;
              break;
            }
          }
        }
        if (found === 0xff) continue;
        dst[i] = 1;
        copyTexel(maps.color, i, found);
        copyTexel(maps.normal, i, found);
        copyTexel(maps.orm, i, found);
      }
    }
    src.set(dst);
  };

  const scratch = new Uint8Array(covered.length);
  for (let g = 0; g < gutterPx; g++) dilateOnce(covered, scratch);

  if (alphaHoles) return;

  // Keep growing until islands fill (bounded). Misses outside any island stay empty.
  for (let g = 0; g < 32; g++) {
    let added = 0;
    scratch.set(covered);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = y * width + x;
        if (covered[i]) continue;
        let found = 0xff;
        for (let oy = -1; oy <= 1 && found === 0xff; oy++) {
          const ny = y + oy;
          if (ny < 0 || ny >= height) continue;
          for (let ox = -1; ox <= 1; ox++) {
            const nx = x + ox;
            if (nx < 0 || nx >= width) continue;
            const ni = ny * width + nx;
            if (covered[ni]) {
              found = ni;
              break;
            }
          }
        }
        if (found === 0xff) continue;
        scratch[i] = 1;
        copyTexel(maps.color, i, found);
        copyTexel(maps.normal, i, found);
        copyTexel(maps.orm, i, found);
        added += 1;
      }
    }
    covered.set(scratch);
    if (added === 0) break;
  }
}

function copyTexel(buf: Uint8Array, dst: number, src: number): void {
  const di = dst * 4;
  const si = src * 4;
  buf[di] = buf[si];
  buf[di + 1] = buf[si + 1];
  buf[di + 2] = buf[si + 2];
  buf[di + 3] = buf[si + 3];
}
