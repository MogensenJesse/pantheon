// scripts/checks/run.mjs — runs the headless check scripts, several at a time
//
//   node scripts/checks/run.mjs                   every fast check, in parallel
//   node scripts/checks/run.mjs --slow            the slow ones too (village smoke, village save round trips)
//   node scripts/checks/run.mjs village-hunger    named checks only (also the slow and on-demand ones), output as it comes
//
// `npm run check:<name>` runs one; `check:fast` and `check:all` add the type-check and the lint around it.
// Each check is a node script that exits non-zero when something failed (see lib/check.ts).
import { spawn } from 'node:child_process';
import { availableParallelism } from 'node:os';
import { fileURLToPath } from 'node:url';

const dir = fileURLToPath(new URL('.', import.meta.url));

/**
 * `name` is the npm suffix (`check:<name>`), `file` is relative to this folder. `slow` checks run with
 * `--slow`; `manual` ones only by name (the golden hashes move on any sim, map or art change: run them
 * when refactoring the sim, `-- --update` after a deliberate change).
 */
const CHECKS = [
  { name: 'village-smoke', file: 'village/sim-smoke.ts', slow: true },
  { name: 'save-village', file: 'save/village-save-check.ts', slow: true },
  { name: 'village-hunger', file: 'village/hunger-check.ts' },
  { name: 'village-hamlet', file: 'village/hamlet-check.ts' },
  { name: 'village-economy', file: 'village/economy-check.ts' },
  { name: 'village-upgrades', file: 'village/upgrades-check.ts' },
  { name: 'village-levels', file: 'village/levels-check.ts' },
  { name: 'village-plots', file: 'village/plots-check.ts' },
  { name: 'village-prayers', file: 'village/prayers-check.ts' },
  { name: 'village-hearten', file: 'village/hearten-check.ts' },
  { name: 'village-outposts', file: 'village/outposts-check.ts' },
  { name: 'village-golden', file: 'village/golden-check.ts', manual: true },
  { name: 'village-forest', file: 'village/forest-check.ts' },
  { name: 'village-routine', file: 'village/routine-check.ts' },
  { name: 'village-route', file: 'village/coarse-route-check.ts' },
  { name: 'village-remote', file: 'village/remote-site-check.ts' },
  { name: 'village-kit', file: 'village/village-kit-check.ts' },
  { name: 'weather', file: 'weather/weather-check.ts' },
  { name: 'wind', file: 'life/wind-check.ts' },
  { name: 'drift', file: 'life/drift-check.ts' },
  { name: 'animal', file: 'life/animal-check.ts' },
  { name: 'life', file: 'life/life-check.ts' },
  { name: 'powers', file: 'abilities/powers-check.ts' },
  { name: 'powers-builder', file: 'abilities/builder-powers-check.ts' },
  { name: 'abilities', file: 'abilities/abilities-check.ts' },
  { name: 'energy', file: 'energy/energy-check.ts' },
  { name: 'quests', file: 'quests/quests-check.ts' },
  { name: 'quest-content', file: 'quests/quest-content-check.ts' },
  { name: 'finale', file: 'finale/timeline-check.ts' },
  { name: 'cinematic', file: 'finale/cinematic-check.ts' },
  { name: 'skills', file: 'skills/skills-check.ts' },
  { name: 'overview', file: 'overview/overview-check.ts' },
  { name: 'landmarks', file: 'landmarks/landmarks-check.ts' },
  { name: 'restoration', file: 'landmarks/restoration-check.ts' },
  { name: 'map-entities', file: 'map/map-entities-check.ts' },
  { name: 'prop-sway', file: 'map/prop-sway-check.ts' },
  { name: 'save', file: 'save/save-check.ts' },
  { name: 'ui', file: 'ui/kit-check.ts' },
];

const args = process.argv.slice(2);
const withSlow = args.includes('--slow');
const names = args.filter((a) => !a.startsWith('--'));
// Flags other than --slow go to a single named check (`check:village-golden -- --update`).
const passThrough =
  names.length === 1 ? args.filter((a) => a.startsWith('--') && a !== '--slow') : [];
for (const n of names) {
  if (!CHECKS.some((c) => c.name === n)) {
    console.error(`unknown check "${n}"; known: ${CHECKS.map((c) => c.name).join(', ')}`);
    process.exit(2);
  }
}
const selected = names.length
  ? CHECKS.filter((c) => names.includes(c.name))
  : CHECKS.filter((c) => !c.manual && (withSlow || !c.slow));
const streaming = names.length === 1;

function run(check) {
  return new Promise((resolve) => {
    const t0 = performance.now();
    const child = spawn(
      process.execPath,
      ['--experimental-strip-types', '--no-warnings', `${dir}${check.file}`, ...passThrough],
      { stdio: streaming ? 'inherit' : ['ignore', 'pipe', 'pipe'] },
    );
    let out = '';
    child.stdout?.on('data', (d) => {
      out += d;
    });
    child.stderr?.on('data', (d) => {
      out += d;
    });
    child.on('close', (code) => {
      const seconds = (performance.now() - t0) / 1000;
      resolve({ check, code: code ?? 1, out, seconds });
    });
  });
}

const results = [];
const queue = [...selected];
const lanes = streaming ? 1 : Math.max(1, Math.min(4, availableParallelism()));
await Promise.all(
  Array.from({ length: lanes }, async () => {
    for (let next = queue.shift(); next; next = queue.shift()) {
      const r = await run(next);
      results.push(r);
      if (!streaming) {
        console.log(
          `\n=== ${r.check.name} (${r.seconds.toFixed(1)} s) ${r.code === 0 ? 'ok' : 'FAILED'}`,
        );
        if (r.code !== 0) console.log(r.out);
      }
    }
  }),
);

const failed = results.filter((r) => r.code !== 0);
console.log(
  `\n${results.length - failed.length}/${results.length} checks passed` +
    (failed.length ? `; failed: ${failed.map((r) => r.check.name).join(', ')}` : ''),
);
process.exitCode = failed.length ? 1 : 0;
