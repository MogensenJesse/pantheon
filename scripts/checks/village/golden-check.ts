// scripts/checks/village/golden-check.ts — the village sim's whole saved state after a few short runs, as hashes
//
// A refactor that must not change behaviour leaves every hash as it is. When a change *should* move them
// (a rule, a number), look at why, then write the new ones with `--update`.
//
//   node --experimental-strip-types scripts/checks/village/golden-check.ts [--update]
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { check, finish } from '../lib/check.ts';
import {
  convertVillage,
  dayPhaseAt,
  loadMap,
  makeSim,
  savedHash,
  simulate,
  stepSim,
  withNoFood,
} from '../lib/villageHeadless.ts';

const FILE = new URL('./golden.json', import.meta.url);
const update = process.argv.includes('--update');
const golden: Record<string, string> = update ? {} : JSON.parse(readFileSync(FILE, 'utf8'));

const island = loadMap('island-mountain');
const dala = loadMap('dala', { x: 300, z: -60, rotY: 0 });

/** Each scenario returns the sim it ended with. */
const SCENARIOS: Record<string, () => ReturnType<typeof makeSim>> = {
  'sandbox village grows (fed, 1 h)': () => {
    const sim = makeSim(island);
    simulate(sim, { hours: 1, phase: dayPhaseAt, vigil: false, presence: true, fed: true });
    return sim;
  },
  'vigil village grows (fed, 0.5 h)': () => {
    const sim = makeSim(island);
    simulate(sim, { hours: 0.5, phase: () => 0.02, vigil: true, presence: false, fed: true });
    return sim;
  },
  'converted hamlet lives a day (2 h)': () => {
    const sim = convertVillage(makeSim(island, { mode: 'hamlet' }));
    stepSim(sim, { seconds: 2 * 3600 });
    return sim;
  },
  'famine kills and buries (1.6 h, no food made)': () => {
    let end: ReturnType<typeof makeSim> | undefined;
    withNoFood(() => {
      const sim = convertVillage(makeSim(island, { mode: 'hamlet' }));
      sim.economy.drainFood();
      stepSim(sim, { seconds: 1.6 * 3600 });
      assert.ok(sim.stats().graves > 0, 'the scenario still buries people');
      end = sim;
    });
    return end!;
  },
  'forest is felled and regrows (dala, 0.5 h)': () => {
    const sim = makeSim(dala);
    sim.fellNear(450, -60, 6, []);
    simulate(sim, { hours: 0.5, phase: dayPhaseAt, vigil: false, presence: true, fed: true });
    return sim;
  },
  'rain sends people in and waters the fields (hamlet, 0.8 h)': () => {
    const sim = convertVillage(makeSim(island, { mode: 'hamlet' }));
    const rain = (t: number) => (t > 600 && t < 1500 ? 0.6 : 0);
    stepSim(sim, { seconds: 0.8 * 3600, rain, phase: () => 0.4 });
    return sim;
  },
};

for (const [name, make] of Object.entries(SCENARIOS)) {
  await check(name, () => {
    const hash = savedHash(make());
    if (update) {
      golden[name] = hash;
      return;
    }
    assert.equal(
      hash,
      golden[name],
      'the saved state is not what it was (see the header of this file)',
    );
  });
}

if (update) {
  writeFileSync(FILE, `${JSON.stringify(golden, null, 2)}\n`);
  console.log(`wrote ${Object.keys(golden).length} hashes to scripts/checks/village/golden.json`);
}
finish('all golden state checks passed');
