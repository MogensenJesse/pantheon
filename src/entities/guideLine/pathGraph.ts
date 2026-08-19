// src/entities/guideLine/pathGraph.ts — Path-cell BFS + weighted land A* fallback

import { WORLD } from '../../config/world';
import { worldToGridFrac } from '../../map/authoring/gridDirtyRegion';
import type { MapGrids } from '../../map/MapGrids';
import { BiomeId } from '../../map/MapTypes';

const SQRT2 = Math.SQRT2;
const NEIGHBORS: readonly [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];

export interface GridCell {
  i: number;
  j: number;
}

export interface PathGraph {
  cellToWorld: (i: number, j: number) => { x: number; z: number };
  nearestPathCell: (x: number, z: number) => GridCell | null;
  rebuildFlow: (leaveI: number, leaveJ: number) => void;
  walkFlow: (fromI: number, fromJ: number) => GridCell[] | null;
  weightedAStar: (
    fromI: number,
    fromJ: number,
    toI: number,
    toJ: number,
    landCost: number,
  ) => GridCell[] | null;
}

function octile(di: number, dj: number): number {
  const dx = Math.abs(di);
  const dz = Math.abs(dj);
  return dx + dz + (SQRT2 - 2) * Math.min(dx, dz);
}

export function createPathGraph(grids: MapGrids, worldSize: number = WORLD.SIZE): PathGraph {
  const size = grids.size;
  const n = size * size;
  const pathMask = new Uint8Array(n);
  const pathCells: number[] = [];
  for (let idx = 0; idx < n; idx++) {
    if (grids.biome[idx] === BiomeId.Path) {
      pathMask[idx] = 1;
      pathCells.push(idx);
    }
  }

  const flowParent = new Int32Array(n);
  flowParent.fill(-1);
  let flowSource = -1;

  const astarGen = new Uint32Array(n);
  const astarG = new Float32Array(n);
  const astarParent = new Int32Array(n);
  let astarSearchId = 1;

  let heapIdx = new Int32Array(4096);
  let heapKey = new Float32Array(4096);
  let heapN = 0;

  const cellIndex = (i: number, j: number) => j * size + i;

  const inBounds = (i: number, j: number) => i >= 0 && j >= 0 && i < size && j < size;

  const isPath = (i: number, j: number) => inBounds(i, j) && pathMask[cellIndex(i, j)] === 1;

  const isLand = (i: number, j: number) =>
    inBounds(i, j) && grids.biome[cellIndex(i, j)] !== BiomeId.Water;

  const worldToCell = (x: number, z: number): GridCell => {
    const { u, v } = worldToGridFrac(x, z, worldSize, size);
    return { i: Math.round(u), j: Math.round(v) };
  };

  const cellToWorld = (i: number, j: number) => {
    const max = Math.max(1, size - 1);
    return {
      x: (i / max - 0.5) * worldSize,
      z: (j / max - 0.5) * worldSize,
    };
  };

  const nearestPathCell = (x: number, z: number): GridCell | null => {
    if (pathCells.length === 0) return null;
    const snap = worldToCell(x, z);
    if (isPath(snap.i, snap.j)) return snap;
    let bestIdx = pathCells[0]!;
    let bestD = Infinity;
    for (let p = 0; p < pathCells.length; p++) {
      const idx = pathCells[p]!;
      const i = idx % size;
      const j = (idx / size) | 0;
      const d = (i - snap.i) * (i - snap.i) + (j - snap.j) * (j - snap.j);
      if (d < bestD) {
        bestD = d;
        bestIdx = idx;
      }
    }
    return { i: bestIdx % size, j: (bestIdx / size) | 0 };
  };

  const heapGrow = () => {
    const nextIdx = new Int32Array(heapIdx.length * 2);
    const nextKey = new Float32Array(heapKey.length * 2);
    nextIdx.set(heapIdx);
    nextKey.set(heapKey);
    heapIdx = nextIdx;
    heapKey = nextKey;
  };

  const heapClear = () => {
    heapN = 0;
  };

  const heapPush = (idx: number, key: number) => {
    if (heapN >= heapIdx.length) heapGrow();
    let i = heapN++;
    heapIdx[i] = idx;
    heapKey[i] = key;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (heapKey[parent]! <= heapKey[i]!) break;
      const ti = heapIdx[i]!;
      const tk = heapKey[i]!;
      heapIdx[i] = heapIdx[parent]!;
      heapKey[i] = heapKey[parent]!;
      heapIdx[parent] = ti;
      heapKey[parent] = tk;
      i = parent;
    }
  };

  const heapPop = (): number | null => {
    if (heapN === 0) return null;
    const out = heapIdx[0]!;
    heapN -= 1;
    if (heapN === 0) return out;
    heapIdx[0] = heapIdx[heapN]!;
    heapKey[0] = heapKey[heapN]!;
    let i = 0;
    while (true) {
      const l = i * 2 + 1;
      const r = l + 1;
      let smallest = i;
      if (l < heapN && heapKey[l]! < heapKey[smallest]!) smallest = l;
      if (r < heapN && heapKey[r]! < heapKey[smallest]!) smallest = r;
      if (smallest === i) break;
      const ti = heapIdx[i]!;
      const tk = heapKey[i]!;
      heapIdx[i] = heapIdx[smallest]!;
      heapKey[i] = heapKey[smallest]!;
      heapIdx[smallest] = ti;
      heapKey[smallest] = tk;
      i = smallest;
    }
    return out;
  };

  const rebuildFlow = (leaveI: number, leaveJ: number) => {
    const source = cellIndex(leaveI, leaveJ);
    if (source === flowSource) return;
    flowSource = source;
    flowParent.fill(-1);
    if (!isPath(leaveI, leaveJ)) return;

    const queue = new Int32Array(pathCells.length + 8);
    let qh = 0;
    let qt = 0;
    queue[qt++] = source;
    flowParent[source] = source;
    while (qh < qt) {
      const cur = queue[qh++]!;
      const ci = cur % size;
      const cj = (cur / size) | 0;
      for (let n = 0; n < NEIGHBORS.length; n++) {
        const ni = ci + NEIGHBORS[n]![0];
        const nj = cj + NEIGHBORS[n]![1];
        if (!isPath(ni, nj)) continue;
        const nidx = cellIndex(ni, nj);
        if (flowParent[nidx] >= 0) continue;
        flowParent[nidx] = cur;
        queue[qt++] = nidx;
      }
    }
  };

  const walkFlow = (fromI: number, fromJ: number): GridCell[] | null => {
    if (flowSource < 0) return null;
    const from = cellIndex(fromI, fromJ);
    if (flowParent[from] < 0) return null;
    const cells: GridCell[] = [];
    let cur = from;
    const guard = pathCells.length + 4;
    for (let s = 0; s < guard; s++) {
      cells.push({ i: cur % size, j: (cur / size) | 0 });
      if (cur === flowSource) return cells;
      const next = flowParent[cur]!;
      if (next < 0) return null;
      cur = next;
    }
    return null;
  };

  const reconstruct = (to: number): GridCell[] => {
    const cells: GridCell[] = [];
    let cur = to;
    const guard = n + 2;
    for (let s = 0; s < guard; s++) {
      cells.push({ i: cur % size, j: (cur / size) | 0 });
      if (astarParent[cur] === cur) {
        cells.reverse();
        return cells;
      }
      cur = astarParent[cur]!;
      if (cur < 0) return [];
    }
    return [];
  };

  const weightedAStar = (
    fromI: number,
    fromJ: number,
    toI: number,
    toJ: number,
    landCost: number,
  ): GridCell[] | null => {
    if (!isLand(fromI, fromJ) || !isLand(toI, toJ)) return null;
    const start = cellIndex(fromI, fromJ);
    const goal = cellIndex(toI, toJ);
    if (start === goal) return [{ i: fromI, j: fromJ }];

    astarSearchId += 1;
    if (astarSearchId === 0xffffffff) {
      astarGen.fill(0);
      astarSearchId = 1;
    }

    heapClear();
    astarGen[start] = astarSearchId;
    astarG[start] = 0;
    astarParent[start] = start;
    heapPush(start, octile(toI - fromI, toJ - fromJ));

    const maxExpansions = Math.min(n, 120_000);
    let expanded = 0;
    while (expanded < maxExpansions) {
      const cur = heapPop();
      if (cur === null) break;
      if (astarGen[cur] !== astarSearchId) continue;
      if (cur === goal) return reconstruct(cur);
      expanded += 1;
      const ci = cur % size;
      const cj = (cur / size) | 0;
      const gCur = astarG[cur]!;
      for (let n = 0; n < NEIGHBORS.length; n++) {
        const di = NEIGHBORS[n]![0];
        const dj = NEIGHBORS[n]![1];
        const ni = ci + di;
        const nj = cj + dj;
        if (!isLand(ni, nj)) continue;
        const nidx = cellIndex(ni, nj);
        const stepMul = di !== 0 && dj !== 0 ? SQRT2 : 1;
        const terrainCost = pathMask[nidx] === 1 ? 1 : landCost;
        const ng = gCur + terrainCost * stepMul;
        if (astarGen[nidx] === astarSearchId && ng >= astarG[nidx]!) continue;
        astarGen[nidx] = astarSearchId;
        astarG[nidx] = ng;
        astarParent[nidx] = cur;
        heapPush(nidx, ng + octile(toI - ni, toJ - nj));
      }
    }
    return null;
  };

  return {
    cellToWorld,
    nearestPathCell,
    rebuildFlow,
    walkFlow,
    weightedAStar,
  };
}
