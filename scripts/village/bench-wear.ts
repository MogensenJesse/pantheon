// scripts/village/bench-wear.ts — how much of the wear grid the sim marks dirty, as the renderer sees it
// Run: node --experimental-strip-types scripts/village/bench-wear.ts [mapId] [hours]
// Every dirty cell means the terrain path/grass layers re-compose and upload that area, so a lower
// mean share means fewer CPU spikes in the game.
import { createVillageSim } from '../../src/world/village/sim/villageSim.ts';
import { DAY_S, loadMap, simulate } from '../lib/villageHeadless.ts';

const [mapId = 'island-mountain', hoursArg = '6'] = process.argv.slice(2);
const map = loadMap(mapId);
const sim = createVillageSim({ sampler: map.sampler, metaOf: map.metaOf, seed: map.seed });
const total = sim.wear.size * sim.wear.size;

let steps = 0;
let dirtySteps = 0;
let cells = 0;
let maxShare = 0;
let bigSteps = 0;
simulate(sim, {
  hours: Number(hoursArg),
  phase: (t) => (0.3 + t / DAY_S) % 1,
  vigil: false,
  presence: false,
  onStep: () => {
    steps++;
    const rect = sim.wear.takeDirty();
    if (!rect) return;
    dirtySteps++;
    const area = (rect.iMax - rect.iMin + 1) * (rect.jMax - rect.jMin + 1);
    cells += area;
    maxShare = Math.max(maxShare, area / total);
    if (area / total > 0.5) bigSteps++;
  },
});

const seconds = steps * 0.1;
console.log(
  `${mapId}: wear grid ${sim.wear.size}x${sim.wear.size} (${total} cells), ${hoursArg} h`,
);
console.log(`  steps with wear changes: ${dirtySteps}/${steps}`);
console.log(`  steps that dirty more than half the grid: ${bigSteps}`);
console.log(`  largest dirty share: ${(maxShare * 100).toFixed(0)}%`);
console.log(`  dirty cells per village second: ${(cells / seconds).toFixed(0)}`);
