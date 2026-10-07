// scripts/village/bench-wear.ts — how much terrain the village's wear marks for re-composing, per second
// Run: node --experimental-strip-types scripts/village/bench-wear.ts [mapId] [hours]
// The terrain layers sweep their changes about once a second. "bounding box" is the old way (one
// rectangle around everything that changed); "tiles" is what the renderer composes now.
import { createVillageSim } from '../../src/world/village/sim/villageSim.ts';
import { DAY_S, loadMap, simulate } from '../lib/villageHeadless.ts';

const [mapId = 'island-mountain', hoursArg = '6'] = process.argv.slice(2);
const map = loadMap(mapId);
const sim = createVillageSim({ sampler: map.sampler, metaOf: map.metaOf, seed: map.seed });
const total = sim.wear.size * sim.wear.size;
const STEPS_PER_SECOND = 10;

let steps = 0;
let seconds = 0;
let tileCells = 0;
let boxCells = 0;
let worstTiles = 0;
let worstBox = 0;
const windowTiles = new Map<string, number>();
let box: { iMin: number; iMax: number; jMin: number; jMax: number } | null = null;

simulate(sim, {
  hours: Number(hoursArg),
  phase: (t) => (0.3 + t / DAY_S) % 1,
  vigil: false,
  presence: false,
  onStep: () => {
    steps++;
    for (const r of sim.wear.takeDirty()) {
      windowTiles.set(`${r.iMin},${r.jMin}`, (r.iMax - r.iMin + 1) * (r.jMax - r.jMin + 1));
      box = box
        ? {
            iMin: Math.min(box.iMin, r.iMin),
            iMax: Math.max(box.iMax, r.iMax),
            jMin: Math.min(box.jMin, r.jMin),
            jMax: Math.max(box.jMax, r.jMax),
          }
        : { ...r };
    }
    if (steps % STEPS_PER_SECOND !== 0) return;
    seconds++;
    let tiles = 0;
    for (const cells of windowTiles.values()) tiles += cells;
    const boxArea = box ? (box.iMax - box.iMin + 1) * (box.jMax - box.jMin + 1) : 0;
    tileCells += tiles;
    boxCells += boxArea;
    worstTiles = Math.max(worstTiles, tiles);
    worstBox = Math.max(worstBox, boxArea);
    windowTiles.clear();
    box = null;
  },
});

const pct = (cells: number) => `${((cells / total) * 100).toFixed(0)}%`;
console.log(
  `${mapId}: wear grid ${sim.wear.size}x${sim.wear.size} (${total} cells), ${hoursArg} h`,
);
console.log(
  `  per 1 s sweep, mean  bounding box ${pct(boxCells / seconds)}  tiles ${pct(tileCells / seconds)}`,
);
console.log(`  per 1 s sweep, worst bounding box ${pct(worstBox)}  tiles ${pct(worstTiles)}`);
