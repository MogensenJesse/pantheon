// scripts/weather/cloud-spike.ts — M8 spike: how often does a village sit under a large cloud formation?
//
// Builds the map's real cumulus field (the deck in map.clouds), drifts it with the wind exactly as
// cloudWindInstances does, and samples the cloud footprints over a point (the village) for some game days:
// how much of the time it is under any cluster, under a cluster at least E metres across, and how long
// those stretches last. No visuals; the numbers decide how rain is derived from the clouds.
//
//   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/weather/cloud-spike.ts [mapId] [x,z] [days]
import { readFileSync } from 'node:fs';
import { applyMapCumulusDeck } from '../../src/map/mapCumulusDeck.ts';
import { readCloudSettings } from '../../src/rendering/clouds/cloudConfig.ts';
import { cloudWindDriftMeters } from '../../src/rendering/clouds/cloudWindInstances.ts';
import { buildCumulusDeckField } from '../../src/rendering/clouds/cumulusDeckField.ts';
import { loadMap } from '../lib/villageHeadless.ts';

const mapId = process.argv[2] ?? 'island-mountain';
const days = Number(process.argv[4] ?? 6);
const DAY_S = 1800;

const json = JSON.parse(readFileSync(`public/maps/${mapId}.json`, 'utf8'));
applyMapCumulusDeck(json.clouds);
const settings = readCloudSettings();
const field = buildCumulusDeckField(settings);
const at = process.argv[3]
  ? (process.argv[3].split(',').map(Number) as [number, number])
  : (() => {
      const seed = loadMap(mapId).seed;
      return [seed.x, seed.z] as [number, number];
    })();

const { spread, windSpeed, windDirectionDeg } = field.settings;
const rad = (windDirectionDeg * Math.PI) / 180;
const dirX = Math.sin(rad);
const dirZ = Math.cos(rad);
const wrap = (v: number) => {
  const half = spread * 0.5;
  let r = v;
  while (r > half) r -= spread;
  while (r < -half) r += spread;
  return r;
};

const clusters = field.clusters;
const widths = clusters.map((c) => 2 * Math.max(c.extentX, c.extentZ)).sort((a, b) => a - b);
const pct = (p: number) => widths[Math.min(widths.length - 1, Math.floor(p * widths.length))] ?? 0;
console.log(`map ${mapId}: village at (${at[0].toFixed(0)}, ${at[1].toFixed(0)})`);
console.log(
  `deck: spread ${spread} m, wind ${windSpeed} (${(windSpeed * 0.1).toFixed(1)} m/s toward ${windDirectionDeg} deg), ${clusters.length} clusters`,
);
console.log(
  `cluster width (m): median ${pct(0.5).toFixed(0)}, p90 ${pct(0.9).toFixed(0)}, p99 ${pct(0.99).toFixed(0)}, max ${pct(1).toFixed(0)}`,
);

const THRESHOLDS = [0, 60, 100, 150, 250, 400];
const total = Math.round(days * DAY_S);
const under = new Map<number, boolean[]>();
for (const e of THRESHOLDS) under.set(e, new Array<boolean>(total).fill(false));
for (let t = 0; t < total; t++) {
  const drift = cloudWindDriftMeters(t, windSpeed);
  for (const c of clusters) {
    const ax = wrap(c.centerX + dirX * drift);
    const az = wrap(c.centerZ + dirZ * drift);
    // wind-local offsets of the point from the cluster anchor, shortest way round the wrap
    const dx = wrap(at[0] - ax);
    const dz = wrap(at[1] - az);
    const along = dx * dirX + dz * dirZ;
    const across = -dx * dirZ + dz * dirX;
    if ((along / c.extentX) ** 2 + (across / c.extentZ) ** 2 > 1) continue;
    const width = 2 * Math.max(c.extentX, c.extentZ);
    for (const e of THRESHOLDS) if (width >= e) under.get(e)![t] = true;
  }
}

console.log(
  `\nover ${days} days (${total} s of wind clock), the village is under a cluster at least ... wide:`,
);
for (const e of THRESHOLDS) {
  const flags = under.get(e)!;
  let on = 0;
  const runs: number[] = [];
  let run = 0;
  for (let t = 0; t <= total; t++) {
    if (t < total && flags[t]) {
      on++;
      run++;
    } else if (run > 0) {
      runs.push(run);
      run = 0;
    }
  }
  const mean = runs.length ? runs.reduce((a, b) => a + b, 0) / runs.length : 0;
  const longest = runs.length ? Math.max(...runs) : 0;
  console.log(
    `  >= ${String(e).padStart(3)} m: ${((100 * on) / total).toFixed(1).padStart(5)}% of the time, ${String(runs.length).padStart(3)} stretches, mean ${mean.toFixed(0)} s, longest ${longest} s, ${(runs.length / days).toFixed(1)} per day`,
  );
}
