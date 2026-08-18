// src/map/authoring/thermalErode.ts — thermal (talus) erosion on authored height grids (TerrainGenerator port)

/**
 * Thermal (talus) erosion on a dense height grid in world-meter units.
 * Cells overhanging a neighbour past the talus drop shed excess downhill.
 * Material is conserved via a delta buffer (order-independent).
 *
 * Port of TerrainGenerator.thermalErode.
 */
let talusDeltaScratch: Float32Array | null = null;

function talusDelta(length: number): Float32Array {
  if (!talusDeltaScratch || talusDeltaScratch.length < length) {
    talusDeltaScratch = new Float32Array(length);
  }
  return talusDeltaScratch;
}

export function thermalErodeHeightGrid(
  h: Float32Array,
  N: number,
  cellSize: number,
  talus: number,
  passes: number,
): void {
  if (passes <= 0 || N < 2) return;

  const drop = talus * cellSize;
  const carry = 0.5;
  const len = N * N;
  const delta = talusDelta(len);
  const ex = [0, 0, 0, 0];
  const off = [-1, 1, -N, N];

  for (let p = 0; p < passes; p++) {
    delta.fill(0);

    for (let z = 0; z < N; z++) {
      for (let x = 0; x < N; x++) {
        const i = z * N + x;
        const hi = h[i]!;

        ex[0] = x > 0 ? hi - h[i - 1]! - drop : 0;
        ex[1] = x < N - 1 ? hi - h[i + 1]! - drop : 0;
        ex[2] = z > 0 ? hi - h[i - N]! - drop : 0;
        ex[3] = z < N - 1 ? hi - h[i + N]! - drop : 0;

        let sum = 0;
        let peak = 0;

        for (let k = 0; k < 4; k++) {
          const d = ex[k]!;
          if (d <= 0) {
            ex[k] = 0;
            continue;
          }
          sum += d;
          if (d > peak) peak = d;
        }

        if (sum <= 0) continue;

        const move = carry * peak;
        delta[i]! -= move;

        for (let k = 0; k < 4; k++) {
          if (ex[k]! > 0) {
            delta[i + off[k]!]! += (move * ex[k]!) / sum;
          }
        }
      }
    }

    for (let k = 0; k < len; k++) {
      h[k]! += delta[k]!;
    }
  }
}
