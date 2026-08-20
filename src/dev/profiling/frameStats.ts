// src/dev/profiling/frameStats.ts — rolling FPS / percentile / hitch counters
const SAMPLE_CAP = 180;
const HITCH_MS = 1000 / 45;
const HITCH_WINDOW_MS = 5000;

const frameMs: number[] = [];
const hitchTimes: number[] = [];
let lastFrameNow = 0;

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx]!;
}

/** Record one displayed frame. */
export function pushFrameSample(now = performance.now()): number {
  const dt = lastFrameNow > 0 ? now - lastFrameNow : 0;
  lastFrameNow = now;
  if (dt <= 0 || dt > 250) return dt;
  frameMs.push(dt);
  if (frameMs.length > SAMPLE_CAP) frameMs.shift();
  if (dt >= HITCH_MS) hitchTimes.push(now);
  const cutoff = now - HITCH_WINDOW_MS;
  while (hitchTimes.length > 0 && hitchTimes[0]! < cutoff) hitchTimes.shift();
  return dt;
}

export function getFrameStats(): {
  fps: number;
  fpsAvg: number;
  fpsP95: number;
  frameMs: number;
  frameMsAvg: number;
  hitchCount: number;
} {
  if (frameMs.length === 0) {
    return { fps: 0, fpsAvg: 0, fpsP95: 0, frameMs: 0, frameMsAvg: 0, hitchCount: 0 };
  }
  const latest = frameMs[frameMs.length - 1]!;
  let sum = 0;
  for (const ms of frameMs) sum += ms;
  const avg = sum / frameMs.length;
  const sorted = frameMs.slice().sort((a, b) => a - b);
  const p95 = percentile(sorted, 95);
  return {
    fps: latest > 0 ? 1000 / latest : 0,
    fpsAvg: avg > 0 ? 1000 / avg : 0,
    fpsP95: p95 > 0 ? 1000 / p95 : 0,
    frameMs: latest,
    frameMsAvg: avg,
    hitchCount: hitchTimes.length,
  };
}

export function resetFrameStats(): void {
  frameMs.length = 0;
  hitchTimes.length = 0;
  lastFrameNow = 0;
}
